import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { UsersService } from '../users/users.service';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService, private usersService: UsersService, private badges: BadgesService) {}

  async globalStats() {
    const [totalUsers, totalTorrents, totalSeeders, totalLeechers, totalCompleted] = await Promise.all([
      this.prisma.user.count(),
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
    };
  }

  /** Statistiques détaillées de la communauté (page Statistiques) : activité sur 30 jours, catégories, torrents à reseeder. */
  async overview() {
    const [torrentsPerDay, membersPerDay, trafficPerDay, byCategory, topCompleted, deadCount, dead] = await Promise.all([
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Torrent"
        WHERE status = 'APPROVED' AND "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "User"
        WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ d: string; up: number; down: number }[]>`
        SELECT to_char(date_trunc('day', "takenAt"), 'YYYY-MM-DD') AS d, SUM(uploaded)::float8 AS up, SUM(downloaded)::float8 AS down FROM "RatioSnapshot"
        WHERE "takenAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
      this.prisma.torrent.groupBy({ by: ['categoryId'], where: { status: 'APPROVED' }, _count: { _all: true } }),
      this.prisma.torrent.findMany({
        where: { status: 'APPROVED' }, orderBy: { completedCount: 'desc' }, take: 10,
        select: { id: true, name: true, completedCount: true, seeders: true, coverImage: true },
      }),
      this.prisma.torrent.count({ where: { status: 'APPROVED', seeders: 0 } }),
      this.prisma.torrent.findMany({
        where: { status: 'APPROVED', seeders: 0, completedCount: { gt: 0 } }, orderBy: { completedCount: 'desc' }, take: 15,
        select: { id: true, name: true, completedCount: true, coverImage: true },
      }),
    ]);

    const categories = await this.prisma.category.findMany({ where: { id: { in: byCategory.map((c) => c.categoryId) } }, select: { id: true, name: true } });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));

    return {
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

  /** Toutes les 15 minutes : purge les peers inactifs depuis + de 45 min (clients crashés/off). */
  @Cron('*/15 * * * *')
  async purgeStalePeers() {
    const cutoff = new Date(Date.now() - 45 * 60_000);
    await this.prisma.peer.deleteMany({ where: { lastAnnounceAt: { lt: cutoff } } });
  }
}
