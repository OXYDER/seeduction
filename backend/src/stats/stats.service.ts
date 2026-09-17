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
