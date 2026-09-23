import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Profil complet pour soi-même ; le staff voit en plus l'e-mail ; les autres
   * n'ont que les infos publiques (jamais la passkey ni l'e-mail).
   */
  async getProfile(userId: string, viewer?: { userId: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, role: true, uploaded: true,
        downloaded: true, bonusPoints: true, minRatio: true, createdAt: true,
        lastSeenAt: true, passkey: true, status: true,
        _count: { select: { torrentsUploaded: true, invitees: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const ratio = user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : null;
    const isSelf = viewer?.userId === user.id;
    const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '');
    const { email, passkey, minRatio, ...publicInfo } = user;
    return {
      ...publicInfo,
      ratio,
      ...(isSelf ? { email, passkey, minRatio } : {}),
      ...(isStaff && !isSelf ? { email } : {}),
    };
  }

  async getRatioHistory(userId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    return this.prisma.ratioSnapshot.findMany({
      where: { userId, takenAt: { gte: since } },
      orderBy: { takenAt: 'asc' },
    });
  }

  async leaderboard(limit = 50) {
    const users = await this.prisma.user.findMany({
      orderBy: { uploaded: 'desc' },
      take: limit,
      select: { id: true, username: true, uploaded: true, downloaded: true, bonusPoints: true },
    });
    return users.map((u) => ({
      ...u,
      ratio: u.downloaded > 0n ? Number(u.uploaded) / Number(u.downloaded) : null,
    }));
  }

  /** Job périodique (cron) à appeler pour figer un snapshot de ratio par user. */
  async snapshotAllRatios() {
    const users = await this.prisma.user.findMany({ select: { id: true, uploaded: true, downloaded: true } });
    await this.prisma.ratioSnapshot.createMany({
      data: users.map((u) => ({ userId: u.id, uploaded: u.uploaded, downloaded: u.downloaded })),
    });
  }
}
