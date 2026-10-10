import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { UsersService } from '../users/users.service';
import { BadgesService } from '../badges/badges.service';
import { AdultService } from '../adult/adult.service';
import { PresenceService } from '../presence/presence.service';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService, private usersService: UsersService, private badges: BadgesService, private adult: AdultService, private presence: PresenceService) {}

  async globalStats() {
    const [totalUsers, totalTorrents, totalSeeders, totalLeechers, totalCompleted] = await Promise.all([
      this.prisma.user.count({ where: { parentId: null } }),
      this.prisma.torrent.count({ where: { status: 'APPROVED' } }),
      this.prisma.peer.count({ where: { isSeeder: true } }),
      this.prisma.peer.count({ where: { isSeeder: false } }),
      this.prisma.snatch.count(),
    ]);
    const totalSizeAgg = await this.prisma.torrent.aggregate({ _sum: { size: true } });
    const trafficAgg = await this.prisma.user.aggregate({ _sum: { uploaded: true, downloaded: true } });
    const totalTraffic = (trafficAgg._sum.uploaded ?? 0n) + (trafficAgg._sum.downloaded ?? 0n);

    return {
      totalUsers,
      totalTorrents,
      totalSeeders,
      totalLeechers,
      totalPeers: totalSeeders + totalLeechers,
      totalCompleted,
      totalSize: totalSizeAgg._sum.size ?? 0n,
      totalTraffic,
      // membres connectés en ce moment (ceux qui apparaissent hors ligne ne sont pas comptés)
      online: this.presence.listOnline().length,
    };
  }

  /** Chiffres supplémentaires de la page Statistiques : activité, répartitions, classements, économie. */
  private async extraStats(visible: object, days: number) {
    const approved = { status: 'APPROVED' as const, ...visible };
    const since = (days: number) => new Date(Date.now() - days * 86400_000);
    const [
      comments, collections, forumPosts, forumTopics, favorites, messages, friendships, requestsOpen, requestsFilled,
      newMembersWeek, uploadsWeek, uploadsMonth, snatchesPerDay, commentsPerDay, byResolution, byLanguage, uploaders, seedersNow,
      commented, biggest, classes, roles, bonus, avgRatio, hnrOpen, activeNow,
    ] = await Promise.all([
      this.prisma.torrentComment.count(),
      this.prisma.collection.count(),
      this.prisma.forumPost.count(),
      this.prisma.forumTopic.count(),
      this.prisma.favorite.count(),
      this.prisma.message.count({ where: { type: { not: 'SYSTEM' }, deletedAt: null } }),
      this.prisma.friendship.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.torrentRequest.count({ where: { filledById: null } }),
      this.prisma.torrentRequest.count({ where: { filledById: { not: null } } }),
      this.prisma.user.count({ where: { parentId: null, createdAt: { gt: since(7) } } }),
      this.prisma.torrent.count({ where: { ...approved, createdAt: { gt: since(7) } } }),
      this.prisma.torrent.count({ where: { ...approved, createdAt: { gt: since(30) } } }),
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', "completedAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Snatch"
        WHERE "completedAt" > now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "TorrentComment"
        WHERE "createdAt" > now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`,
      this.prisma.torrent.groupBy({ by: ['resolution'], where: { ...approved, resolution: { not: null } }, _count: { _all: true }, orderBy: { _count: { resolution: 'desc' } }, take: 8 }),
      this.prisma.torrent.groupBy({ by: ['language'], where: { ...approved, language: { not: null } }, _count: { _all: true }, orderBy: { _count: { language: 'desc' } }, take: 8 }),
      this.prisma.torrent.groupBy({ by: ['uploaderId'], where: { ...approved, anonymousUpload: false }, _count: { _all: true }, orderBy: { _count: { uploaderId: 'desc' } }, take: 10 }),
      this.prisma.$queryRaw<{ userId: string; n: bigint }[]>`
        SELECT p."userId", COUNT(DISTINCT p."torrentId") AS n FROM "Peer" p
        WHERE p."isSeeder" = true AND p."lastAnnounceAt" > now() - interval '45 minutes' GROUP BY p."userId" ORDER BY n DESC LIMIT 10`,
      this.prisma.torrentComment.groupBy({ by: ['torrentId'], _count: { _all: true }, orderBy: { _count: { torrentId: 'desc' } }, take: 10 }),
      this.prisma.torrent.findMany({ where: approved, orderBy: { size: 'desc' }, take: 5, select: { id: true, name: true, size: true, coverImage: true } }),
      this.prisma.user.groupBy({ by: ['memberClass'], where: { parentId: null }, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['role'], where: { parentId: null }, _count: { _all: true } }),
      this.prisma.user.aggregate({ where: { parentId: null }, _sum: { bonusPoints: true } }),
      this.prisma.$queryRaw<{ r: number | null }[]>`SELECT AVG(uploaded::float8 / NULLIF(downloaded::float8, 0)) AS r FROM "User" WHERE "parentId" IS NULL AND downloaded > 0`,
      this.prisma.snatch.count({ where: { hnr: true, satisfied: false } }),
      this.prisma.peer.count({ where: { lastAnnounceAt: { gt: new Date(Date.now() - 45 * 60_000) } } }),
    ]);
    const userIds = [...new Set([...uploaders.map((u) => u.uploaderId), ...seedersNow.map((u) => u.userId)])];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, avatarUrl: true } }) : [];
    const uById = new Map(users.map((u) => [u.id, u]));
    const cIds = commented.map((c) => c.torrentId);
    const cTorrents = cIds.length ? await this.prisma.torrent.findMany({ where: { id: { in: cIds }, ...(visible as object) }, select: { id: true, name: true, coverImage: true } }) : [];
    const cById = new Map(cTorrents.map((t) => [t.id, t]));
    return {
      counts: { comments, collections, forumPosts, forumTopics, favorites, messages, friendships, requestsOpen, requestsFilled, newMembersWeek, uploadsWeek, uploadsMonth, activePeers: activeNow, hnrOpen },
      economy: { bonusInCirculation: Math.round(bonus._sum.bonusPoints ?? 0), averageRatio: avgRatio[0]?.r ?? null },
      snatchesPerDay: snatchesPerDay.map((r) => ({ date: r.d, count: Number(r.n) })),
      commentsPerDay: commentsPerDay.map((r) => ({ date: r.d, count: Number(r.n) })),
      byResolution: byResolution.map((r) => ({ name: r.resolution ?? '?', count: r._count._all })),
      byLanguage: byLanguage.map((r) => ({ name: r.language ?? '?', count: r._count._all })),
      topUploaders: uploaders.map((u) => ({ user: uById.get(u.uploaderId) ?? null, count: u._count._all })).filter((u) => u.user),
      topSeeders: seedersNow.map((u) => ({ user: uById.get(u.userId) ?? null, count: Number(u.n) })).filter((u) => u.user),
      mostCommented: commented.map((c) => ({ torrent: cById.get(c.torrentId) ?? null, count: c._count._all })).filter((c) => c.torrent),
      biggest: biggest.map((t) => ({ ...t, size: Number(t.size) })),
      memberClasses: classes.map((c) => ({ name: c.memberClass, count: c._count._all })),
      roles: roles.map((r) => ({ name: r.role, count: r._count._all })),
    };
  }

  /** Statistiques détaillées de la communauté (page Statistiques) : activité sur 30 jours, catégories, torrents à reseeder. */
  /** `days` : période des courbes (7, 30 ou 90 jours). */
  async overview(userId?: string, rawDays = 30) {
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const hidden = await this.adult.hiddenFor(userId);
    const visible = hidden.length ? { categoryId: { notIn: hidden } } : {};
    const [torrentsPerDay, membersPerDay, trafficPerDay, byCategory, topCompleted, deadCount, dead] = await Promise.all([
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Torrent"
        WHERE status = 'APPROVED' AND "createdAt" > now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "User"
        WHERE "parentId" IS NULL AND "createdAt" > now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ d: string; up: number; down: number }[]>`
        SELECT to_char(date_trunc('day', "takenAt"), 'YYYY-MM-DD') AS d, SUM(uploaded)::float8 AS up, SUM(downloaded)::float8 AS down FROM "RatioSnapshot"
        WHERE "takenAt" > now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`,
      this.prisma.torrent.groupBy({ by: ['categoryId'], where: { status: 'APPROVED', ...visible }, _count: { _all: true } }),
      this.prisma.torrent.findMany({
        where: { status: 'APPROVED', ...visible }, orderBy: { completedCount: 'desc' }, take: 10,
        select: { id: true, name: true, completedCount: true, seeders: true, coverImage: true },
      }),
      this.prisma.torrent.count({ where: { status: { in: ['APPROVED', 'DEAD'] }, seeders: 0, ...visible } }),
      this.prisma.torrent.findMany({
        where: { status: { in: ['APPROVED', 'DEAD'] }, seeders: 0, ...visible }, orderBy: [{ completedCount: 'desc' }, { createdAt: 'asc' }], take: 30,
        select: { id: true, name: true, completedCount: true, coverImage: true, status: true, size: true, zeroSeedersSince: true, diedAt: true, createdAt: true },
      }),
    ]);

    const categories = await this.prisma.category.findMany({ where: { id: { in: byCategory.map((c) => c.categoryId) } }, select: { id: true, name: true } });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));

    const sinceWindow = new Date(Date.now() - days * 86400_000);
    const sincePrev = new Date(Date.now() - 2 * days * 86400_000);
    const approvedVisible = { status: 'APPROVED' as const, ...visible };
    const [membersBefore, torrentsBefore, prevMembers, prevTorrents, prevSnatches, prevComments, snatchesByCategory] = await Promise.all([
      this.prisma.user.count({ where: { parentId: null, createdAt: { lt: sinceWindow } } }),
      this.prisma.torrent.count({ where: { ...approvedVisible, createdAt: { lt: sinceWindow } } }),
      this.prisma.user.count({ where: { parentId: null, createdAt: { gte: sincePrev, lt: sinceWindow } } }),
      this.prisma.torrent.count({ where: { ...approvedVisible, createdAt: { gte: sincePrev, lt: sinceWindow } } }),
      this.prisma.snatch.count({ where: { completedAt: { gte: sincePrev, lt: sinceWindow } } }),
      this.prisma.torrentComment.count({ where: { createdAt: { gte: sincePrev, lt: sinceWindow } } }),
      this.prisma.$queryRaw<{ name: string; n: number }[]>`
        SELECT COALESCE(p.name, c.name) AS name, COUNT(*)::int AS n FROM "Snatch" s JOIN "Torrent" t ON t.id = s."torrentId"
        JOIN "Category" c ON c.id = t."categoryId" LEFT JOIN "Category" p ON p.id = c."parentId"
        WHERE s."completedAt" > now() - make_interval(days => ${days}::int) AND (${hidden.length === 0} OR t."categoryId" <> ALL(${hidden}::text[]))
        GROUP BY 1 ORDER BY n DESC LIMIT 8`,
    ]);
    const extra = await this.extraStats(visible, days);
    const total = (list: { count: number }[]) => list.reduce((n, r) => n + r.count, 0);
    const series = {
      torrents: torrentsPerDay.map((r) => ({ date: r.d, count: Number(r.n) })),
      members: membersPerDay.map((r) => ({ date: r.d, count: Number(r.n) })),
    };
    const cumulative = (list: { date: string; count: number }[], start: number) => { let acc = start; return list.map((d) => ({ date: d.date, total: (acc += d.count) })); };
    const peak = (list: { date: string; count: number }[]) => list.reduce<{ date: string; count: number } | null>((best, d) => (!best || d.count > best.count ? d : best), null);
    const trend = (cur: number, prev: number) => ({ cur, prev, pct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null });
    return {
      days,
      trends: {
        members: trend(total(series.members), prevMembers), torrents: trend(total(series.torrents), prevTorrents),
        snatches: trend(total(extra.snatchesPerDay), prevSnatches), comments: trend(total(extra.commentsPerDay), prevComments),
      },
      records: { torrents: peak(series.torrents), members: peak(series.members), snatches: peak(extra.snatchesPerDay), comments: peak(extra.commentsPerDay) },
      membersCumulative: cumulative(series.members, membersBefore),
      torrentsCumulative: cumulative(series.torrents, torrentsBefore),
      snatchesByCategory: snatchesByCategory.map((r) => ({ name: r.name, count: r.n })),
      online: this.presence.listOnline().length,
      extra,
      global: await this.globalStats(),
      torrentsPerDay: torrentsPerDay.map((r) => ({ date: r.d, count: Number(r.n) })),
      membersPerDay: membersPerDay.map((r) => ({ date: r.d, count: Number(r.n) })),
      trafficPerDay: trafficPerDay.map((r) => ({ date: r.d, upload: r.up, download: r.down })),
      categories: byCategory.map((c) => ({ name: nameById.get(c.categoryId) ?? '?', count: c._count._all })).sort((a, b) => b.count - a.count),
      topCompleted,
      deadCount,
      dead,
    };
  }

  topTorrents(limit = 10) {
    return this.prisma.torrent.findMany({
      orderBy: { seeders: 'desc' },
      take: limit,
      where: { status: 'APPROVED' },
    });
  }

  /**
   * Toutes les nuits à 3h : fige un point de ratio par user pour les graphiques
   * d'évolution, puis réévalue les badges de tout le monde (ratio, volume seedé,
   * ancienneté... des stats qui évoluent sans action ponctuelle à hooker).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightlySnapshot() {
    await this.usersService.snapshotAllRatios();
    await this.badges.checkAndAwardAll();
  }

  /**
   * Toutes les 5 minutes : purge les peers inactifs depuis + de 45 min (clients crashés/fermés sans announce
   * "stopped" — déconnexion réseau, mise en veille, plantage...). Sans ça, un seeder/leecher disparu reste compté
   * jusqu'à ce que quelqu'un d'autre announce sur ce même torrent (parfois jamais), ce qui affiche des compteurs
   * gonflés pendant longtemps. On recalcule seeders/leechers seulement pour les torrents concernés par cette purge
   * (pas tous les torrents du site) : peu de lignes la plupart du temps, donc ça ne charge pas le serveur même en
   * tournant plus souvent que le délai d'announce (30 min) des clients.
   */
  @Cron('*/5 * * * *')
  async purgeStalePeers() {
    const cutoff = new Date(Date.now() - 45 * 60_000);
    const affected = await this.prisma.peer.findMany({
      where: { lastAnnounceAt: { lt: cutoff } },
      select: { torrentId: true },
      distinct: ['torrentId'],
    });
    if (affected.length === 0) return;
    await this.prisma.peer.deleteMany({ where: { lastAnnounceAt: { lt: cutoff } } });
    await Promise.all(affected.map(async ({ torrentId }) => {
      const [seeders, leechers] = await Promise.all([
        this.prisma.peer.count({ where: { torrentId, isSeeder: true } }),
        this.prisma.peer.count({ where: { torrentId, isSeeder: false } }),
      ]);
      await this.prisma.torrent.update({ where: { id: torrentId }, data: { seeders, leechers, ...(seeders > 0 ? { zeroSeedersSince: null } : {}) } }).catch(() => {}); // torrent supprimé entre-temps : ignoré
      // Le dernier seeder vient de disparaître : le délai avant « mort » démarre ici (comme quand il annonce « stopped »).
      // Sans ça, un seeder qui s'éteint sans prévenir laissait le torrent à 0 seeder pour toujours sans qu'il passe DEAD.
      if (seeders === 0) await this.prisma.torrent.updateMany({ where: { id: torrentId, zeroSeedersSince: null }, data: { zeroSeedersSince: new Date(), revivedByUserId: null, revivedAt: null, diedAt: null } });
    }));
  }
}
