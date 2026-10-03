import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { TrackerService } from '../tracker/tracker.service';
import { ECONOMY, SHOP_ITEMS } from '../common/utils/economy';

const TOKEN_DURATION_MS = 7 * 86400_000;

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private settings: SettingsService,
    private tracker: TrackerService,
  ) {}

  // ------------------------------------------------------------------ tâches planifiées

  /** Chaque heure : points bonus pour chaque torrent activement seedé. */
  @Cron(CronExpression.EVERY_HOUR)
  async accrueBonus() {
    const seeding = await this.prisma.$queryRaw<{ userId: string; n: bigint }[]>`
      SELECT "userId", COUNT(DISTINCT "torrentId") AS n FROM "Peer"
      WHERE "isSeeder" = true AND "lastAnnounceAt" > now() - interval '45 minutes'
      GROUP BY "userId"`;
    if (seeding.length === 0) return;
    await this.prisma.$transaction(seeding.map((s) => this.prisma.user.update({
      where: { id: s.userId },
      data: { bonusPoints: { increment: Math.min(Number(s.n), ECONOMY.bonusMaxTorrents) * ECONOMY.bonusPerTorrentHour } },
    })));
    this.logger.log(`Bonus crédité à ${seeding.length} membre(s)`);
  }

  /**
   * Toutes les 15 minutes : un torrent approuvé resté à 0 seeder pendant ECONOMY.deadAfterHours (délai de grâce,
   * pour ignorer les coupures courtes) passe automatiquement DEAD. `diedAt` sert ensuite à calculer la récompense
   * de reseed (voir TrackerService) — pas de récompense pour le passage à DEAD lui-même, juste pour celui qui le
   * relance ensuite, et seulement une fois confirmé que ça a vraiment servi.
   */
  @Cron('*/15 * * * *')
  async markDeadTorrents() {
    const cutoff = new Date(Date.now() - ECONOMY.deadAfterHours * 3600_000);
    const { count } = await this.prisma.torrent.updateMany({
      where: { status: 'APPROVED', seeders: 0, zeroSeedersSince: { lte: cutoff } },
      data: { status: 'DEAD', diedAt: new Date() },
    });
    if (count > 0) this.logger.log(`${count} torrent(s) passé(s) DEAD (0 seeder depuis plus de ${ECONOMY.deadAfterHours}h)`);
  }

  /**
   * Toutes les 30 minutes : confirme les récompenses de reseed en attente là où personne d'autre n'a encore fini de
   * télécharger, mais où le releveur a tenu le seed assez longtemps tout seul (voir TrackerService pour le détail
   * complet de la règle et son garde-fou anti-abus).
   */
  @Cron('*/30 * * * *')
  async confirmLongSeedReseedRewards() {
    await this.tracker.confirmLongSeedPendingRewards();
  }

  /** Chaque heure : détecte les « hit & run » (torrent complété, délai de grâce écoulé, seed insuffisant, plus de seed en cours). */
  @Cron('15 * * * *')
  async detectHitAndRun() {
    const cutoff = new Date(Date.now() - ECONOMY.hnrGraceHours * 3600_000);
    const candidates = await this.prisma.snatch.findMany({
      where: { satisfied: false, hnr: false, completedAt: { lt: cutoff } },
      take: 500,
      orderBy: { completedAt: 'asc' },
    });
    for (const s of candidates) {
      const seeding = await this.prisma.peer.count({ where: { userId: s.userId, torrentId: s.torrentId, isSeeder: true } });
      if (seeding > 0) continue; // il seede encore : on lui laisse le temps
      const torrent = await this.prisma.torrent.findUnique({ where: { id: s.torrentId }, select: { name: true, uploaderId: true } });
      if (!torrent || torrent.uploaderId === s.userId) {
        await this.prisma.snatch.update({ where: { id: s.id }, data: { satisfied: true } }); // torrent supprimé ou à lui : rien à régulariser
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.snatch.update({ where: { id: s.id }, data: { hnr: true } }),
        this.prisma.warning.create({
          data: {
            userId: s.userId,
            reason: `Hit & run : « ${torrent.name} » abandonné après ${Math.floor(s.seedSeconds / 3600)} h de seed (minimum ${ECONOMY.hnrSeedHours} h)`,
            issuedBy: 'Système',
          },
        }),
      ]);
      await this.notifications.notify({
        userId: s.userId,
        type: 'SYSTEM',
        title: 'Hit & run détecté',
        body: `Reprends le seed de « ${torrent.name} » jusqu'à ${ECONOMY.hnrSeedHours} h (ou un ratio de ${ECONOMY.hnrRatio} sur ce torrent) pour régulariser.`,
        link: '/hit-and-run',
      });
    }
  }

  /** Chaque nuit : supprime les jetons freeleech expirés. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanExpired() {
    await this.prisma.personalFreeleech.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  // ------------------------------------------------------------------ lecture

  async overview(userId: string) {
    const [user, seeding, hnrList, freeleechUntil] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { bonusPoints: true, freeleechTokens: true, uploaded: true, downloaded: true } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT "torrentId") AS n FROM "Peer" WHERE "userId" = ${userId} AND "isSeeder" = true AND "lastAnnounceAt" > now() - interval '45 minutes'`,
      this.prisma.snatch.findMany({ where: { userId, hnr: true, satisfied: false }, orderBy: { completedAt: 'desc' }, take: 50 }),
      this.settings.freeleechUntil(),
    ]);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const torrents = await this.prisma.torrent.findMany({ where: { id: { in: hnrList.map((h) => h.torrentId) } }, select: { id: true, name: true } });
    const names = new Map(torrents.map((t) => [t.id, t.name]));
    const seedingCount = Number(seeding[0]?.n ?? 0);

    return {
      points: user.bonusPoints,
      tokens: user.freeleechTokens,
      seedingCount,
      perHour: Math.min(seedingCount, ECONOMY.bonusMaxTorrents) * ECONOMY.bonusPerTorrentHour,
      freeleechUntil,
      rules: { hnrSeedHours: ECONOMY.hnrSeedHours, hnrRatio: ECONOMY.hnrRatio, hnrGraceHours: ECONOMY.hnrGraceHours, hnrLimit: ECONOMY.hnrLimit, ratioGraceGb: ECONOMY.ratioGraceGb },
      unresolved: hnrList.map((h) => ({
        id: h.id, torrentId: h.torrentId, name: names.get(h.torrentId) ?? '(torrent supprimé)',
        seedHours: Math.floor(h.seedSeconds / 3600), completedAt: h.completedAt,
      })),
      shop: SHOP_ITEMS,
    };
  }

  /**
   * « Mes seeds à terminer » : les torrents téléchargés dont l'obligation de seed (temps ou ratio) n'est pas encore remplie,
   * du plus urgent au moins urgent. `status` : hnr (déjà averti), idle (ne seede pas en ce moment), seeding (en cours).
   */
  async seedObligations(userId: string) {
    const snatches = await this.prisma.snatch.findMany({
      where: { userId, satisfied: false, torrent: { uploaderId: { not: userId } } },
      orderBy: { completedAt: 'desc' },
      take: 200,
      include: { torrent: { select: { id: true, name: true, size: true, coverImage: true, status: true } } },
    });
    const byTorrent = new Map<string, (typeof snatches)[number]>();
    for (const s of snatches) if (!byTorrent.has(s.torrentId)) byTorrent.set(s.torrentId, s); // le plus récent par torrent
    const list = [...byTorrent.values()];
    const peers = list.length
      ? await this.prisma.peer.findMany({ where: { userId, torrentId: { in: list.map((s) => s.torrentId) } }, select: { torrentId: true, isSeeder: true, uploaded: true, lastAnnounceAt: true } })
      : [];
    const required = ECONOMY.hnrSeedHours * 3600;
    const fresh = Date.now() - 45 * 60_000;
    const items = list.map((s) => {
      const mine = peers.filter((p) => p.torrentId === s.torrentId);
      const seedingNow = mine.some((p) => p.isSeeder && p.lastAnnounceAt.getTime() > fresh);
      const uploaded = mine.reduce((n, p) => n + Number(p.uploaded), 0);
      const size = Number(s.torrent.size);
      const status = s.hnr ? 'hnr' : seedingNow ? 'seeding' : 'idle';
      return {
        torrentId: s.torrentId, name: s.torrent.name, coverImage: s.torrent.coverImage, size,
        completedAt: s.completedAt, seedSeconds: s.seedSeconds, requiredSeconds: required,
        remainingSeconds: Math.max(0, required - s.seedSeconds),
        ratio: size > 0 ? Math.round((uploaded / size) * 100) / 100 : 0,
        deadline: new Date(s.completedAt.getTime() + ECONOMY.hnrGraceHours * 3600_000),
        status,
      };
    });
    const rank = { hnr: 0, idle: 1, seeding: 2 } as const;
    items.sort((a, b) => rank[a.status as keyof typeof rank] - rank[b.status as keyof typeof rank] || (a.status === 'seeding' ? a.remainingSeconds - b.remainingSeconds : a.deadline.getTime() - b.deadline.getTime()));
    return {
      rules: { hnrSeedHours: ECONOMY.hnrSeedHours, hnrRatio: ECONOMY.hnrRatio, hnrGraceHours: ECONOMY.hnrGraceHours },
      counts: { total: items.length, hnr: items.filter((i) => i.status === 'hnr').length, idle: items.filter((i) => i.status === 'idle').length, seeding: items.filter((i) => i.status === 'seeding').length },
      items,
    };
  }

  /**
   * Page « Mes seeds » : ce que le membre seede en ce moment et ce qu'il a téléchargé, avec le temps de seed cumulé et
   * l'état de l'obligation de partage (terminée, en cours, à relancer, hit & run).
   */
  async mySeeds(userId: string) {
    const fresh = new Date(Date.now() - 45 * 60_000);
    const [peers, snatches] = await Promise.all([
      this.prisma.peer.findMany({ where: { userId, isSeeder: true, lastAnnounceAt: { gt: fresh } }, select: { torrentId: true, uploaded: true } }),
      this.prisma.snatch.findMany({ where: { userId }, orderBy: { completedAt: 'desc' }, take: 400 }),
    ]);
    const lastByTorrent = new Map<string, (typeof snatches)[number]>();
    for (const s of snatches) if (!lastByTorrent.has(s.torrentId)) lastByTorrent.set(s.torrentId, s); // le plus récent par torrent
    const seedingNow = new Set(peers.map((p) => p.torrentId));
    const ids = [...new Set([...lastByTorrent.keys(), ...seedingNow])];
    const [torrents, allPeers] = await Promise.all([
      this.prisma.torrent.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, size: true, coverImage: true, uploaderId: true } }),
      this.prisma.peer.findMany({ where: { userId, torrentId: { in: ids } }, select: { torrentId: true, uploaded: true } }),
    ]);
    const uploadedBy = new Map<string, number>();
    for (const p of allPeers) uploadedBy.set(p.torrentId, (uploadedBy.get(p.torrentId) ?? 0) + Number(p.uploaded));
    const required = ECONOMY.hnrSeedHours * 3600;

    const items = torrents.map((t) => {
      const s = lastByTorrent.get(t.id);
      const size = Number(t.size);
      const now = seedingNow.has(t.id);
      const own = t.uploaderId === userId;
      // done : obligation remplie (ou effacée avec des points) · progress : en cours · idle : ne seede plus, à relancer · hnr · none : aucune obligation
      let state: 'done' | 'progress' | 'idle' | 'hnr' | 'none';
      if (own || !s) state = 'none';
      else if (s.satisfied) state = 'done';
      else if (s.hnr) state = 'hnr';
      else state = now ? 'progress' : 'idle';
      return {
        torrentId: t.id, name: t.name, coverImage: t.coverImage, size,
        seedingNow: now, state, own,
        cleared: !!s?.hnrClearedAt,
        completedAt: s?.completedAt ?? null,
        lastSeedAt: s?.lastSeedAt ?? null,
        seedSeconds: s?.seedSeconds ?? 0,
        requiredSeconds: required,
        remainingSeconds: s && !s.satisfied ? Math.max(0, required - s.seedSeconds) : 0,
        ratio: size > 0 ? Math.round(((uploadedBy.get(t.id) ?? 0) / size) * 100) / 100 : 0,
        deadline: s && !s.satisfied ? new Date(s.completedAt.getTime() + ECONOMY.hnrGraceHours * 3600_000) : null,
      };
    });
    const rank = { hnr: 0, idle: 1, progress: 2, done: 3, none: 4 } as const;
    items.sort((a, b) => Number(b.seedingNow) - Number(a.seedingNow) || rank[a.state] - rank[b.state] || (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
    const count = (st: string) => items.filter((i) => i.state === st).length;
    return {
      rules: { hnrSeedHours: ECONOMY.hnrSeedHours, hnrRatio: ECONOMY.hnrRatio, hnrGraceHours: ECONOMY.hnrGraceHours, bonusPerTorrentHour: ECONOMY.bonusPerTorrentHour },
      counts: { seeding: items.filter((i) => i.seedingNow).length, progress: count('progress') + count('idle') + count('hnr'), done: count('done'), hnr: count('hnr') },
      items,
    };
  }

  /** Prix pour effacer un hit & run avec des points : voir ECONOMY.hnrClearBase. */
  private async clearQuote(userId: string, s: { seedSeconds: number }) {
    const recent = await this.prisma.snatch.count({ where: { userId, hnrClearedAt: { gt: new Date(Date.now() - 30 * 86400_000) } } });
    const missingHours = Math.max(0, ECONOMY.hnrSeedHours - s.seedSeconds / 3600);
    const raw = ECONOMY.hnrClearBase + ECONOMY.hnrClearPerHour * missingHours + ECONOMY.hnrClearRepeat * recent;
    return { cost: Math.min(ECONOMY.hnrClearMax, Math.max(5, Math.round(raw / 5) * 5)), recent };
  }

  /** Page « Hit & run » : uniquement les hit & run confirmés (avertissement déjà envoyé), avec le prix pour les effacer. */
  async hitAndRuns(userId: string) {
    const [user, rows] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { bonusPoints: true } }),
      this.prisma.snatch.findMany({ where: { userId, hnr: true, satisfied: false }, orderBy: { completedAt: 'desc' }, take: 100, include: { torrent: { select: { id: true, name: true, size: true, coverImage: true } } } }),
    ]);
    const recent = await this.prisma.snatch.count({ where: { userId, hnrClearedAt: { gt: new Date(Date.now() - 30 * 86400_000) } } });
    const peers = rows.length ? await this.prisma.peer.findMany({ where: { userId, torrentId: { in: rows.map((r) => r.torrentId) } }, select: { torrentId: true, uploaded: true, isSeeder: true, lastAnnounceAt: true } }) : [];
    const required = ECONOMY.hnrSeedHours * 3600;
    const fresh = Date.now() - 45 * 60_000;
    const items = await Promise.all(rows.map(async (s) => {
      const mine = peers.filter((p) => p.torrentId === s.torrentId);
      const size = Number(s.torrent.size);
      const { cost } = await this.clearQuote(userId, s);
      return {
        id: s.id, torrentId: s.torrentId, name: s.torrent.name, coverImage: s.torrent.coverImage, size,
        completedAt: s.completedAt, seedSeconds: s.seedSeconds, requiredSeconds: required,
        remainingSeconds: Math.max(0, required - s.seedSeconds),
        ratio: size > 0 ? Math.round((mine.reduce((n, p) => n + Number(p.uploaded), 0) / size) * 100) / 100 : 0,
        seedingNow: mine.some((p) => p.isSeeder && p.lastAnnounceAt.getTime() > fresh),
        cost,
      };
    }));
    return {
      points: user?.bonusPoints ?? 0,
      rules: { hnrSeedHours: ECONOMY.hnrSeedHours, hnrRatio: ECONOMY.hnrRatio, hnrGraceHours: ECONOMY.hnrGraceHours, hnrLimit: ECONOMY.hnrLimit, clearBase: ECONOMY.hnrClearBase, clearPerHour: ECONOMY.hnrClearPerHour, clearRepeat: ECONOMY.hnrClearRepeat, clearMax: ECONOMY.hnrClearMax, bonusPerTorrentHour: ECONOMY.bonusPerTorrentHour },
      clearedRecently: recent,
      items,
    };
  }

  /** Efface un hit & run en payant : points débités, avertissement automatique retiré, plus rien à régulariser sur ce torrent. */
  async clearHitAndRun(userId: string, snatchId: string) {
    const snatch = await this.prisma.snatch.findFirst({ where: { id: snatchId, userId, hnr: true, satisfied: false }, include: { torrent: { select: { name: true } } } });
    if (!snatch) throw new NotFoundException('Hit & run introuvable (déjà régularisé ?)');
    const { cost } = await this.clearQuote(userId, snatch);
    await this.prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({ where: { id: userId, bonusPoints: { gte: cost } }, data: { bonusPoints: { decrement: cost } } });
      if (debited.count === 0) throw new BadRequestException(`Points bonus insuffisants : il t'en faut ${cost}`);
      const done = await tx.snatch.updateMany({ where: { id: snatch.id, hnr: true, satisfied: false }, data: { hnr: false, satisfied: true, hnrClearedAt: new Date() } });
      if (done.count === 0) throw new BadRequestException('Ce hit & run a déjà été régularisé'); // annule aussi le débit
      await tx.warning.deleteMany({ where: { userId, issuedBy: 'Système', reason: { startsWith: `Hit & run : « ${snatch.torrent.name} »` } } });
    });
    return { ok: true, cost };
  }

  // ------------------------------------------------------------------ transferts de points entre membres

  /** Envoie des points à un autre membre (par pseudo ou identifiant). Le montant est débité et crédité d'un seul coup. */
  async transfer(fromId: string, target: { userId?: string; username?: string }, amountRaw: unknown, messageRaw?: string) {
    const amount = Math.floor(Number(amountRaw));
    if (!Number.isFinite(amount) || amount < ECONOMY.transferMin) throw new BadRequestException(`Montant minimum : ${ECONOMY.transferMin} points`);
    if (ECONOMY.transferDailyMax <= 0) throw new BadRequestException('Les transferts de points sont désactivés');
    const found = target.userId
      ? await this.prisma.user.findUnique({ where: { id: target.userId }, select: { id: true, parentId: true, username: true, status: true } })
      : await this.prisma.user.findFirst({ where: { username: { equals: (target.username ?? '').trim(), mode: 'insensitive' } }, select: { id: true, parentId: true, username: true, status: true } });
    if (!found) throw new NotFoundException('Membre introuvable');
    // Un profil famille reçoit les points sur son compte principal.
    const toId = found.parentId ?? found.id;
    if (toId === fromId) throw new BadRequestException('Tu ne peux pas t\'envoyer des points à toi-même');
    const recipient = found.parentId ? await this.prisma.user.findUnique({ where: { id: toId }, select: { id: true, username: true, status: true } }) : found;
    if (!recipient || recipient.status !== 'ACTIVE') throw new BadRequestException('Ce membre ne peut pas recevoir de points');
    const sender = await this.prisma.user.findUnique({ where: { id: fromId }, select: { username: true } });
    const message = (messageRaw ?? '').trim().slice(0, 140) || null;

    const sentToday = await this.prisma.pointTransfer.aggregate({ where: { fromId, createdAt: { gt: new Date(Date.now() - 86400_000) } }, _sum: { amount: true } });
    const left = ECONOMY.transferDailyMax - (sentToday._sum.amount ?? 0);
    if (amount > left) throw new BadRequestException(left > 0 ? `Limite journalière : tu ne peux plus envoyer que ${left} points aujourd'hui` : 'Limite atteinte : tu as déjà envoyé le maximum de points ces dernières 24 h');

    await this.prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({ where: { id: fromId, bonusPoints: { gte: amount } }, data: { bonusPoints: { decrement: amount } } });
      if (debited.count === 0) throw new BadRequestException('Points bonus insuffisants');
      await tx.user.update({ where: { id: toId }, data: { bonusPoints: { increment: amount } } });
      await tx.pointTransfer.create({ data: { fromId, toId, amount, message } });
    });
    await this.notifications.notify({
      userId: toId, type: 'SYSTEM', title: `${sender?.username ?? 'Un membre'} t'a envoyé ${amount} points bonus`,
      body: message ?? 'Cadeau de points bonus', link: '/bonus',
    });
    return { ok: true, amount, to: recipient.username };
  }

  /** Derniers transferts envoyés et reçus, et ce qu'il reste à envoyer aujourd'hui. */
  async transfers(userId: string) {
    const [rows, sent] = await Promise.all([
      this.prisma.pointTransfer.findMany({ where: { OR: [{ fromId: userId }, { toId: userId }] }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.pointTransfer.aggregate({ where: { fromId: userId, createdAt: { gt: new Date(Date.now() - 86400_000) } }, _sum: { amount: true } }),
    ]);
    const people = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.fromId, r.toId]))] } }, select: { id: true, username: true } });
    const name = new Map(people.map((p) => [p.id, p.username]));
    return {
      min: ECONOMY.transferMin, dailyMax: ECONOMY.transferDailyMax, leftToday: Math.max(0, ECONOMY.transferDailyMax - (sent._sum.amount ?? 0)),
      items: rows.map((r) => {
        const out = r.fromId === userId;
        const other = out ? r.toId : r.fromId;
        return { id: r.id, direction: out ? 'out' : 'in', amount: r.amount, message: r.message, createdAt: r.createdAt, other: { id: other, username: name.get(other) ?? '(membre supprimé)' } };
      }),
    };
  }

  // ------------------------------------------------------------------ boutique

  async redeem(userId: string, itemId: string) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Article inconnu');

    // Débit atomique : ne passe que si le solde couvre le prix (deux clics simultanés ne peuvent pas dépenser deux fois).
    const debited = await this.prisma.user.updateMany({
      where: { id: userId, bonusPoints: { gte: item.cost } },
      data: { bonusPoints: { decrement: item.cost } },
    });
    if (debited.count === 0) throw new BadRequestException('Points bonus insuffisants');

    let code: string | undefined;
    try {
      if (item.id === 'upload_5gb') await this.prisma.user.update({ where: { id: userId }, data: { uploaded: { increment: 5_000_000_000n } } });
      else if (item.id === 'upload_20gb') await this.prisma.user.update({ where: { id: userId }, data: { uploaded: { increment: 20_000_000_000n } } });
      else if (item.id === 'freeleech_token') await this.prisma.user.update({ where: { id: userId }, data: { freeleechTokens: { increment: 1 } } });
      else if (item.id === 'invite') {
        code = randomBytes(16).toString('hex');
        await this.prisma.inviteCode.create({ data: { code, createdById: userId, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
      }
    } catch (err) {
      // L'effet a échoué : on rembourse.
      await this.prisma.user.update({ where: { id: userId }, data: { bonusPoints: { increment: item.cost } } });
      throw err;
    }
    return { ok: true, item: item.id, inviteCode: code };
  }

  async useToken(userId: string, torrentId: string) {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, freeleech: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    if (torrent.freeleech) throw new BadRequestException('Ce torrent est déjà freeleech pour tout le monde');
    const existing = await this.prisma.personalFreeleech.findUnique({ where: { userId_torrentId: { userId, torrentId } } });
    if (existing && existing.expiresAt > new Date()) throw new BadRequestException('Tu as déjà un jeton actif sur ce torrent');

    const spent = await this.prisma.user.updateMany({ where: { id: userId, freeleechTokens: { gte: 1 } }, data: { freeleechTokens: { decrement: 1 } } });
    if (spent.count === 0) throw new BadRequestException("Tu n'as aucun jeton freeleech (achète-en dans la boutique bonus)");
    const expiresAt = new Date(Date.now() + TOKEN_DURATION_MS);
    await this.prisma.personalFreeleech.upsert({
      where: { userId_torrentId: { userId, torrentId } },
      update: { expiresAt },
      create: { userId, torrentId, expiresAt },
    });
    return { expiresAt };
  }

  async tokenStatus(userId: string, torrentId: string) {
    const row = await this.prisma.personalFreeleech.findUnique({ where: { userId_torrentId: { userId, torrentId } } });
    return { activeUntil: row && row.expiresAt > new Date() ? row.expiresAt : null };
  }

  // ------------------------------------------------------------------ freeleech global (staff)

  /** Lance (ou arrête) un freeleech immédiat : soit pour N heures, soit jusqu'à une date précise. */
  async setGlobalFreeleech(input: { hours?: number | null; until?: string | null }) {
    const stopping = (input.hours === null || input.hours === undefined || input.hours <= 0) && !input.until;
    if (stopping) {
      await this.settings.set('freeleechUntil', null);
      return { freeleechUntil: null };
    }
    const until = input.until ? new Date(input.until) : new Date(Date.now() + Number(input.hours) * 3600_000);
    if (Number.isNaN(until.getTime())) throw new BadRequestException('Date invalide');
    if (until.getTime() <= Date.now()) throw new BadRequestException('La fin doit être dans le futur');
    if (until.getTime() - Date.now() > 31 * 86400_000) throw new BadRequestException('Durée maximale : 31 jours');
    await this.settings.set('freeleechUntil', until.toISOString());
    return { freeleechUntil: until };
  }

  // ------------------------------------------------------------------ événements freeleech programmés

  private parseEventDates(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Dates invalides');
    if (end <= start) throw new BadRequestException('La fin doit être après le début');
    if (end.getTime() - start.getTime() > 31 * 86400_000) throw new BadRequestException("Un événement dure 31 jours au maximum");
    return { start, end };
  }

  listEvents() {
    const from = new Date(Date.now() - 60 * 86400_000);
    return this.prisma.freeleechEvent.findMany({ where: { endsAt: { gt: from } }, orderBy: { startsAt: 'asc' }, take: 300 });
  }

  async createEvent(userId: string, data: { title: string; message?: string; startsAt: string; endsAt: string; announce?: boolean }) {
    const title = data.title?.trim();
    if (!title) throw new BadRequestException('Titre requis');
    const { start, end } = this.parseEventDates(data.startsAt, data.endsAt);
    if (end.getTime() <= Date.now()) throw new BadRequestException("Cet événement est déjà terminé");
    const event = await this.prisma.freeleechEvent.create({
      data: { title: title.slice(0, 120), message: data.message?.trim() || null, startsAt: start, endsAt: end, createdById: userId },
    });
    this.settings.invalidateFreeleech();

    if (data.announce) {
      const fmt = (d: Date) => d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Toronto' });
      const content = `[b]Du ${fmt(start)}\nau ${fmt(end)}[/b]\n\n${event.message ?? 'Les téléchargements ne comptent pas dans ton ratio pendant cet événement !'}`;
      await this.prisma.announcement.create({ data: { title: `🎉 ${event.title}`, content, pinned: false, authorId: userId } });
      await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `🎉 ${event.title}`, body: `Freeleech du ${fmt(start)} au ${fmt(end)}`, link: '/news' });
    }
    return event;
  }

  async updateEvent(id: string, data: { title?: string; message?: string | null; startsAt?: string; endsAt?: string }) {
    const current = await this.prisma.freeleechEvent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Événement introuvable');
    const { start, end } = this.parseEventDates(data.startsAt ?? current.startsAt.toISOString(), data.endsAt ?? current.endsAt.toISOString());
    const updated = await this.prisma.freeleechEvent.update({
      where: { id },
      data: {
        title: data.title?.trim() ? data.title.trim().slice(0, 120) : current.title,
        message: data.message !== undefined ? data.message?.trim() || null : current.message,
        startsAt: start, endsAt: end,
      },
    });
    this.settings.invalidateFreeleech();
    return updated;
  }

  async deleteEvent(id: string) {
    const removed = await this.prisma.freeleechEvent.delete({ where: { id } }).catch(() => null);
    if (!removed) throw new NotFoundException('Événement introuvable');
    this.settings.invalidateFreeleech();
    return removed;
  }
}
