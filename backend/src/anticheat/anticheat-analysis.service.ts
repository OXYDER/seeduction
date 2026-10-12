import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AntiCheatService } from './anticheat.service';
import { CheatSignal, imbalancePoints, ipNetwork, passkeySharingPoints, surgePoints } from '../common/utils/anticheat';

const GB = 1024 ** 3;
/** Au-delà de ce nombre de comptes sur une même adresse, c'est un VPN, un partage de connexion d'opérateur ou une résidence : on n'en tire rien. */
const MAX_COMPANIONS_PER_IP = 5;
/** Volume (Go sur 3 jours) échangé entre deux comptes de même adresse à partir duquel on parle de transferts entre comptes liés. */
const COLLUSION_MIN_GB = 5;

/**
 * Analyses qui ont besoin de recouper plusieurs membres ou plusieurs jours (impossible à l'announce) : chaque heure, sur le flux déclaré par torrent,
 * les adresses vues et les transferts de points. Chaque analyse isolée : l'échec de l'une ne bloque pas les autres.
 */
@Injectable()
export class AntiCheatAnalysisService {
  private readonly logger = new Logger(AntiCheatAnalysisService.name);
  private running = false;

  constructor(private prisma: PrismaService, private core: AntiCheatService) {}

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

  // ------------------------------------------------------------------ 1. recoupement du swarm

