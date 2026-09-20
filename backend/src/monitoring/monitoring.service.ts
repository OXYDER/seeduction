import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MetricsService } from './metrics.service';

const MB = 1024 * 1024;

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  private async checkDatabase() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: null };
    }
  }

  async snapshot() {
    const since24h = new Date(Date.now() - 86_400_000);
    const [database, users, approved, pending, seeders, leechers, openReports, chatMessages24h] = await Promise.all([
      this.checkDatabase(),
      this.prisma.user.count(),
      this.prisma.torrent.count({ where: { status: 'APPROVED' } }),
      this.prisma.torrent.count({ where: { status: 'PENDING' } }),
      this.prisma.peer.count({ where: { isSeeder: true } }),
      this.prisma.peer.count({ where: { isSeeder: false } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.chatMessage.count({ where: { createdAt: { gte: since24h } } }),
    ]);

    const mem = process.memoryUsage();
    return {
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        rssMB: Math.round(mem.rss / MB),
        heapUsedMB: Math.round(mem.heapUsed / MB),
        heapTotalMB: Math.round(mem.heapTotal / MB),
      },
      database,
      counts: { users, approvedTorrents: approved, pendingTorrents: pending, seeders, leechers, openReports, chatMessages24h },
      series: this.metrics.series(),
    };
  }
}
