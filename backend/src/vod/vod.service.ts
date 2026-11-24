import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { StreamService } from '../stream/stream.service';
import { RecommendationsService } from '../torrents/recommendations.service';
import { groupKeyOf, releaseTitle } from '../torrents/group-key';
import { numOf, seriesTitleOf } from '../common/utils/watch-progress';
import { bestPerEpisode, episodeLabel, parseEpisode, videoFiles, vodAccess, vodHealth, VOD_REASON_LABELS, VOD_RULE_TEXT, type EpisodeSource, type VodReason } from '../common/utils/vod';

/** Qui regarde : le profil actif (famille) et le compte (ratio, positions de lecture, droits). */
export interface VodViewer { userId: string; accountId: string; username: string; role: string; fam: boolean }

type Kind = 'FILM' | 'SERIE';
const PAIR_TTL_MS = 5 * 60_000;
const TOKEN_DAYS = 60;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans les caractères qu'on confond (0/O, 1/I/L)

/** Une catégorie de film ou de série (une sous-catégorie sans type propre hérite de celui de sa catégorie parente). */
const kindsWhere = (kinds: Kind[]) => ({ OR: [{ contentKind: { in: kinds } }, { contentKind: null, parent: { contentKind: { in: kinds } } }] });

const CARD_SELECT = {
  id: true, name: true, coverImage: true, year: true, resolution: true, language: true, seeders: true, season: true, episode: true, size: true, createdAt: true,
  metaSource: true, metaExternalId: true, metadata: true,
  category: { select: { slug: true, contentKind: true, parent: { select: { contentKind: true } } } },
} as const;

const DETAIL_SELECT = { ...CARD_SELECT, fileList: true, subtitles: true, hdr: true, audio: true, containerFormat: true, genres: true, categoryId: true } as const;
/** Les releases d'un contenu sans leurs métadonnées complètes (lourdes) : seul le titre affiché les porte. */
const DETAIL_ROWS = { ...DETAIL_SELECT, metadata: false } as const;

/** Titre trié sans article (« Le », « The »...), pour l'ordre alphabétique et A–Z. */
const SORT_NAME = Prisma.sql`regexp_replace(lower(COALESCE(g.mtitle, regexp_replace(g.name, '[._]+', ' ', 'g'))), '^(le |la |les |l''|the |un |une |des |a |an )', '')`;
const letterSql = (e: Prisma.Sql) => Prisma.sql`translate(upper(left(${e}, 1)), 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'AAAEEEEIIOOUUUC')`;
const ORDERS: Record<string, Prisma.Sql> = {
  new: Prisma.sql`x.newest DESC`,
  seeders: Prisma.sql`x.seeders DESC, x.newest DESC`,
  name: Prisma.sql`x.sname ASC`,
  year: Prisma.sql`x.year DESC NULLS LAST, x.seeders DESC`,
  year_asc: Prisma.sql`x.year ASC NULLS LAST, x.name ASC`,
  rating: Prisma.sql`x.rating DESC NULLS LAST, x.seeders DESC`,
};

interface CardRow {
  id: string; name: string; cover: string | null; year: number | null; resolution: string | null; seeders: number; createdAt: Date; genres: string[] | null; st: string | null;
  kind: string; mtitle: string | null; overview: string | null; rating: number | null; cid: string | null; cname: string | null; grp: string; versions: number; newest: Date; sname: string;
}
interface CardOpts { kinds?: Kind[]; sort?: string; genre?: string; q?: string; letter?: string; saga?: string; ids?: string[]; limit?: number; offset?: number }

export interface VodRail {
  id: string;
  title: string;
  items: VodItem[];
  /** « Tout voir » : les critères de la liste complète. */
  more?: { kind?: string; genre?: string; sort?: string; sagas?: boolean };
}

export interface VodItem {
  id: string;
  /** « saga » : une collection de films (l'id est celui de la collection) ; sinon un film ou une série. */
  type?: 'title' | 'saga';
  genres?: string[];
  synopsis?: string;
  title: string;
  subtitle?: string;
  year?: number | null;
  kind?: 'film' | 'serie';
  cover: string | null;
  seeders?: number;
  health?: string;
  quality?: string | null;
  versions?: number;
  percent?: number | null;
  /** Lecture directe (« Reprendre », « Épisode suivant ») : sinon, on ouvre la fiche. */
  play?: { torrentId: string; fileIndex: number };
}

