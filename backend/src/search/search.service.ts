import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const STAFF = ['MODERATOR', 'ADMIN', 'OWNER'];
export const SUGGEST_SCOPES = ['torrents', 'users', 'categories', 'entities', 'topics'] as const;
type Scope = (typeof SUGGEST_SCOPES)[number];

/** Pré-résultats de recherche (auto-complétion) : quelques correspondances par type, avec image. */
@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /** Forums que ce visiteur ne peut pas voir (forums réservés au staff et tout ce qu'ils contiennent). */
  private async hiddenForumIds(role: string): Promise<string[]> {
    if (STAFF.includes(role)) return [];
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, parentId: true, staffOnly: true } });
    const byId = new Map(all.map((c) => [c.id, c]));
    const hidden = (c: { id: string; parentId: string | null; staffOnly: boolean }): boolean =>
      c.staffOnly || (c.parentId ? hidden(byId.get(c.parentId)!) : false);
    return all.filter(hidden).map((c) => c.id);
  }

  async suggest(q: string, scopes: Scope[], role: string) {
    const term = q.trim();
    if (term.length < 2) return {};
    const contains = { contains: term, mode: 'insensitive' as const };
    const plain = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const wanted = new Set(scopes);
    const result: Record<string, any[]> = {};

    await Promise.all([
      wanted.has('torrents') && this.prisma.torrent.findMany({
        where: {
          status: 'APPROVED',
          OR: [
            { name: contains },
            { searchTitles: contains },
            ...(plain !== term ? [{ searchTitles: { contains: plain, mode: 'insensitive' as const } }] : []),
          ],
        },
        orderBy: [{ seeders: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: { id: true, name: true, coverImage: true, year: true, resolution: true, seeders: true, searchTitles: true, category: { select: { name: true } } },
      }).then((r) => {
        // Si le torrent est trouvé par un autre titre que son nom, on l'indique (« aussi connu sous : ... »).
        const needle = term.toLowerCase();
        const needlePlain = plain.toLowerCase();
        result.torrents = r.map(({ searchTitles, ...t }) => {
          const nameHit = t.name.toLowerCase().includes(needle);
          const alt = nameHit ? null : (searchTitles ?? '').split('\n').find((l) => l.toLowerCase().includes(needle) || l.toLowerCase().includes(needlePlain)) ?? null;
          return { ...t, matchedTitle: alt };
        });
      }),

      wanted.has('users') && this.prisma.user.findMany({
        where: { username: contains, status: 'ACTIVE' },
        orderBy: { username: 'asc' },
        take: 6,
        select: { id: true, username: true, avatarUrl: true, role: true, memberClass: true },
      }).then((r) => { result.users = r; }),

      wanted.has('categories') && this.prisma.category.findMany({
        where: { name: contains },
        orderBy: { name: 'asc' },
        take: 5,
        select: { id: true, name: true, slug: true, imageUrl: true, parent: { select: { name: true } } },
      }).then((r) => { result.categories = r; }),

      wanted.has('entities') && this.prisma.entity.findMany({
        where: { name: contains },
        orderBy: { name: 'asc' },
        take: 5,
        select: { id: true, name: true, type: true, imageUrl: true },
      }).then((r) => { result.entities = r; }),

      wanted.has('topics') && this.hiddenForumIds(role).then((hidden) => this.prisma.forumTopic.findMany({
        where: { title: contains, ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) },
        orderBy: { lastPostAt: 'desc' },
        take: 6,
        select: { id: true, title: true, category: { select: { name: true } } },
      })).then((r) => { result.topics = r; }),
    ].filter(Boolean));

    return result;
  }
}
