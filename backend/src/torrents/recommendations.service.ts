import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { LIST_INCLUDE, toListRow } from './torrents.service';

/**
 * Importance d'un lien (acteur, réalisateur, studio...) dans le profil de goûts : un réalisateur ou un artiste dit
 * plus sur les goûts de quelqu'un qu'un acteur parmi vingt, ou qu'un simple genre partagé par tout le catalogue.
 */
const ROLE_WEIGHT: Record<string, number> = {
  DIRECTOR: 3, CREATOR: 3, ARTIST: 3, AUTHOR: 3, DEVELOPER: 2, ACTOR: 1.5, WRITER: 1.5, STUDIO: 1.5, LABEL: 1.5,
  NETWORK: 1.5, PRODUCER: 1, PUBLISHER: 1, GENRE: 1, PLATFORM: 1,
};
const ROLE_PHRASE: Record<string, string> = {
  DIRECTOR: 'Réalisé par', ACTOR: 'Avec', ARTIST: 'De', AUTHOR: 'De', CREATOR: 'Créé par', STUDIO: 'Du studio', LABEL: 'Du label',
  DEVELOPER: 'Du studio', PUBLISHER: 'Chez', NETWORK: 'Sur', WRITER: 'Écrit par', PRODUCER: 'Produit par',
};

const CACHE_MS = 90_000;

