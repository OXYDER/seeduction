import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { setSource } from '../common/utils/ledger';
import { NotificationsService } from '../notifications/notifications.service';
import { BADGES, BADGE_CATEGORIES, BadgeStats, evaluateBadges } from '../common/utils/badges';

@Injectable()
export class BadgesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async statsFor(userId: string): Promise<BadgeStats> {
    const [user, uploadsApproved, forumPosts, requestFills, seed, seedOk, hnrOpen, subtitles, comments, mentored, ratings, watched, quizzes, wheelSpins, picksWon, badgesEarned] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { uploaded: true, downloaded: true, bonusPoints: true, createdAt: true, _count: { select: { invitees: true } } },
      }),
      this.prisma.torrent.count({ where: { uploaderId: userId, status: 'APPROVED' } }),
      this.prisma.forumPost.count({ where: { authorId: userId } }),
      this.prisma.torrentRequest.count({ where: { filledById: userId } }),
      this.prisma.snatch.aggregate({ where: { userId }, _sum: { seedSeconds: true }, _count: { _all: true } }),
      this.prisma.snatch.count({ where: { userId, satisfied: true } }),
      this.prisma.snatch.count({ where: { userId, hnr: true, satisfied: false, hnrClearedAt: null } }),
      this.prisma.subtitleFile.count({ where: { uploaderId: userId } }),
      this.prisma.torrentComment.count({ where: { authorId: userId } }),
      this.prisma.user.count({ where: { invitedById: userId, memberClass: { not: 'NOUVEAU' }, status: 'ACTIVE' } }),
      this.prisma.torrentRating.count({ where: { userId } }),
      this.prisma.playbackPosition.count({ where: { userId } }),
      this.prisma.quizPlay.count({ where: { userId, status: 'DONE' } }),
      this.prisma.wheelSpin.count({ where: { userId } }),
      this.prisma.nhlPick.count({ where: { userId, status: 'WON' } }),
      this.prisma.userBadge.count({ where: { userId } }),
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
      seedHours: (seed._sum.seedSeconds ?? 0) / 3600,
      seedOk,
      snatches: seed._count._all,
      hnrOpen,
      subtitles,
      comments,
      mentored,
      ratings,
      watched,
      quizzes,
      wheelSpins,
      picksWon,
      badgesEarned,
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

    // Les points ne sont versés qu'aux comptes principaux ordinaires (pas aux profils famille, dont les points sont ceux du compte, ni aux robots ou comptes supprimés).
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { parentId: true, profileType: true, deletedAt: true } });
    const paid = !!owner && owner.parentId === null && owner.profileType !== 'BOT' && !owner.deletedAt;

    const awarded: string[] = [];
    for (const code of newCodes) {
      const def = BADGES.find((b) => b.code === code)!;
      // Un seul versement par badge, même si deux balayages se croisent : le badge et les points sont écrits ensemble, et le badge déjà présent (clé unique) annule tout.
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.userBadge.create({ data: { userId, code } });
          if (paid && def.points > 0) {
            await setSource(tx, 'badges');
            await tx.user.update({ where: { id: userId }, data: { bonusPoints: { increment: def.points } } });
          }
        });
      } catch { continue; }
      awarded.push(code);
      await this.notifications.notify({
        userId,
        type: 'BADGE_EARNED',
        title: `Nouveau badge : ${def.icon} ${def.name}`,
        body: paid && def.points > 0 ? `${def.description} · +${def.points} points bonus` : def.description,
        link: '/profile',
      });
    }
    return awarded;
  }

  /** Balayage périodique (cron) pour les badges liés à des stats qui évoluent sans action ponctuelle (ratio, ancienneté...). */
  async checkAndAwardAll() {
    const users = await this.prisma.user.findMany({ where: { deletedAt: null, profileType: { not: 'BOT' } }, select: { id: true } });
    for (const u of users) {
      await this.checkAndAward(u.id).catch(() => {});
    }
  }

  catalog() {
    return BADGES.map(({ check, progress, ...def }) => def);
  }

  /**
   * Page « Réalisations » : tous les badges avec, pour le membre connecté, ce qui est obtenu (et quand), où il en est pour les autres, et la rareté (part des membres qui l'ont).
   */
  async progressFor(userId: string) {
    const [stats, earned, holders, members] = await Promise.all([
      this.statsFor(userId),
      this.prisma.userBadge.findMany({ where: { userId }, select: { code: true, awardedAt: true } }),
      this.prisma.userBadge.groupBy({ by: ['code'], _count: { _all: true } }),
      this.prisma.user.count({ where: { parentId: null, status: 'ACTIVE' } }),
    ]);
    const when = new Map(earned.map((e) => [e.code, e.awardedAt]));
    const count = new Map(holders.map((h) => [h.code, h._count._all]));
    const items = BADGES.map((b) => {
      const p = b.progress(stats);
      return {
        code: b.code, name: b.name, icon: b.icon, description: b.description, category: b.category, points: b.points,
        earned: when.has(b.code) || b.check(stats), awardedAt: when.get(b.code) ?? null, value: p.value, target: p.target, unit: p.unit ?? null,
        percentOfMembers: members > 0 ? Math.min(100, Math.round(((count.get(b.code) ?? 0) / members) * 1000) / 10) : 0,
      };
    });
    return {
      categories: Object.entries(BADGE_CATEGORIES).map(([key, v]) => ({ key, ...v })), total: items.length, earnedCount: items.filter((i) => i.earned).length, items,
      pointsToWin: items.filter((i) => !i.earned).reduce((n, i) => n + i.points, 0),
    };
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