const kindOf = (row: any): 'film' | 'serie' => ((row.category?.contentKind ?? row.category?.parent?.contentKind) === 'SERIE' ? 'serie' : 'film');
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const metaOf = (row: any) => (row.metadata && typeof row.metadata === 'object' ? (row.metadata as any) : {});
const titleOf = (row: any): string => {
  const main = metaOf(row)?.titles?.[0]?.title;
  if (typeof main === 'string' && main.trim()) return main.trim();
  return kindOf(row) === 'serie' ? seriesTitleOf(row.name) || releaseTitle(row.name) : releaseTitle(row.name);
};
const percentOf = (pos: number, dur: number | null) => (dur && dur > 0 ? Math.min(99, Math.round((pos / dur) * 100)) : null);

/**
 * « Seeduction Cinéma » : le catalogue de l'application Android (accueil en rails, recherche, fiche, lecture). Réservé aux donateurs, fondateurs et uploaders (voir common/utils/vod.ts).
 * Le catalogue est celui du site : films et séries approuvés qui ont au moins un seeder. Rien n'est « maison » : la disponibilité d'un titre est son nombre de seeders.
 */
@Injectable()
export class VodService {
  private pairings = new Map<string, { viewer: VodViewer; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private adult: AdultService,
    private streams: StreamService,
    private recommendations: RecommendationsService,
  ) {}

  /** Le compte a-t-il (encore) droit au catalogue ? Vérifié à chaque appel : un don qui expire coupe l'accès. */
  async access(accountId: string): Promise<VodReason | null> {
    const u = await this.prisma.user.findUnique({ where: { id: accountId }, select: { role: true, founderAt: true, donorUntil: true, status: true, deletedAt: true } });
    if (!u || u.status === 'BANNED' || u.deletedAt) return null;
    return vodAccess(u);
  }

  async assertAccess(accountId: string): Promise<VodReason> {
    const reason = await this.access(accountId);
    if (!reason) throw new ForbiddenException(VOD_RULE_TEXT);
    return reason;
  }

  async status(accountId: string) {
    const reason = await this.access(accountId);
    return { eligible: !!reason, reason, label: reason ? VOD_REASON_LABELS[reason] : null, rule: VOD_RULE_TEXT };
  }

