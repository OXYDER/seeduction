import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AntiCheatService } from './anticheat.service';
import { CheatSignal, collusionPoints, expectedTransfer, imbalancePoints, ipNetwork, passkeySharingPoints, surgePoints } from '../common/utils/anticheat';

const GB = 1024 ** 3;
/** Au-delà de ce nombre de comptes sur une même adresse, c'est un VPN, un partage de connexion d'opérateur ou une résidence : on n'en tire rien. */
const MAX_COMPANIONS_PER_IP = 5;

/**
 * Analyses qui ont besoin de recouper plusieurs membres ou plusieurs jours (impossible à l'announce) : chaque heure, sur le flux déclaré par torrent,
 * les adresses vues et les transferts de points. Chaque analyse isolée : l'échec de l'une ne bloque pas les autres.
 *
 * Elles tiennent compte de ce qui explique légitimement un chiffre élevé : un upload que des receveurs confirment n'est pas suspect, un échange entre proches (invitation, famille)
 * n'est pas une ferme de ratio, un transfert ne vaut de l'alerte que s'il fabrique du ratio à partir de rien (freeleech, double upload, cadeau de bienvenue), une seedbox déclarée explique plusieurs réseaux.
 */
@Injectable()
export class AntiCheatAnalysisService {
  private readonly logger = new Logger(AntiCheatAnalysisService.name);
  private running = false;

  constructor(private prisma: PrismaService, private core: AntiCheatService, private settings: SettingsService) {}

  @Cron('7 * * * *')
  async hourly() {
    await this.runAll();
  }

  @Cron('15 */6 * * *')
  async rescoreAll() {
    try { await this.core.rescoreActive(); } catch (e: any) { this.logger.warn(`Recalcul périodique impossible : ${e?.message ?? e}`); }
  }

  @Cron('30 4 * * *')
  async cleanup() {
    try {
      await this.prisma.$executeRaw`DELETE FROM "UserTorrentFlow" WHERE day < current_date - 35`;
      await this.prisma.$executeRaw`DELETE FROM "CheatEvent" WHERE "lastAt" < now() - interval '120 days'`;
      await this.prisma.$executeRaw`DELETE FROM "UserIp" WHERE "lastSeenAt" < now() - interval '180 days'`;
    } catch (e: any) { this.logger.warn(`Nettoyage anti-triche impossible : ${e?.message ?? e}`); }
    // Apprentissage : les dossiers innocentés ou sanctionnés règlent le poids de chaque type de signal.
    try { await this.core.learnWeights(); } catch (e: any) { this.logger.warn(`Apprentissage anti-triche impossible : ${e?.message ?? e}`); }
  }

  /** Lance toutes les analyses ; renvoie le nombre de signaux enregistrés. Les dossiers concernés sont recalculés par `record`. */
  async runAll(): Promise<{ signals: number; ms: number }> {
    if (this.running) return { signals: 0, ms: 0 };
    this.running = true;
    const started = Date.now();
    let signals = 0;
    try {
      const cfg = await this.core.config();
      if (!cfg.enabled) return { signals: 0, ms: 0 };
      const steps: [string, () => Promise<number>][] = [
        ['déséquilibre de swarm', () => this.swarmImbalance()],
        ['envolée du ratio', () => this.ratioSurge(cfg.surgeGb)],
        ['passkey partagée', () => this.passkeySharing(cfg.passkeyNetworks)],
        ['comptes liés', () => this.linkedAccounts()],
        ['points bonus', () => this.pointFunnels(cfg.pointsLaunder)],
      ];
      for (const [name, fn] of steps) {
        try { signals += await fn(); } catch (e: any) { this.logger.warn(`Analyse « ${name} » impossible : ${e?.message ?? e}`); }
      }
    } finally { this.running = false; }
    const ms = Date.now() - started;
    if (signals) this.logger.log(`Anti-triche : ${signals} signal(aux) enregistré(s) en ${ms} ms`);
    return { signals, ms };
  }

