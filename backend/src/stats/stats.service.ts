import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService, private usersService: UsersService) {}

  async globalStats() {
    const [totalUsers, totalTorrents, totalSeeders, totalLeechers, totalCompleted] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.torrent.count({ where: { status: 'APPROVED' } }),
      this.prisma.peer.count({ where: { isSeeder: true } }),
      this.prisma.peer.count({ where: { isSeeder: false } }),
      this.prisma.snatch.count(),
    ]);
    const totalSizeAgg = await this.prisma.torrent.aggregate({ _sum: { size: true } });

    return {
      totalUsers,
      totalTorrents,
      totalSeeders,
      totalLeechers,
      totalCompleted,
      totalSize: totalSizeAgg._sum.size ?? 0n,
    };
  }

  topTorrents(limit = 10) {
    return this.prisma.torrent.findMany({
      orderBy: { seeders: 'desc' },
      take: limit,
      where: { status: 'APPROVED' },
    });
  }

  /** Toutes les nuits à 3h : fige un point de ratio par user pour les graphiques d'évolution. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightlySnapshot() {
    await this.usersService.snapshotAllRatios();
  }

  /** Toutes les 15 minutes : purge les peers inactifs depuis + de 45 min (clients crashés/off). */
  @Cron('*/15 * * * *')
  async purgeStalePeers() {
    const cutoff = new Date(Date.now() - 45 * 60_000);
    await this.prisma.peer.deleteMany({ where: { lastAnnounceAt: { lt: cutoff } } });
  }
}
