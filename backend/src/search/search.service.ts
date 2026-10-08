import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
export const ENTITY_GROUPS = ['actors', 'directors', 'producers', 'genres', 'creators'] as const;
export const SUGGEST_SCOPES = ['torrents', 'users', 'categories', 'entities', 'topics', ...ENTITY_GROUPS] as const;
type Scope = (typeof SUGGEST_SCOPES)[number];

const ROLE_GROUP: Record<string, (typeof ENTITY_GROUPS)[number]> = {
  ACTOR: 'actors', DIRECTOR: 'directors', GENRE: 'genres',
  PRODUCER: 'producers', STUDIO: 'producers', LABEL: 'producers', PUBLISHER: 'producers', DEVELOPER: 'producers', NETWORK: 'producers',
};

/** Pré-résultats de recherche (auto-complétion) : quelques correspondances par type, avec image. */
@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService, private adult: AdultService) {}

  /** Forums que ce visiteur ne peut pas voir (forums réservés au staff et tout ce qu'ils contiennent). */
  private async hiddenForumIds(role: string): Promise<string[]> {
    if (STAFF.includes(role)) return [];
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, parentId: true, staffOnly: true } });
    const byId = new Map(all.map((c) => [c.id, c]));
    const hidden = (c: { id: string; parentId: string | null; staffOnly: boolean }): boolean =>
      c.staffOnly || (c.parentId ? hidden(byId.get(c.parentId)!) : false);
    return all.filter(hidden).map((c) => c.id);
  }

  /**
   * Fiches (acteurs, réalisateurs, producteurs et studios, genres...) dont le nom correspond, rangées dans le groupe de leur
   * rôle le plus fréquent et triées par nombre de torrents ; une fiche sans aucun torrent visible n'est pas proposée.
   */
  private async suggestEntities(term: string, plain: string, hiddenCategories: string[], notHidden: object) {
    const names = [{ name: { contains: term, mode: 'insensitive' as const } }, ...(plain !== term ? [{ name: { contains: plain, mode: 'insensitive' as const } }] : [])];
    const entities = await this.prisma.entity.findMany({
      // Sans contenu adulte activé, les fiches issues de la source adulte (ThePornDB) ne sont pas proposées.
      where: { OR: names, ...(hiddenCategories.length ? { source: { not: 'theporndb' } } : {}) },
      take: 60,
      select: { id: true, name: true, type: true, imageUrl: true },
    });
    const groups: Record<(typeof ENTITY_GROUPS)[number], any[]> = { actors: [], directors: [], producers: [], genres: [], creators: [] };
    if (entities.length === 0) return groups;
    const rows = await this.prisma.torrentEntity.groupBy({
      by: ['entityId', 'role'],
      where: { entityId: { in: entities.map((e) => e.id) }, torrent: { status: 'APPROVED', ...notHidden } },
      _count: { _all: true },
    });
    const per = new Map<string, { total: number; role: string; best: number }>();
    for (const r of rows) {
      const cur = per.get(r.entityId) ?? { total: 0, role: r.role, best: 0 };
      cur.total += r._count._all;
      if (r._count._all > cur.best) { cur.best = r._count._all; cur.role = r.role; }
      per.set(r.entityId, cur);
    }
    const startsWith = (n: string) => (n.toLowerCase().startsWith(term.toLowerCase()) ? 0 : 1);
    const ranked = entities
      .filter((e) => per.has(e.id))
      .map((e) => ({ ...e, role: per.get(e.id)!.role, torrentCount: per.get(e.id)!.total }))
      .sort((a, b) => startsWith(a.name) - startsWith(b.name) || b.torrentCount - a.torrentCount || a.name.localeCompare(b.name));
    for (const e of ranked) {
      const group = ROLE_GROUP[e.role] ?? 'creators';
      if (groups[group].length < 4) groups[group].push(e);
    }
    return groups;
  }

  async suggest(q: string, scopes: Scope[], role: string, userId?: string) {
    const term = q.trim();
    if (term.length < 2) return {};
    const contains = { contains: term, mode: 'insensitive' as const };
    const plain = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // « entities » est le raccourci de tous les groupes de fiches (acteurs, réalisateurs, producteurs, genres...).
    const wanted = new Set<string>(scopes.flatMap((s) => (s === 'entities' ? [...ENTITY_GROUPS] : [s])));
    const hiddenCategories = await this.adult.hiddenFor(userId);
    const notHidden = hiddenCategories.length ? { categoryId: { notIn: hiddenCategories } } : {};
    const result: Record<string, any[]> = {};

    await Promise.all([
      wanted.has('torrents') && this.prisma.torrent.findMany({
        where: {
          status: 'APPROVED',
          ...notHidden,
          OR: [
            { name: contains },
            { searchTitles: contains },
            ...(plain !== term ? [{ searchTitles: { contains: plain, mode: 'insensitive' as const } }] : []),
          ],
        },
        orderBy: [{ seeders: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: {
          id: true, name: true, coverImage: true, year: true, resolution: true, seeders: true, searchTitles: true, category: { select: { name: true } },
          language: true, source: true, codec: true, audio: true, hdr: true, containerFormat: true, origin: true, season: true, episode: true, releaseDate: true, // pour les pastilles d'information
        },
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
        where: { name: contains, ...(hiddenCategories.length ? { id: { notIn: hiddenCategories } } : {}) },
        orderBy: { name: 'asc' },
        take: 5,
        select: { id: true, name: true, slug: true, imageUrl: true, parent: { select: { name: true } } },
      }).then((r) => { result.categories = r; }),

      ENTITY_GROUPS.some((g) => wanted.has(g)) && this.suggestEntities(term, plain, hiddenCategories, notHidden).then((groups) => {
        for (const g of ENTITY_GROUPS) if (wanted.has(g)) result[g] = groups[g];
      }),

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
