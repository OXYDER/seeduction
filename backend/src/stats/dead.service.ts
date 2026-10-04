import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { ECONOMY, reseedReward } from '../common/utils/economy';

const RESEED_COOLDOWN_MS = 7 * 86400_000;
const SORTS = ['popular', 'longest', 'recent', 'big', 'reward'] as const;
export type DeadSort = typeof SORTS[number];

/**
 * Page « Réanimation » : tous les torrents sans seeder, ceux que le membre peut relancer lui-même (il les a déjà téléchargés), la
 * récompense qu'il gagnerait, et les membres qui ont déjà ramené des torrents à la vie.
 */
@Injectable()
export class DeadService {
  constructor(private prisma: PrismaService, private adult: AdultService) {}

  private deadSince(t: { diedAt: Date | null; zeroSeedersSince: Date | null; createdAt: Date }) {
    return t.diedAt ?? t.zeroSeedersSince ?? t.createdAt;
  }

  /** Nombre de torrents sans seeder que ce membre a déjà téléchargés : la pastille du menu. */
  async mineCount(accountId: string, viewerId: string) {
    const hidden = await this.adult.hiddenFor(viewerId);
    return this.prisma.torrent.count({
      where: { status: { in: ['APPROVED', 'DEAD'] }, seeders: 0, ...(hidden.length ? { categoryId: { notIn: hidden } } : {}), snatches: { some: { userId: accountId } } },
    });
  }