  private async emit(userId: string, signal: CheatSignal, torrentId?: string | null, dedupeHours = 20) {
    return this.core.record(userId, [signal], { torrentId: torrentId ?? undefined, dedupeHours, bump: false });
  }

  /** Comptes proches l'un de l'autre « par construction » (l'un a invité l'autre, même compte famille) : un foyer, pas une ferme de comptes. */
  private async relatedPairs(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, invitedById: true, parentId: true } });
    const set = new Set<string>();
    const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const ids = new Set(userIds);
    for (const r of rows) {
      if (r.invitedById && ids.has(r.invitedById)) set.add(key(r.id, r.invitedById));
      if (r.parentId && ids.has(r.parentId)) set.add(key(r.id, r.parentId));
    }
    for (const a of rows) for (const b of rows) if (a.id < b.id && a.parentId && a.parentId === b.parentId) set.add(key(a.id, b.id));
    return set;
  }

  // ------------------------------------------------------------------ 1. recoupement du swarm

  /**
   * Sur un torrent, tout octet envoyé a été reçu par quelqu'un : la somme déclarée envoyée ne peut pas dépasser (aux annonces non encore faites près) la somme
   * reçue. Un excédent net est attribué aux envoyeurs au prorata de leur part. Pour ne pas accuser les seeders quand c'est un téléchargeur qui sous-déclare,
   * le « reçu » retenu est le plus grand de ce que le client déclare et de ce que la baisse de « left » prouve. Marge généreuse : des receveurs non suivis (annonces
   * qui échouent, décalage entre deux announces) créent de petits écarts honnêtes.
   */
  async swarmImbalance(): Promise<number> {
    const torrents = await this.prisma.$queryRaw<{ torrentId: string; up: number; down: number }[]>`
      SELECT "torrentId", SUM(up)::float8 AS up, SUM(GREATEST(down, got))::float8 AS down FROM "UserTorrentFlow"
      WHERE day >= current_date - 1 GROUP BY "torrentId"
      HAVING SUM(up) > 3e9 AND SUM(up) > 1.8 * SUM(GREATEST(down, got)) + 1.5e9 LIMIT 300`;
    if (torrents.length === 0) return 0;
    const ids = torrents.map((t) => t.torrentId);
    const rows = await this.prisma.$queryRaw<{ userId: string; torrentId: string; up: number }[]>`
      SELECT f."userId", f."torrentId", SUM(f.up)::float8 AS up FROM "UserTorrentFlow" f JOIN "User" u ON u.id = f."userId"
      WHERE f.day >= current_date - 1 AND f."torrentId" IN (${Prisma.join(ids)}) AND u."profileType" <> 'BOT' GROUP BY f."userId", f."torrentId" HAVING SUM(f.up) >= 1e9`;
    const byTorrent = new Map(torrents.map((t) => [t.torrentId, t]));
    const perTorrent = new Map<string, { userId: string; up: number }[]>();
    for (const r of rows) perTorrent.set(r.torrentId, [...(perTorrent.get(r.torrentId) ?? []), { userId: r.userId, up: r.up }]);
    let n = 0;
    for (const [torrentId, list] of perTorrent) {
      const t = byTorrent.get(torrentId)!;
      // L'excès est d'abord réduit d'une marge (annonces pas encore faites, arrondis), puis réparti sur les plus gros envoyeurs d'abord :
      // un petit seeder honnête ne paie pas pour celui qui a gonflé le total.
      let remaining = t.up - t.down - (1.5 * GB + 0.08 * t.up);
      for (const r of list.sort((a, b) => b.up - a.up)) {
        if (remaining <= 0) break;
        const attributable = Math.min(r.up, remaining);
        remaining -= attributable;
        const points = imbalancePoints(attributable / GB);
        if (points <= 0) continue;
        n += await this.emit(r.userId, {
          kind: 'SWARM_IMBALANCE', points, torrentScoped: true,
          details: { torrentId, upGb: round(r.up / GB), swarmUpGb: round(t.up / GB), swarmReceivedGb: round(t.down / GB), attributableGb: round(attributable / GB) },
        }, torrentId);
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ 2. envolée du ratio

  /**
   * Un gros volume envoyé n'est suspect que s'il n'est pas confirmé par des receveurs : sur chaque torrent, la part de l'upload que les téléchargeurs du même torrent n'ont pas reçue.
   * Un seeder sur ligne rapide qui sert une sortie très demandée (freeleech, double upload...) envoie énormément, mais tout est reçu : rien à signaler.
   */
  async ratioSurge(surgeGb: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ userId: string; recent: number; unconfirmed: number; older: number; days: number; createdAt: Date }[]>`
      WITH tor AS (
        SELECT "torrentId", SUM(up)::float8 AS up, SUM(GREATEST(down, got))::float8 AS down FROM "UserTorrentFlow" WHERE day >= current_date - 1 GROUP BY "torrentId"
      )
      SELECT f."userId", u."createdAt",
        SUM(f.up) FILTER (WHERE f.day >= current_date - 1)::float8 AS recent,
        COALESCE(SUM(f.up * (1 - LEAST(1, tor.down * 1.15 / NULLIF(tor.up, 0)))) FILTER (WHERE f.day >= current_date - 1), 0)::float8 AS unconfirmed,
        COALESCE(SUM(f.up) FILTER (WHERE f.day < current_date - 1), 0)::float8 AS older,
        COUNT(DISTINCT f.day) FILTER (WHERE f.day < current_date - 1)::int AS days
      FROM "UserTorrentFlow" f JOIN "User" u ON u.id = f."userId" LEFT JOIN tor ON tor."torrentId" = f."torrentId"
      WHERE f.day >= current_date - 30 AND u."profileType" <> 'BOT'
      GROUP BY f."userId", u."createdAt"
      HAVING SUM(f.up) FILTER (WHERE f.day >= current_date - 1) >= ${surgeGb * GB}`;
    let n = 0;
    for (const r of rows) {
      const baseline = r.days >= 3 ? r.older / 28 : null;
      const ageDays = (Date.now() - new Date(r.createdAt).getTime()) / 86400_000;
      // Seul l'upload sans receveur compte : le reste est confirmé par ceux qui l'ont reçu.
      const points = surgePoints(r.unconfirmed, baseline, ageDays, surgeGb * 0.5);
      if (points <= 0) continue;
      n += await this.emit(r.userId, {
        kind: 'RATIO_SURGE', points, torrentScoped: false,
        details: { upGb2d: round(r.recent / GB), unconfirmedGb: round(r.unconfirmed / GB), confirmedGb: round((r.recent - r.unconfirmed) / GB), baselineGbPerDay: baseline === null ? null : round(baseline / GB), factor: baseline ? round(r.unconfirmed / 2 / baseline) : null, accountDays: Math.round(ageDays) },
      }, null);
    }
    return n;
  }

  // ------------------------------------------------------------------ 3. passkey partagée

  /**
   * Plusieurs réseaux en quelques heures, c'est aussi un téléphone qui change d'antenne, un VPN qui saute de serveur, un voyage : seul l'usage SIMULTANÉ depuis plusieurs réseaux
   * (deux annonces actives en même temps depuis des réseaux distincts) évoque une passkey partagée. Un membre qui a déclaré une seedbox est attendu sur deux réseaux.
   */
  async passkeySharing(threshold: number): Promise<number> {
    const rows = await this.prisma.userIp.findMany({ where: { lastSeenAt: { gte: new Date(Date.now() - 6 * 3600_000) } }, select: { userId: true, ip: true } });
    const nets = new Map<string, Map<string, string[]>>();
    for (const r of rows) {
      const per = nets.get(r.userId) ?? new Map<string, string[]>();
      const net = ipNetwork(r.ip);
      per.set(net, [...(per.get(net) ?? []), r.ip]);
      nets.set(r.userId, per);
    }
    const candidates = [...nets].filter(([, per]) => passkeySharingPoints(per.size, threshold) > 0).map(([u]) => u);
    if (candidates.length === 0) return 0;
    const [live, boxes] = await Promise.all([
      this.prisma.peer.findMany({ where: { userId: { in: candidates }, lastAnnounceAt: { gte: new Date(Date.now() - 45 * 60_000) } }, select: { userId: true, ip: true } }),
      this.prisma.memberSeedbox.findMany({ where: { userId: { in: candidates } }, select: { userId: true } }),
    ]);
    const concurrent = new Map<string, Set<string>>();
    for (const p of live) concurrent.set(p.userId, (concurrent.get(p.userId) ?? new Set()).add(ipNetwork(p.ip)));
    const withBox = new Set(boxes.map((b) => b.userId));
    let n = 0;
    for (const userId of candidates) {
      if (withBox.has(userId)) continue;
      const per = nets.get(userId)!;
      let points = passkeySharingPoints(per.size, threshold);
      const simultaneous = concurrent.get(userId)?.size ?? 0;
      if (simultaneous < 2) points = Math.round(points * 0.25); // changements de réseau successifs : mobile, VPN, déplacement
      if (points <= 0) continue;
      n += await this.emit(userId, { kind: 'PASSKEY_SHARING', points, torrentScoped: false, details: { networks: per.size, simultaneousNetworks: simultaneous, ips: [...per.values()].map((l) => l[0]).slice(0, 12), windowHours: 6, ...(simultaneous < 2 ? { note: 'Réseaux successifs, pas simultanés : probablement mobile, VPN ou déplacement' } : {}) } }, null, 12);
    }
    return n;
  }

  // ------------------------------------------------------------------ 4. comptes liés (même adresse) et transferts entre eux

  /** Groupes de comptes vus depuis la même adresse ces 30 derniers jours (hors adresses trop partagées). */
  private async sharedIpPairs() {
    const groups = await this.prisma.$queryRaw<{ ip: string; users: string[] }[]>`
      SELECT ip, array_agg(DISTINCT "userId") AS users FROM "UserIp" WHERE "lastSeenAt" > now() - interval '30 days'
      GROUP BY ip HAVING COUNT(DISTINCT "userId") BETWEEN 2 AND ${MAX_COMPANIONS_PER_IP}`;
    return groups;
  }

  async linkedAccounts(): Promise<number> {
    const groups = await this.sharedIpPairs();
    if (groups.length === 0) return 0;
    const userIds = [...new Set(groups.flatMap((g) => g.users))];
    const [users, related] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, profileType: true, freeleechUntil: true } }),
      this.relatedPairs(userIds),
    ]);
    const names = new Map(users.map((u) => [u.id, u.username]));
    const bots = new Set(users.filter((u) => u.profileType === 'BOT').map((u) => u.id));
    const isRelated = (a: string, b: string) => related.has(a < b ? `${a}|${b}` : `${b}|${a}`);

    let n = 0;
    for (const g of groups) {
      for (const u of g.users) {
        if (bots.has(u)) continue;
        // Un foyer partage une connexion : si le compte a un « proche » parmi les autres (invité, famille), ce n'est pas un indice ; sinon un petit indice, qui compte moins quand l'adresse est très partagée.
        const others = g.users.filter((x) => x !== u);
        if (others.every((o) => isRelated(u, o) || bots.has(o))) continue;
        n += await this.emit(u, { kind: 'SHARED_IP', points: others.length >= 2 ? 3 : 5, torrentScoped: false, details: { ip: g.ip, others: others.map((x) => names.get(x) ?? x) } }, null, 72);
      }
    }

    // Transferts entre comptes liés : ce que l'un déclare envoyer à l'autre sur les mêmes torrents, sur 3 jours.
    const pairs = new Set<string>();
    for (const g of groups) for (const a of g.users) for (const b of g.users) if (a < b && !bots.has(a) && !bots.has(b)) pairs.add(`${a}|${b}`);
    if (pairs.size === 0) return n;
    const flows = await this.prisma.$queryRaw<{ userId: string; torrentId: string; up: number; down: number }[]>`
      SELECT "userId", "torrentId", SUM(up)::float8 AS up, SUM(GREATEST(down, got))::float8 AS down FROM "UserTorrentFlow"
      WHERE day >= current_date - 2 AND "userId" IN (${Prisma.join(userIds)}) GROUP BY "userId", "torrentId"`;
    const byUser = new Map<string, Map<string, { up: number; down: number }>>();
    for (const f of flows) {
      const m = byUser.get(f.userId) ?? new Map();
      m.set(f.torrentId, { up: f.up, down: f.down });
      byUser.set(f.userId, m);
    }
    const tIds = [...new Set(flows.map((f) => f.torrentId))];
    const [tinfo, swarm, personal, freeUntil, doubleOn] = await Promise.all([
      tIds.length ? this.prisma.torrent.findMany({ where: { id: { in: tIds } }, select: { id: true, freeleech: true, doubleUpload: true } }) : Promise.resolve([] as { id: string; freeleech: boolean; doubleUpload: boolean }[]),
      tIds.length ? this.prisma.$queryRaw<{ torrentId: string; down: number }[]>`
        SELECT "torrentId", SUM(GREATEST(down, got))::float8 AS down FROM "UserTorrentFlow" WHERE day >= current_date - 2 AND "torrentId" IN (${Prisma.join(tIds)}) GROUP BY "torrentId"` : Promise.resolve([] as { torrentId: string; down: number }[]),
      this.prisma.personalFreeleech.findMany({ where: { userId: { in: userIds }, torrentId: { in: tIds }, expiresAt: { gt: new Date() } }, select: { userId: true, torrentId: true } }),
      this.settings.freeleechUntil(),
      this.settings.doubleUploadActive(),
    ]);
    const tmap = new Map(tinfo.map((t) => [t.id, t]));
    const swarmDown = new Map(swarm.map((s) => [s.torrentId, s.down]));
    const tokens = new Set(personal.map((p) => `${p.userId}|${p.torrentId}`));
    const accountFree = new Map(users.map((u) => [u.id, !!u.freeleechUntil && u.freeleechUntil > new Date()]));

    for (const key of pairs) {
      const [a, b] = key.split('|');
      /** Octets que `from` a probablement envoyés à `to`, séparés en « boostés » (ratio fabriqué : freeleech, double upload) et ordinaires. */
      const dir = (from: string, to: string) => {
        let boosted = 0, plain = 0;
        const fm = byUser.get(from), tm = byUser.get(to);
        if (!fm || !tm) return { boosted, plain };
        for (const [tid, f] of fm) {
          const t = tm.get(tid);
          if (!t) continue;
          const moved = expectedTransfer(f.up, t.down, swarmDown.get(tid) ?? t.down);
          if (moved <= 0) continue;
          const info = tmap.get(tid);
          const boost = !!info?.freeleech || !!info?.doubleUpload || !!freeUntil || doubleOn || accountFree.get(to) === true || tokens.has(`${to}|${tid}`);
          if (boost) boosted += moved; else plain += moved;
        }
        return { boosted, plain };
      };
      const ab = dir(a, b), ba = dir(b, a);
      // Échanges dans les deux sens, du même ordre de grandeur et sans ratio fabriqué : des proches qui se partagent des fichiers, pas une ferme.
      const small = Math.min(ab.boosted + ab.plain, ba.boosted + ba.plain), big = Math.max(ab.boosted + ab.plain, ba.boosted + ba.plain);
      const reciprocal = small >= 5 * GB && small / big >= 0.5 && ab.boosted + ba.boosted < 0.3 * (ab.boosted + ab.plain + ba.boosted + ba.plain);
      if (reciprocal) continue;
      const kin = isRelated(a, b) ? 0.5 : 1;
      for (const [from, to, d] of [[a, b, ab], [b, a, ba]] as const) {
        const base = collusionPoints(d.boosted, d.plain);
        if (base <= 0) continue;
        const total = d.boosted + d.plain;
        const detailsBase = { gb: round(total / GB), boostedGb: round(d.boosted / GB), boostedPercent: Math.round((d.boosted / total) * 100), windowDays: 3, ...(kin < 1 ? { note: 'Comptes proches (invitation ou famille) : indice allégé' } : {}) };
        n += await this.emit(from, { kind: 'ACCOUNT_COLLUSION', points: Math.round(base * kin), torrentScoped: false, details: { ...detailsBase, role: 'envoyeur', partner: names.get(to) ?? to } }, null, 20);
        n += await this.emit(to, { kind: 'ACCOUNT_COLLUSION', points: Math.round(base * 0.6 * kin), torrentScoped: false, details: { ...detailsBase, role: 'destinataire', partner: names.get(from) ?? from } }, null, 20);
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ 5. points bonus

  async pointFunnels(threshold: number): Promise<number> {
    const since = new Date(Date.now() - 7 * 86400_000);
    const transfers = await this.prisma.pointTransfer.findMany({ where: { createdAt: { gte: since } }, select: { fromId: true, toId: true, amount: true }, take: 5000 });
    if (transfers.length === 0) return 0;
    const ids = [...new Set(transfers.flatMap((t) => [t.fromId, t.toId]))];
    const [ips, users, related] = await Promise.all([
      this.prisma.userIp.findMany({ where: { userId: { in: ids }, lastSeenAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, select: { userId: true, ip: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, createdAt: true } }),
      this.relatedPairs(ids),
    ]);
    const ipsOf = new Map<string, Set<string>>();
    for (const r of ips) ipsOf.set(r.userId, (ipsOf.get(r.userId) ?? new Set()).add(r.ip));
    const popular = new Map<string, number>();
    for (const r of ips) popular.set(r.ip, (popular.get(r.ip) ?? 0) + 1);
    // Deux comptes « liés » partagent une adresse peu partagée, sans être de la même famille ou parrain / filleul (un foyer qui s'offre des points n'est pas un blanchiment).
    const linked = (a: string, b: string) => !related.has(a < b ? `${a}|${b}` : `${b}|${a}`) && [...(ipsOf.get(a) ?? [])].some((ip) => (popular.get(ip) ?? 0) <= MAX_COMPANIONS_PER_IP && ipsOf.get(b)?.has(ip));
    const info = new Map(users.map((u) => [u.id, u]));
    const young = (id: string) => { const u = info.get(id); return !!u && Date.now() - u.createdAt.getTime() < 14 * 86400_000; };

    const received = new Map<string, { total: number; linkedTotal: number; youngTotal: number; senders: Set<string>; linkedSenders: Set<string> }>();
    for (const t of transfers) {
      const r = received.get(t.toId) ?? { total: 0, linkedTotal: 0, youngTotal: 0, senders: new Set(), linkedSenders: new Set() };
      r.total += t.amount;
      r.senders.add(t.fromId);
      if (linked(t.fromId, t.toId)) { r.linkedTotal += t.amount; r.linkedSenders.add(t.fromId); }
      if (young(t.fromId)) r.youngTotal += t.amount;
      received.set(t.toId, r);
    }
    let n = 0;
    for (const [to, r] of received) {
      const linkedHit = r.linkedTotal >= threshold;
      const funnelHit = r.senders.size >= 4 && r.youngTotal >= threshold;
      if (!linkedHit && !funnelHit) continue;
      const basis = Math.max(r.linkedTotal, r.youngTotal);
      const points = Math.min(60, Math.round(30 + 6 * Math.log2(basis / threshold + 1)));
      const details = { receivedPoints: Math.round(r.total), fromLinkedAccounts: Math.round(r.linkedTotal), fromNewAccounts: Math.round(r.youngTotal), senders: r.senders.size, windowDays: 7 };
      n += await this.emit(to, { kind: 'POINT_LAUNDERING', points, torrentScoped: false, details: { ...details, role: 'destinataire' } }, null, 20);
      for (const s of r.linkedSenders) n += await this.emit(s, { kind: 'POINT_LAUNDERING', points: Math.round(points * 0.6), torrentScoped: false, details: { ...details, role: 'envoyeur', partner: info.get(to)?.username } }, null, 20);
    }
    return n;
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