  /** Code d'association (5 minutes, une seule fois) affiché sur le site : l'application l'échange contre sa propre session, sans jamais demander le mot de passe. */
  async pair(viewer: VodViewer) {
    await this.assertAccess(viewer.accountId);
    const now = Date.now();
    for (const [k, v] of this.pairings) if (v.expiresAt < now) this.pairings.delete(k);
    if (this.pairings.size > 2000) this.pairings.clear();
    let code = '';
    do { code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (this.pairings.has(code));
    this.pairings.set(code, { viewer, expiresAt: now + PAIR_TTL_MS });
    return { code, link: `seeduction://vod/${code}`, expiresInSeconds: PAIR_TTL_MS / 1000 };
  }

  async exchange(rawCode: string) {
    const code = String(rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hit = this.pairings.get(code);
    if (!hit || hit.expiresAt < Date.now()) throw new UnauthorizedException("Code d'association invalide ou expiré : génère-en un nouveau sur le site (page Lecteur).");
    this.pairings.delete(code);
    const v = hit.viewer;
    await this.assertAccess(v.accountId);
    const payload = { sub: v.userId, username: v.username, role: v.role, ...(v.accountId !== v.userId ? { acct: v.accountId } : {}), ...(v.fam ? { fam: true } : {}) };
    const accessToken = this.jwt.sign(payload, { expiresIn: `${TOKEN_DAYS}d` });
    return { accessToken, username: v.username, expiresAt: new Date(Date.now() + TOKEN_DAYS * 86_400_000).toISOString() };
  }

  private async hiddenFor(viewer: VodViewer): Promise<string[]> {
    return this.adult.hiddenFor(viewer.userId);
  }

  // ------------------------------------------------------------------ catalogue (requêtes groupées par contenu)

  /**
   * Une ligne par contenu (même fiche de métadonnées, sinon même titre) : la release la mieux seedée le représente, `versions` compte les releases disponibles.
   * Écrit en SQL pour ne pas charger les métadonnées complètes (distribution, galerie...) de centaines de torrents à chaque écran.
   */
  private groupedSql(hidden: string[], kinds: Kind[], extra: Prisma.Sql[] = [], baseExtra: Prisma.Sql[] = []) {
    const conds: Prisma.Sql[] = [
      Prisma.sql`t.status = 'APPROVED'`,
      Prisma.sql`t.seeders >= 1`,
      Prisma.sql`COALESCE(c."contentKind", pc."contentKind")::text IN (${Prisma.join(kinds)})`,
      ...baseExtra,
    ];
    if (hidden.length) conds.push(Prisma.sql`NOT (t."categoryId" = ANY(${hidden}::text[]))`);
    const base = Prisma.sql`
      SELECT t.id, t.name, t."coverImage" AS cover, t.year, t.resolution, t.seeders, t."createdAt", t.genres, t."searchTitles" AS st,
        COALESCE(c."contentKind", pc."contentKind")::text AS kind,
        t.metadata->'titles'->0->>'title' AS mtitle, t.metadata->>'overview' AS overview,
        CASE WHEN t.metadata->>'rating' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (t.metadata->>'rating')::numeric END AS rating,
        t.metadata->'collection'->>'id' AS cid, t.metadata->'collection'->>'name' AS cname,
        COALESCE(NULLIF(t."metaSource", '') || ':' || NULLIF(t."metaExternalId", ''),
          regexp_replace(lower(t.name), '([._ ](19|20)[0-9]{2}|[._ ]s[0-9]{1,2}(e[0-9]{1,3})?)([._ ].*)?$', '')) AS grp
      FROM "Torrent" t JOIN "Category" c ON c.id = t."categoryId" LEFT JOIN "Category" pc ON pc.id = c."parentId"
      WHERE ${Prisma.join(conds, ' AND ')}`;
    const grouped = Prisma.sql`
      SELECT g.*, ${SORT_NAME} AS sname FROM (
        SELECT DISTINCT ON (b.grp) b.*, COUNT(*) OVER (PARTITION BY b.grp)::int AS versions, MAX(b."createdAt") OVER (PARTITION BY b.grp) AS newest
        FROM (${base}) b ORDER BY b.grp, b.seeders DESC, b."createdAt" DESC
      ) g`;
    return extra.length ? Prisma.sql`SELECT * FROM (${grouped}) h WHERE ${Prisma.join(extra, ' AND ')}` : grouped;
  }

  private async rows(sql: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<CardRow[]> {
    return this.prisma.$queryRaw<CardRow[]>(Prisma.sql`SELECT * FROM (${sql}) x ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`);
  }

  private card(r: CardRow): VodItem {
    const kind = r.kind === 'SERIE' ? 'serie' : 'film';
    const title = r.mtitle?.trim() || (kind === 'serie' ? seriesTitleOf(r.name) || releaseTitle(r.name) : releaseTitle(r.name));
    return {
      id: r.id, title, year: r.year ?? null, kind, cover: r.cover ?? null, seeders: r.seeders, health: vodHealth(r.seeders), quality: r.resolution ?? null,
      versions: r.versions, genres: (r.genres ?? []).slice(0, 3),
    };
  }

  private async cardsOf(hidden: string[], opts: CardOpts): Promise<{ rows: CardRow[]; items: VodItem[] }> {
    const kinds = opts.kinds ?? ['FILM', 'SERIE'];
    const base: Prisma.Sql[] = [];
    if (opts.ids) base.push(Prisma.sql`t.id = ANY(${opts.ids}::text[])`);
    if (opts.saga) base.push(Prisma.sql`t.metadata->'collection'->>'id' = ${opts.saga}`);
    const post: Prisma.Sql[] = [];
    if (opts.genre) post.push(Prisma.sql`${opts.genre} = ANY(h.genres)`);
    if (opts.letter) post.push(opts.letter === '#' ? Prisma.sql`NOT (${letterSql(Prisma.sql`h.sname`)} ~ '^[A-Z]$')` : Prisma.sql`${letterSql(Prisma.sql`h.sname`)} = ${opts.letter.toUpperCase().slice(0, 1)}`);
    if (opts.q) {
      const like = '%' + opts.q.replace(/[\\%_]/g, (c) => '\\' + c) + '%', dotted = '%' + opts.q.replace(/[\\%_]/g, (c) => '\\' + c).replace(/\s+/g, '.') + '%';
      post.push(Prisma.sql`(h.name ILIKE ${like} OR h.name ILIKE ${dotted} OR h.mtitle ILIKE ${like} OR h.st ILIKE ${like})`);
    }
    const order = ORDERS[opts.sort ?? 'new'] ?? ORDERS.new;
    const rows = await this.rows(this.groupedSql(hidden, kinds, post, base), order, opts.limit ?? 20, opts.offset ?? 0);
    return { rows, items: rows.map((r) => this.card(r)) };
  }

  /** Les genres disponibles (au moins un seeder), avec le nombre de contenus. */
  async genres(viewer: VodViewer, kind?: string) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const kinds: Kind[] = kind === 'film' ? ['FILM'] : kind === 'serie' ? ['SERIE'] : ['FILM', 'SERIE'];
    const out = await this.prisma.$queryRaw<{ name: string; n: number }[]>(Prisma.sql`SELECT g AS name, COUNT(*)::int AS n FROM (SELECT unnest(genres) AS g FROM (${this.groupedSql(hidden, kinds)}) x) y WHERE g <> '' GROUP BY g ORDER BY n DESC, g ASC LIMIT 60`);
    return { genres: out };
  }

  private async sagaItems(hidden: string[], limit = 40): Promise<VodItem[]> {
    const grouped = this.groupedSql(hidden, ['FILM'], [Prisma.sql`h.cid IS NOT NULL`]);
    const rows = await this.prisma.$queryRaw<{ cid: string; cname: string; n: number; cover: string | null; seeders: number }[]>(Prisma.sql`
      SELECT cid, MIN(cname) AS cname, COUNT(*)::int AS n, (array_agg(cover ORDER BY year ASC NULLS LAST))[1] AS cover, MAX(seeders)::int AS seeders
      FROM (${grouped}) s GROUP BY cid HAVING COUNT(*) >= 2 ORDER BY MAX(seeders) DESC, COUNT(*) DESC LIMIT ${limit}`);
    return rows.map((r) => ({ id: r.cid, type: 'saga' as const, title: String(r.cname).replace(/\s*[-–:]?\s*(saga|collection)\s*$/i, '') || r.cname, subtitle: `${r.n} films`, cover: r.cover, seeders: r.seeders, health: vodHealth(r.seeders), versions: r.n }));
  }

  async sagas(viewer: VodViewer) {
    await this.assertAccess(viewer.accountId);
    return { items: await this.sagaItems(await this.hiddenFor(viewer), 80) };
  }

  /** Les films d'une saga disponibles sur le site, dans l'ordre de sortie. */
  async saga(viewer: VodViewer, id: string) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const { rows, items } = await this.cardsOf(hidden, { kinds: ['FILM'], saga: String(id), sort: 'year_asc', limit: 40 });
    if (rows.length === 0) throw new NotFoundException('Saga introuvable');
    return { id: String(id), name: String(rows[0].cname ?? '').replace(/\s*[-–:]?\s*(saga|collection)\s*$/i, '') || rows[0].cname, items };
  }

  /** Liste paginée pour « Tout voir », les onglets Films / Séries, les genres, A–Z et la recherche. */
  async browse(viewer: VodViewer, q: { kind?: string; genre?: string; sort?: string; letter?: string; q?: string; page?: string | number; size?: string | number }) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const kinds: Kind[] = q.kind === 'film' ? ['FILM'] : q.kind === 'serie' ? ['SERIE'] : ['FILM', 'SERIE'];
    const size = Math.max(6, Math.min(60, Math.floor(Number(q.size) || 30)));
    const page = Math.max(1, Math.floor(Number(q.page) || 1));
    const term = String(q.q ?? '').trim().slice(0, 80);
    if (q.q !== undefined && term.length < 2) return { items: [] as VodItem[], page, hasMore: false };
    const { items } = await this.cardsOf(hidden, {
      kinds, sort: q.sort, genre: q.genre ? String(q.genre).slice(0, 40) : undefined, letter: q.letter ? String(q.letter).slice(0, 1) : undefined, q: term || undefined,
      limit: size + 1, offset: (page - 1) * size,
    });
    return { items: items.slice(0, size), page, hasMore: items.length > size };
  }