interface Candidate {
  id: string; name: string; categoryId: string; genres: string[]; language: string | null; origin: string | null;
  seeders: number; freeleech: boolean; createdAt: Date; metaSource: string | null; metaExternalId: string | null;
  entities: { entityId: string; role: string; entity: { name: string } }[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Petit hachage stable (0..1) pour varier légèrement l'ordre d'un jour à l'autre sans jamais le rendre aléatoire en cours de journée. */
function dailyJitter(id: string) {
  const day = Math.floor(Date.now() / 86_400_000);
  let h = day;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Valeurs d'une table de scores ramenées entre -1 et 1 (pour pouvoir additionner genres, acteurs, catégories sur une même échelle). */
function normalize<K>(map: Map<K, number>) {
  let max = 0;
  for (const v of map.values()) max = Math.max(max, Math.abs(v));
  const out = new Map<K, number>();
  if (max === 0) return out;
  for (const [k, v] of map) out.set(k, v / max);
  return out;
}

/**
 * « Offres » de torrents basées sur l'historique d'activité du membre : ce qu'il a téléchargé, regardé dans le lecteur,
 * mis de côté, remercié, noté, rangé dans une collection ou ce qu'il seede en ce moment, plus les acteurs / studios /
 * genres qu'il suit. Chaque signal pèse différemment (regarder > mettre de côté > simplement télécharger) et une mauvaise
 * note compte contre. Le profil ainsi construit (acteurs, réalisateurs, genres, catégories, langue, origine) sert à noter
 * les torrents que le membre n'a pas encore, avec un petit coup de pouce aux torrents bien seedés, récents ou freeleech.
 * Sur une fiche torrent, ce torrent précis pèse très lourd (« dans la même veine »). Chaque résultat porte un `reason`
 * lisible. Les contenus déjà vus (même autre version de la même fiche) et le contenu adulte masqué sont exclus.
 */
@Injectable()
export class RecommendationsService {
  private cache = new Map<string, { at: number; data: any[] }>();

  constructor(private prisma: PrismaService, private adult: AdultService) {}

  async forUser(userId: string, opts: { basedOn?: string; limit?: number } = {}) {
    const limit = clamp(Math.floor(opts.limit ?? 18), 1, 40);
    const key = `${userId}|${opts.basedOn ?? ''}|${limit}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const data = await this.compute(userId, opts.basedOn, limit);
    this.cache.set(key, { at: Date.now(), data });
    if (this.cache.size > 500) for (const k of [...this.cache.keys()].slice(0, 100)) this.cache.delete(k);
    return data;
  }

  private async compute(userId: string, basedOn: string | undefined, limit: number) {
    const [hidden, snatches, favs, likes, ratings, plays, collItems, peers, follows] = await Promise.all([
      this.adult.hiddenFor(userId),
      this.prisma.snatch.findMany({ where: { userId }, orderBy: { completedAt: 'desc' }, take: 60, select: { torrentId: true } }),
      this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 60, select: { torrentId: true } }),
      this.prisma.torrentLike.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 60, select: { torrentId: true } }),
      this.prisma.torrentRating.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 60, select: { torrentId: true, score: true } }),
      this.prisma.playbackPosition.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 40, select: { torrentId: true, positionSeconds: true } }),
      this.prisma.collectionItem.findMany({ where: { addedById: userId }, orderBy: { addedAt: 'desc' }, take: 40, select: { torrentId: true } }),
      this.prisma.peer.findMany({ where: { userId }, orderBy: { lastAnnounceAt: 'desc' }, take: 30, select: { torrentId: true } }),
      this.prisma.entityFollow.findMany({ where: { userId }, select: { entityId: true } }),
    ]);

    // Une fiche masquée pour ce membre (contenu adulte désactivé) ne peut pas orienter les offres ni apparaître dans une raison.
    if (basedOn) {
      const base = await this.prisma.torrent.findUnique({ where: { id: basedOn }, select: { categoryId: true, status: true } });
      if (!base || hidden.includes(base.categoryId)) basedOn = undefined;
    }

    // --- Poids de chaque torrent avec lequel le membre a interagi
    const weight = new Map<string, number>();
    const bump = (id: string, w: number) => weight.set(id, (weight.get(id) ?? 0) + w);
    snatches.forEach((s) => bump(s.torrentId, 3));
    favs.forEach((f) => bump(f.torrentId, 3));
    likes.forEach((l) => bump(l.torrentId, 2));
    ratings.forEach((r) => bump(r.torrentId, (r.score - 3) * 1.5));
    plays.forEach((p) => bump(p.torrentId, p.positionSeconds > 120 ? 4 : 1.5));
    collItems.forEach((c) => bump(c.torrentId, 2));
    peers.forEach((p) => bump(p.torrentId, 1.5));
    if (basedOn) bump(basedOn, 10);

    // Tout ce avec quoi le membre a déjà eu affaire ne lui est pas reproposé.
    const known = new Set<string>([...weight.keys()]);
    const followedEntities = follows.map((f) => f.entityId);

    if (weight.size === 0 && followedEntities.length === 0) return this.popular(userId, hidden, limit);

    // --- Caractéristiques des torrents du profil
    const signalIds = [...weight.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 200).map(([id]) => id);
    const signalTorrents = await this.prisma.torrent.findMany({
      where: { id: { in: signalIds } },
      select: {
        id: true, name: true, categoryId: true, genres: true, language: true, origin: true, metaSource: true, metaExternalId: true,
        entities: { orderBy: { position: 'asc' }, take: 12, select: { entityId: true, role: true, entity: { select: { name: true } } } },
      },
    });

    const entityRaw = new Map<string, number>();
    const entityName = new Map<string, { name: string; role: string }>();
    const genreRaw = new Map<string, number>();
    const catRaw = new Map<string, number>();
    const langRaw = new Map<string, number>();
    const originRaw = new Map<string, number>();
    const knownMeta = new Set<string>();
    const add = <K,>(m: Map<K, number>, k: K, w: number) => m.set(k, (m.get(k) ?? 0) + w);

    for (const t of signalTorrents) {
      const w = weight.get(t.id) ?? 0;
      if (t.metaSource && t.metaExternalId) knownMeta.add(`${t.metaSource}:${t.metaExternalId}`);
      add(catRaw, t.categoryId, w);
      t.genres.forEach((g) => add(genreRaw, g, w));
      if (t.language) add(langRaw, t.language.toLowerCase(), w);
      if (t.origin) add(originRaw, t.origin, w);
      for (const e of t.entities) {
        add(entityRaw, e.entityId, w * (ROLE_WEIGHT[e.role] ?? 1));
        entityName.set(e.entityId, { name: e.entity.name, role: e.role });
      }
    }
    for (const id of followedEntities) add(entityRaw, id, 5);

    const entityScore = normalize(entityRaw);
    const genreScore = normalize(genreRaw);
    const catScore = normalize(catRaw);
    const langScore = normalize(langRaw);
    const originScore = normalize(originRaw);

    const top = <K,>(m: Map<K, number>, n: number) => [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
    const topEntities = top(entityScore, 40);
    const topGenres = top(genreScore, 8);
    const topCats = top(catScore, 5);
    if (topEntities.length === 0 && topGenres.length === 0 && topCats.length === 0) return this.popular(userId, hidden, limit);

    // --- Candidats : un mélange des plus seedés et des plus récents qui touchent au profil
    const baseWhere = {
      status: 'APPROVED' as const,
      id: { notIn: [...known] },
      uploaderId: { not: userId },
      ...(hidden.length ? { categoryId: { notIn: hidden } } : {}),
      OR: [
        ...(topEntities.length ? [{ entities: { some: { entityId: { in: topEntities } } } }] : []),
        ...(topGenres.length ? [{ genres: { hasSome: topGenres } }] : []),
        ...(topCats.length ? [{ categoryId: { in: topCats } }] : []),
      ],
    };
    const select = {
      id: true, name: true, categoryId: true, genres: true, language: true, origin: true, seeders: true, freeleech: true,
      createdAt: true, metaSource: true, metaExternalId: true,
      entities: { orderBy: { position: 'asc' as const }, take: 12, select: { entityId: true, role: true, entity: { select: { name: true } } } },
    };
    const [bySeeders, byDate] = await Promise.all([
      this.prisma.torrent.findMany({ where: baseWhere, orderBy: { seeders: 'desc' }, take: 150, select }),
      this.prisma.torrent.findMany({ where: baseWhere, orderBy: { createdAt: 'desc' }, take: 150, select }),
    ]);
    const pool = new Map<string, Candidate>();
    [...bySeeders, ...byDate].forEach((c) => pool.set(c.id, c as Candidate));

    const basedOnTorrent = basedOn ? signalTorrents.find((t) => t.id === basedOn) : undefined;
    const basedOnEntities = new Set(basedOnTorrent?.entities.map((e) => e.entityId) ?? []);
    const basedOnGenres = new Set(basedOnTorrent?.genres ?? []);
    const shortTitle = basedOnTorrent ? basedOnTorrent.name.replace(/[._]/g, ' ').replace(/\s+(\d{4}).*$/, ' ($1)').slice(0, 48) : '';

    // --- Notation
    const scored: { c: Candidate; score: number; reason: string }[] = [];
    const seenMeta = new Set<string>();
    for (const c of pool.values()) {
      const meta = c.metaSource && c.metaExternalId ? `${c.metaSource}:${c.metaExternalId}` : null;
      if (meta && knownMeta.has(meta)) continue; // une autre version d'un contenu déjà vu
      let best: { v: number; text: string } = { v: 0, text: '' };

      const entityMatches = c.entities
        .map((e) => ({ v: (entityScore.get(e.entityId) ?? 0) * (ROLE_WEIGHT[e.role] ?? 1), e }))
        .filter((m) => m.v > 0)
        .sort((a, b) => b.v - a.v);
      const entityPart = entityMatches.slice(0, 3).reduce((s, m) => s + m.v, 0) * 1.1;
      if (entityMatches[0]) {
        const m = entityMatches[0];
        const shared = basedOnEntities.has(m.e.entityId);
        best = { v: m.v * 1.1, text: shared && shortTitle ? `Comme « ${shortTitle} » — ${m.e.entity.name}` : `${ROLE_PHRASE[m.e.role] ?? 'Avec'} ${m.e.entity.name}` };
      }

      const genreMatches = c.genres.map((g) => ({ g, v: genreScore.get(g) ?? 0 })).filter((m) => m.v > 0).sort((a, b) => b.v - a.v);
      const genrePart = genreMatches.slice(0, 3).reduce((s, m) => s + m.v, 0);
      if (genreMatches[0] && genreMatches[0].v > best.v) {
        const g = genreMatches[0];
        best = { v: g.v, text: basedOnGenres.has(g.g) && shortTitle ? `Comme « ${shortTitle} » · ${g.g}` : `Dans tes genres : ${g.g}` };
      }

      const catPart = (catScore.get(c.categoryId) ?? 0) * 1.5;
      const langPart = c.language ? (langScore.get(c.language.toLowerCase()) ?? 0) * 0.6 : 0;
      const originPart = c.origin ? (originScore.get(c.origin) ?? 0) * 0.4 : 0;
      const health = Math.min(1, Math.log10(c.seeders + 1) / 2) * 0.8;
      const ageDays = (Date.now() - c.createdAt.getTime()) / 86_400_000;
      const fresh = Math.exp(-ageDays / 60) * 0.5;

      const affinity = entityPart + genrePart + catPart + langPart + originPart;
      if (affinity <= 0) continue;
      const score = (affinity + health + fresh + (c.freeleech ? 0.15 : 0)) * (0.92 + 0.16 * dailyJitter(c.id));
      const reason = best.text || (catPart > 0 ? 'Dans tes catégories préférées' : 'Selon ton historique');
      scored.push({ c, score, reason });
    }

    scored.sort((a, b) => b.score - a.score);
    const picked: typeof scored = [];
    for (const s of scored) {
      const meta = s.c.metaSource && s.c.metaExternalId ? `${s.c.metaSource}:${s.c.metaExternalId}` : null;
      if (meta) { if (seenMeta.has(meta)) continue; seenMeta.add(meta); } // une seule version par film / série
      picked.push(s);
      if (picked.length >= limit) break;
    }
    if (picked.length === 0) return this.popular(userId, hidden, limit);
    return this.hydrate(picked.map((p) => ({ id: p.c.id, reason: p.reason })));
  }

  /** Repli sans historique exploitable : ce qui est populaire en ce moment. */
  private async popular(userId: string, hidden: string[], limit: number) {
    const rows = await this.prisma.torrent.findMany({
      where: {
        status: 'APPROVED', seeders: { gt: 0 }, uploaderId: { not: userId },
        createdAt: { gt: new Date(Date.now() - 60 * 86_400_000) },
        ...(hidden.length ? { categoryId: { notIn: hidden } } : {}),
      },
      orderBy: [{ seeders: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: { id: true },
    });
    return this.hydrate(rows.map((r) => ({ id: r.id, reason: 'Populaire en ce moment' })));
  }

  private async hydrate(picks: { id: string; reason: string }[]) {
    if (picks.length === 0) return [];
    const rows = await this.prisma.torrent.findMany({ where: { id: { in: picks.map((p) => p.id) } }, include: LIST_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, toListRow(r)]));
    return picks.flatMap((p) => { const row = byId.get(p.id); return row ? [{ ...row, reason: p.reason }] : []; });
  }
}