  async list(viewer: { userId: string; accountId: string }, params: { sort?: string; q?: string; category?: string; mine?: boolean; page?: number }) {
    const hidden = await this.adult.hiddenFor(viewer.userId);
    const visible: Prisma.TorrentWhereInput = hidden.length ? { categoryId: { notIn: hidden } } : {};
    const base: Prisma.TorrentWhereInput = { status: { in: ['APPROVED', 'DEAD'] }, seeders: 0, ...visible };
    const sort: DeadSort = (SORTS as readonly string[]).includes(params.sort ?? '') ? (params.sort as DeadSort) : 'popular';
    const q = (params.q ?? '').trim();
    const where: Prisma.TorrentWhereInput = {
      ...base,
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(params.category ? { OR: [{ category: { slug: params.category } }, { category: { parent: { slug: params.category } } }] } : {}),
      ...(params.mine ? { snatches: { some: { userId: viewer.accountId } } } : {}),
    };
    const orderBy: Prisma.TorrentOrderByWithRelationInput[] = {
      popular: [{ completedCount: 'desc' as const }, { createdAt: 'asc' as const }],
      longest: [{ zeroSeedersSince: { sort: 'asc' as const, nulls: 'last' as const } }, { createdAt: 'asc' as const }],
      recent: [{ zeroSeedersSince: { sort: 'desc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }],
      big: [{ size: 'desc' as const }],
      reward: [{ size: 'desc' as const }, { zeroSeedersSince: { sort: 'asc' as const, nulls: 'last' as const } }],
    }[sort];
    const pageSize = 24;
    const page = Math.max(1, Math.floor(params.page ?? 1));

    const [rows, total, everything, mine, categories, heroesAll, heroesMonth, recent, inProgress, requested] = await Promise.all([
      this.prisma.torrent.findMany({
        where, orderBy, take: pageSize, skip: (page - 1) * pageSize,
        select: {
          id: true, name: true, coverImage: true, size: true, completedCount: true, status: true, createdAt: true, diedAt: true, zeroSeedersSince: true,
          reseedRequestedAt: true, revivedByUserId: true, leechers: true, year: true, resolution: true, category: { select: { name: true, slug: true } },
          snatches: { where: { userId: viewer.accountId }, take: 1, select: { id: true, completedAt: true } },
          _count: { select: { snatches: true } },
        },
      }),
      this.prisma.torrent.count({ where }),
      this.prisma.torrent.findMany({ where: base, take: 5000, select: { size: true, diedAt: true, zeroSeedersSince: true, createdAt: true, status: true, completedCount: true } }),
      this.prisma.torrent.count({ where: { ...base, snatches: { some: { userId: viewer.accountId } } } }),
      this.prisma.torrent.groupBy({ by: ['categoryId'], where: base, _count: { _all: true } }),
      this.prisma.$queryRaw<{ userId: string; n: number; points: number }[]>(Prisma.sql`SELECT "userId", COUNT(*)::int AS n, SUM(points)::int AS points FROM "TorrentRevival" GROUP BY "userId" ORDER BY n DESC, points DESC LIMIT 5`),
      this.prisma.$queryRaw<{ userId: string; n: number; points: number }[]>(Prisma.sql`SELECT "userId", COUNT(*)::int AS n, SUM(points)::int AS points FROM "TorrentRevival" WHERE "createdAt" > now() - interval '30 days' GROUP BY "userId" ORDER BY n DESC, points DESC LIMIT 5`),
      this.prisma.torrentRevival.findMany({ where: { torrent: visible }, orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, points: true, deadDays: true, userId: true, torrent: { select: { id: true, name: true, coverImage: true } } } }),
      this.prisma.torrent.count({ where: { revivedByUserId: { not: null }, seeders: { gt: 0 }, ...visible } }),
      this.prisma.torrent.count({ where: { ...base, reseedRequestedAt: { gt: new Date(Date.now() - RESEED_COOLDOWN_MS) } } }),
    ]);

    // Noms des catégories (les plus touchées) et des membres cités.
    const catRows = await this.prisma.category.findMany({ where: { id: { in: categories.map((c) => c.categoryId) } }, select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } } });
    const byCat = new Map<string, { name: string; slug: string; count: number }>();
    for (const c of categories) {
      const cat = catRows.find((r) => r.id === c.categoryId);
      if (!cat) continue;
      const top = cat.parent ?? cat;
      const cur = byCat.get(top.slug) ?? { name: top.name, slug: top.slug, count: 0 };
      cur.count += c._count._all;
      byCat.set(top.slug, cur);
    }
    const userIds = [...new Set([...heroesAll.map((h) => h.userId), ...heroesMonth.map((h) => h.userId), ...recent.map((r) => r.userId)])];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, avatarUrl: true, parentId: true } }) : [];
    const uById = new Map(users.map((u) => [u.id, { id: u.id, username: u.username, avatarUrl: u.avatarUrl }]));
    const hero = (h: { userId: string; n: number; points: number }) => ({ user: uById.get(h.userId) ?? null, count: h.n, points: h.points });

    const now = Date.now();
    const potential = everything.reduce((sum, t) => sum + reseedReward(t.size, this.deadSince(t), now), 0);
    const items = rows.map((t) => {
      const since = this.deadSince(t);
      const sinceMs = now - since.getTime();
      return {
        id: t.id, name: t.name, coverImage: t.coverImage, category: t.category, size: Number(t.size), year: t.year, resolution: t.resolution,
        completedCount: t.completedCount, leechers: t.leechers, status: t.status,
        deadSince: since, deadDays: Math.max(0, Math.floor(sinceMs / 86400_000)), officiallyDead: t.status === 'DEAD',
        reward: reseedReward(t.size, t.diedAt ?? t.zeroSeedersSince ?? t.createdAt, now),
        // Seul un torrent officiellement mort rapporte la récompense (voir TrackerService) : sinon, le délai de grâce court encore.
        rewardEligible: t.status === 'DEAD',
        snatchedByMe: t.snatches.length > 0, snatchedAt: t.snatches[0]?.completedAt ?? null, snatchers: t._count.snatches,
        pendingRevival: !!t.revivedByUserId,
        canRequest: !t.reseedRequestedAt || now - t.reseedRequestedAt.getTime() >= RESEED_COOLDOWN_MS,
        reseedRequestedAt: t.reseedRequestedAt,
      };
    });
    return {
      items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)), sort,
      summary: {
        noSeeders: everything.length, officiallyDead: everything.filter((t) => t.status === 'DEAD').length,
        totalSize: everything.reduce((s, t) => s + Number(t.size), 0), potentialReward: potential, mine, inProgress, requested,
        deadAfterHours: ECONOMY.deadAfterHours, rewardMax: ECONOMY.reseedRewardMax, rewardBase: ECONOMY.reseedRewardBase,
      },
      categories: [...byCat.values()].sort((a, b) => b.count - a.count),
      heroes: { month: heroesMonth.map(hero).filter((h) => h.user), allTime: heroesAll.map(hero).filter((h) => h.user) },
      recent: recent.map((r) => ({ at: r.createdAt, points: r.points, deadDays: r.deadDays, user: uById.get(r.userId) ?? null, torrent: r.torrent })),
    };
  }
}