  async search(viewer: VodViewer, q: string) {
    const r = await this.browse(viewer, { q: String(q ?? ''), sort: 'seeders', size: 40 });
    return { items: r.items };
  }

  async home(viewer: VodViewer) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const get = (o: CardOpts) => this.cardsOf(hidden, o);
    const idsRail = async (ids: string[]) => (ids.length ? (await get({ ids, sort: 'seeders', limit: 24 })).items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : []);

    const [cont, fresh, trending, seriesNew, filmsNew, genreList, sagaList, foryou, because] = await Promise.all([
      this.streams.continueWatching(viewer.accountId).catch(() => ({ resume: [], next: [] } as any)),
      get({ sort: 'new', limit: 24 }),
      get({ sort: 'seeders', limit: 24 }),
      get({ kinds: ['SERIE'], sort: 'new', limit: 20 }),
      get({ kinds: ['FILM'], sort: 'new', limit: 20 }),
      this.genres(viewer),
      this.sagaItems(hidden, 14),
      this.recommendations.forUser(viewer.userId, { limit: 40 }).catch(() => [] as any[]),
      this.recommendations.because(viewer.userId).catch(() => ({ based: null, items: [] as any[] })),
    ]);

    const resumeItems: VodItem[] = [
      ...(cont.resume ?? []).map((r: any) => ({
        id: r.torrentId, title: r.title, subtitle: [r.season != null && r.episode != null ? episodeLabel(r.season, r.episode) : '', r.percent != null ? `${r.percent} %` : ''].filter(Boolean).join(' · ') || undefined,
        cover: r.cover ?? null, percent: r.percent ?? null, play: { torrentId: r.torrentId, fileIndex: r.fileIndex ?? 0 },
      })),
      ...(cont.next ?? []).map((n: any) => ({
        id: n.torrentId, title: n.title, subtitle: `Suite · ${episodeLabel(n.season, n.episode)}`, cover: n.cover ?? null, percent: null, play: { torrentId: n.torrentId, fileIndex: 0 },
      })),
    ];

