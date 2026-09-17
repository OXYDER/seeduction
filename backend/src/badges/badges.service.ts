import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BADGES, BadgeStats, evaluateBadges } from '../common/utils/badges';

@Injectable()
export class BadgesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async statsFor(userId: string): Promise<BadgeStats> {
    const [user, uploadsApproved, forumPosts, requestFills] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { uploaded: true, downloaded: true, bonusPoints: true, createdAt: true, _count: { select: { invitees: true } } },
      }),
      this.prisma.torrent.count({ where: { uploaderId: userId, status: 'APPROVED' } }),
      this.prisma.forumPost.count({ where: { authorId: userId } }),
      this.prisma.torrentRequest.count({ where: { filledById: userId } }),
    ]);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    return {
      uploadsApproved,
      uploadedBytes: user.uploaded,
      ratio: user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : null,
      bonusPoints: user.bonusPoints,
      invitees: user._count.invitees,
      forumPosts,
      accountAgeDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000),
      requestFills,
    };
  }

  /** Évalue les badges d'un user et attribue + notifie ceux nouvellement obtenus. */
  async checkAndAward(userId: string) {
    const stats = await this.statsFor(userId);
    const earnedCodes = evaluateBadges(stats);
    if (earnedCodes.length === 0) return [];

    const existing = await this.prisma.userBadge.findMany({ where: { userId }, select: { code: true } });
    const existingCodes = new Set(existing.map((e) => e.code));
    const newCodes = earnedCodes.filter((c) => !existingCodes.has(c));
    if (newCodes.length === 0) return [];

    await this.prisma.userBadge.createMany({
      data: newCodes.map((code) => ({ userId, code })),
      skipDuplicates: true,
    });

    for (const code of newCodes) {
      const def = BADGES.find((b) => b.code === code)!;
      await this.notifications.notify({
        userId,
        type: 'BADGE_EARNED',
        title: `Nouveau badge : ${def.icon} ${def.name}`,
        body: def.description,
        link: '/profile',
      });
    }
    return newCodes;
  }

  /** Balayage périodique (cron) pour les badges liés à des stats qui évoluent sans action ponctuelle (ratio, ancienneté...). */
  async checkAndAwardAll() {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    for (const u of users) {
      await this.checkAndAward(u.id).catch(() => {});
    }
  }

  catalog() {
    return BADGES.map(({ check, ...def }) => def);
  }

  async listForUser(userId: string) {
    const earned = await this.prisma.userBadge.findMany({ where: { userId }, orderBy: { awardedAt: 'asc' } });
    return earned
      .map((e) => {
        const def = BADGES.find((b) => b.code === e.code);
        return def ? { ...def, awardedAt: e.awardedAt } : null;
      })
      .filter(Boolean);
  }

  async hallOfFame(limit = 20) {
    const grouped = await this.prisma.userBadge.groupBy({
      by: ['userId'],
      _count: { code: true },
      orderBy: { _count: { code: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      select: { id: true, username: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return grouped
      .map((g) => ({ user: byId.get(g.userId), badgeCount: g._count.code }))
      .filter((g) => g.user);
  }
}