  /**
   * Sur un torrent, tout octet envoyé a été reçu par quelqu'un : la somme déclarée envoyée ne peut pas dépasser (aux annonces non encore faites près) la somme
   * reçue. Un excédent net est attribué aux envoyeurs au prorata de leur part. Pour ne pas accuser les seeders quand c'est un téléchargeur qui sous-déclare,
   * le « reçu » retenu est le plus grand de ce que le client déclare et de ce que la baisse de « left » prouve.
   */
  async swarmImbalance(): Promise<number> {
    const torrents = await this.prisma.$queryRaw<{ torrentId: string; up: number; down: number }[]>`
      SELECT "torrentId", SUM(up)::float8 AS up, SUM(GREATEST(down, got))::float8 AS down FROM "UserTorrentFlow"
      WHERE day >= current_date - 1 GROUP BY "torrentId"
      HAVING SUM(up) > 2e9 AND SUM(up) > 1.6 * SUM(GREATEST(down, got)) + 1e9 LIMIT 300`;
    if (torrents.length === 0) return 0;
    const ids = torrents.map((t) => t.torrentId);
    const rows = await this.prisma.$queryRaw<{ userId: string; torrentId: string; up: number }[]>`
      SELECT "userId", "torrentId", SUM(up)::float8 AS up FROM "UserTorrentFlow"
      WHERE day >= current_date - 1 AND "torrentId" IN (${Prisma.join(ids)}) GROUP BY "userId", "torrentId" HAVING SUM(up) >= 1e9`;
    const byTorrent = new Map(torrents.map((t) => [t.torrentId, t]));
    const perTorrent = new Map<string, { userId: string; up: number }[]>();
    for (const r of rows) perTorrent.set(r.torrentId, [...(perTorrent.get(r.torrentId) ?? []), { userId: r.userId, up: r.up }]);
    let n = 0;
    for (const [torrentId, list] of perTorrent) {
      const t = byTorrent.get(torrentId)!;
      // L'excès est d'abord réduit d'une marge (annonces pas encore faites, arrondis), puis réparti sur les plus gros envoyeurs d'abord :
      // un petit seeder honnête ne paie pas pour celui qui a gonflé le total.
      let remaining = t.up - t.down - (1 * GB + 0.05 * t.up);
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

  async ratioSurge(surgeGb: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ userId: string; recent: number; older: number; days: number; createdAt: Date }[]>`
      SELECT f."userId", u."createdAt",
        SUM(f.up) FILTER (WHERE f.day >= current_date - 1)::float8 AS recent,
        COALESCE(SUM(f.up) FILTER (WHERE f.day < current_date - 1), 0)::float8 AS older,
        COUNT(DISTINCT f.day) FILTER (WHERE f.day < current_date - 1)::int AS days
      FROM "UserTorrentFlow" f JOIN "User" u ON u.id = f."userId"
      WHERE f.day >= current_date - 30
      GROUP BY f."userId", u."createdAt"
      HAVING SUM(f.up) FILTER (WHERE f.day >= current_date - 1) >= ${surgeGb * GB}`;
    let n = 0;
    for (const r of rows) {
      const baseline = r.days >= 3 ? r.older / 28 : null;
      const ageDays = (Date.now() - new Date(r.createdAt).getTime()) / 86400_000;
      const points = surgePoints(r.recent, baseline, ageDays, surgeGb);
      if (points <= 0) continue;
      n += await this.emit(r.userId, {
        kind: 'RATIO_SURGE', points, torrentScoped: false,
        details: { upGb2d: round(r.recent / GB), baselineGbPerDay: baseline === null ? null : round(baseline / GB), factor: baseline ? round(r.recent / 2 / baseline) : null, accountDays: Math.round(ageDays) },
      }, null);
    }
    return n;
  }

  // ------------------------------------------------------------------ 3. passkey partagée

  async passkeySharing(threshold: number): Promise<number> {
    const rows = await this.prisma.userIp.findMany({ where: { lastSeenAt: { gte: new Date(Date.now() - 6 * 3600_000) } }, select: { userId: true, ip: true } });
    const nets = new Map<string, Map<string, string[]>>();
    for (const r of rows) {
      const per = nets.get(r.userId) ?? new Map<string, string[]>();
      const net = ipNetwork(r.ip);
      per.set(net, [...(per.get(net) ?? []), r.ip]);
      nets.set(r.userId, per);
    }
    let n = 0;
    for (const [userId, per] of nets) {
      const points = passkeySharingPoints(per.size, threshold);
      if (points <= 0) continue;
      n += await this.emit(userId, { kind: 'PASSKEY_SHARING', points, torrentScoped: false, details: { networks: per.size, ips: [...per.values()].map((l) => l[0]).slice(0, 12), windowHours: 6 } }, null, 12);
    }
    return n;
  }

  // ------------------------------------------------------------------ 4. comptes liés (même adresse) et transferts entre eux

  /** Paires de comptes vus depuis la même adresse ces 30 derniers jours (hors adresses trop partagées). */
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
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    let n = 0;
    for (const g of groups) {
      for (const u of g.users) {
        const others = g.users.filter((x) => x !== u).map((x) => names.get(x) ?? x);
        n += await this.emit(u, { kind: 'SHARED_IP', points: 6, torrentScoped: false, details: { ip: g.ip, others } }, null, 72);
      }
    }

    // Transferts entre comptes liés : ce que l'un déclare envoyer à l'autre sur les mêmes torrents, sur 3 jours.
    const pairs = new Set<string>();
    for (const g of groups) for (const a of g.users) for (const b of g.users) if (a < b) pairs.add(`${a}|${b}`);
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
    const tinfo = tIds.length ? new Map((await this.prisma.torrent.findMany({ where: { id: { in: tIds } }, select: { id: true, freeleech: true, doubleUpload: true } })).map((t) => [t.id, t])) : new Map();
    for (const key of pairs) {
      const [a, b] = key.split('|');
      const dir = (from: string, to: string) => {
        let bytes = 0; let boosted = 0;
        const fm = byUser.get(from), tm = byUser.get(to);
        if (!fm || !tm) return { bytes, boosted };
        for (const [tid, f] of fm) {
          const t = tm.get(tid);
          if (!t) continue;
          const moved = Math.min(f.up, t.down);
          bytes += moved;
          const info = tinfo.get(tid);
          if (info?.freeleech || info?.doubleUpload) boosted += moved;
        }
        return { bytes, boosted };
      };
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const d = dir(from, to);
        if (d.bytes < COLLUSION_MIN_GB * GB) continue;
        const boostedShare = d.boosted / d.bytes;
        const scale = 1 + (boostedShare >= 0.5 ? 0.3 : 0);
        const base = Math.min(60, Math.round(30 + 8 * Math.log2(d.bytes / (COLLUSION_MIN_GB * GB) + 1)));
        const detailsBase = { gb: round(d.bytes / GB), boostedPercent: Math.round(boostedShare * 100), windowDays: 3 };
        n += await this.emit(from, { kind: 'ACCOUNT_COLLUSION', points: Math.round(base * scale), torrentScoped: false, details: { ...detailsBase, role: 'envoyeur', partner: names.get(to) ?? to } }, null, 20);
        n += await this.emit(to, { kind: 'ACCOUNT_COLLUSION', points: Math.round(base * 0.6 * scale), torrentScoped: false, details: { ...detailsBase, role: 'destinataire', partner: names.get(from) ?? from } }, null, 20);
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
    const [ips, users] = await Promise.all([
      this.prisma.userIp.findMany({ where: { userId: { in: ids }, lastSeenAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, select: { userId: true, ip: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, createdAt: true } }),
    ]);
    const ipsOf = new Map<string, Set<string>>();
    for (const r of ips) ipsOf.set(r.userId, (ipsOf.get(r.userId) ?? new Set()).add(r.ip));
    const popular = new Map<string, number>();
    for (const r of ips) popular.set(r.ip, (popular.get(r.ip) ?? 0) + 1);
    const linked = (a: string, b: string) => [...(ipsOf.get(a) ?? [])].some((ip) => (popular.get(ip) ?? 0) <= MAX_COMPANIONS_PER_IP && ipsOf.get(b)?.has(ip));
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