    // L'affiche d'ouverture : un titre récent avec affiche et synopsis, qui change chaque jour parmi les cinq premiers.
    const heroRows = fresh.rows.filter((r) => r.cover && r.overview);
    const hr = heroRows.length ? heroRows[Math.floor(Date.now() / 86_400_000) % Math.min(5, heroRows.length)] : null;
    const hero = hr ? { ...this.card(hr), synopsis: hr.overview!.replace(/\s+/g, ' ').slice(0, 240) } : null;

    const topGenres = genreList.genres.slice(0, 8);
    const day = Math.floor(Date.now() / 86_400_000);
    const pickedGenres = topGenres.length ? [0, 1, 2].map((i) => topGenres[(day + i * 3) % topGenres.length]).filter((g, i, a) => a.findIndex((x) => x.name === g.name) === i) : [];
    const genreRails = await Promise.all(pickedGenres.map(async (g) => ({ id: `genre-${g.name}`, title: g.name, items: (await get({ genre: g.name, sort: 'seeders', limit: 20 })).items, more: { genre: g.name, sort: 'seeders' } })));

    const rails: VodRail[] = [
      { id: 'continue', title: 'Reprendre', items: resumeItems },
      { id: 'foryou', title: 'Recommandé pour toi', items: await idsRail((foryou as any[]).map((x) => x.id).filter(Boolean)) },
      ...(because.based ? [{ id: 'because', title: `Parce que tu as aimé ${because.based.title}`, items: await idsRail((because.items as any[]).map((x) => x.id).filter(Boolean)) }] : []),
      { id: 'new', title: 'Nouveautés', items: fresh.items, more: { sort: 'new' } },
      { id: 'trending', title: 'Les plus regardés en ce moment', items: trending.items, more: { sort: 'seeders' } },
      { id: 'sagas', title: 'Sagas', items: sagaList, more: { sagas: true } },
      { id: 'films-new', title: 'Films récents', items: filmsNew.items, more: { kind: 'film', sort: 'new' } },
      { id: 'series-new', title: 'Séries à découvrir', items: seriesNew.items, more: { kind: 'serie', sort: 'new' } },
      ...genreRails,
    ].filter((r) => r.items.length > 0);
    return { hero, rails };
  }

  /** Fiche d'un contenu : synopsis, versions (qualité, langue, seeders) ou, pour une série, un épisode par ligne avec la release la mieux seedée. */
  async title(viewer: VodViewer, id: string) {
    await this.assertAccess(viewer.accountId);
    const hidden = await this.hiddenFor(viewer);
    const t: any = await this.prisma.torrent.findFirst({ where: { id, status: 'APPROVED', category: kindsWhere(['FILM', 'SERIE']) }, select: DETAIL_SELECT });
    if (!t || hidden.includes(t.categoryId)) throw new NotFoundException('Titre introuvable');

    const key = groupKeyOf({ name: t.name, metaSource: t.metaSource, metaExternalId: t.metaExternalId, category: { slug: t.category?.slug } });
    let rows: any[];
    if (t.metaSource && t.metaExternalId) {
      rows = await this.prisma.torrent.findMany({ where: { status: 'APPROVED', metaSource: t.metaSource, metaExternalId: t.metaExternalId, ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) }, take: 400, select: DETAIL_ROWS });
    } else {
      const dotted = releaseTitle(t.name).split(/\s+/).join('.');
      rows = (await this.prisma.torrent.findMany({
        where: { status: 'APPROVED', name: { contains: dotted, mode: 'insensitive' }, category: kindsWhere(['FILM', 'SERIE']), ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) }, take: 200, select: DETAIL_ROWS,
      })).filter((r: any) => groupKeyOf({ name: r.name, metaSource: r.metaSource, metaExternalId: r.metaExternalId, category: { slug: r.category?.slug } }) === key);
      if (!rows.some((r) => r.id === t.id)) rows.push(t);
    }
    rows = rows.filter((r) => r.seeders >= 1).sort((a, b) => b.seeders - a.seeders || b.createdAt.getTime() - a.createdAt.getTime());
    if (rows.length === 0) rows = [t];

    const positions = await this.prisma.playbackPosition.findMany({
      where: { userId: viewer.accountId, torrentId: { in: rows.map((r) => r.id) } },
      select: { torrentId: true, fileIndex: true, positionSeconds: true, durationSeconds: true },
    });
    const progress = new Map(positions.map((p) => [`${p.torrentId}:${p.fileIndex}`, p]));
    const progressOf = (torrentId: string, fileIndex: number) => {
      const p = progress.get(`${torrentId}:${fileIndex}`);
      return p ? { percent: percentOf(p.positionSeconds, p.durationSeconds), positionSeconds: p.positionSeconds } : { percent: null, positionSeconds: 0 };
    };

    const kind = kindOf(t);
    const m = metaOf(t);
    const versions = rows.slice(0, 40).map((r) => {
      const files = videoFiles(r.fileList);
      const main = files.length ? files.reduce((a, b) => (b.size > a.size ? b : a)) : null;
      const fileIndex = main?.index ?? 0;
      return {
        id: r.id, name: r.name, size: Number(r.size), seeders: r.seeders, health: vodHealth(r.seeders), resolution: r.resolution ?? null, language: r.language ?? null,
        label: [r.resolution, r.language, r.hdr ? 'HDR' : null, r.containerFormat].filter(Boolean).join(' · ') || 'Version',
        subtitles: r.subtitles ?? [], audio: r.audio ?? null, fileIndex, ...progressOf(r.id, fileIndex),
      };
    });

    let episodes: any[] | undefined;
    if (kind === 'serie') {
      const sources: EpisodeSource[] = [];
      for (const r of rows) {
        const files = videoFiles(r.fileList);
        const list = files.length ? files : [{ index: 0, path: r.name, size: Number(r.size) }];
        for (const f of list) {
          let ep = parseEpisode(f.path);
          if (!ep && list.length === 1) {
            const s = numOf(r.season), e = numOf(r.episode);
            ep = s != null && e != null ? { season: s, episode: e } : parseEpisode(r.name);
          }
          sources.push({ torrentId: r.id, fileIndex: f.index, season: ep?.season ?? null, episode: ep?.episode ?? null, size: f.size, seeders: r.seeders, resolution: r.resolution ?? null, language: r.language ?? null, label: baseName(f.path) });
        }
      }
      episodes = bestPerEpisode(sources).slice(0, 600).map((s) => ({
        season: s.season, episode: s.episode, label: episodeLabel(s.season, s.episode) || s.label, name: s.label, torrentId: s.torrentId, fileIndex: s.fileIndex,
        size: s.size, seeders: s.seeders, health: vodHealth(s.seeders), resolution: s.resolution, language: s.language, ...progressOf(s.torrentId, s.fileIndex),
      }));
    }

    // Dans la même saga, et des titres du même genre (même catégorie de contenu).
    const cid = m.collection?.id != null ? String(m.collection.id) : null;
    const [sagaCards, similarCards] = await Promise.all([
      cid ? this.cardsOf(hidden, { kinds: ['FILM'], saga: cid, sort: 'year_asc', limit: 20 }) : Promise.resolve(null),
      Array.isArray(t.genres) && t.genres.length ? this.cardsOf(hidden, { kinds: [kind === 'serie' ? 'SERIE' : 'FILM'], genre: t.genres[0], sort: 'seeders', limit: 18 }) : Promise.resolve(null),
    ]);
    const myTitle = titleOf(t);
    const saga = sagaCards && sagaCards.items.length >= 2 ? { id: cid, name: String(m.collection?.name ?? '').replace(/\s*[-–:]?\s*(saga|collection)\s*$/i, '') || m.collection?.name, items: sagaCards.items } : null;
    const similar = (similarCards?.items ?? []).filter((i) => i.title !== myTitle).slice(0, 14);

    const rating = Number(m.rating);
    return {
      id: t.id, title: titleOf(t), year: t.year ?? null, kind, cover: t.coverImage ?? null,
      backdrop: typeof m.backdrop === 'string' ? m.backdrop : null,
      synopsis: typeof m.overview === 'string' && m.overview.trim() ? m.overview.trim() : null,
      rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
      runtime: Number(m.runtime) || null,
      genres: Array.isArray(t.genres) ? t.genres.slice(0, 6) : [],
      versions, ...(episodes ? { episodes } : {}), saga, similar,
    };
  }

  /** Jeton de lecture pour l'application : elle l'ouvre comme un lien seeduction://stream/<jeton> ; le .torrent remis porte `vod=1` (téléchargement non compté pour le spectateur). */
  async play(viewer: VodViewer, torrentId: string, fileIndexRaw: unknown) {
    await this.assertAccess(viewer.accountId);
    const t = await this.prisma.torrent.findUnique({ where: { id: String(torrentId ?? '') }, select: { status: true, seeders: true, categoryId: true, fileList: true } });
    if (!t || t.status !== 'APPROVED') throw new NotFoundException('Titre introuvable');
    if ((await this.hiddenFor(viewer)).includes(t.categoryId)) throw new ForbiddenException('Ce contenu est réservé aux adultes : active-le dans ton profil.');
    if (t.seeders < 1) throw new ConflictException('Plus aucun seeder pour cette version : réessaie plus tard ou choisis-en une autre.');
    const n = Array.isArray(t.fileList) ? t.fileList.length : 1;
    const fileIndex = Math.max(0, Math.min(Math.floor(Number(fileIndexRaw) || 0), Math.max(0, n - 1)));
    const token = this.streams.createPlaySession(viewer.accountId, String(torrentId), fileIndex, viewer.userId, true);
    return { token };
  }
}
