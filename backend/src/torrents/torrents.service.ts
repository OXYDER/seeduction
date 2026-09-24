import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdultService } from '../adult/adult.service';
import { PrismaService } from '../common/prisma.service';
import { parseTorrentFile, rewriteTorrentForUser, sanitizeTorrentForUpload } from '../common/utils/torrent-file';
import { MetadataService } from '../metadata/metadata.service';
import { parseCoverage } from '../common/utils/coverage';
import * as fs from 'fs/promises';
import * as path from 'path';

const STORAGE_DIR = process.env.TORRENT_STORAGE_DIR ?? './storage/torrents';
const ANNOUNCE_BASE_URL = process.env.ANNOUNCE_BASE_URL ?? 'https://tracker.example.com/tracker';

export interface TorrentFilters {
    categoryId?: string; search?: string; uploaderId?: string; page?: number; pageSize?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    minSize?: number; maxSize?: number; minSeeders?: number;
    year?: number; language?: string; resolution?: string; codec?: string;
    hdr?: boolean; audio?: string; source?: string; containerFormat?: string; origin?: string; genre?: string;
    entityId?: string; role?: string; hideAnonymous?: boolean; viewerId?: string;
    /** all = torrents actifs (défaut) ; noseeders = approuvés sans seeder ; dead = retirés des listes après une longue inactivité. */
    state?: 'noseeders' | 'dead';
  }

@Injectable()
export class TorrentsService {
  constructor(private prisma: PrismaService, private metadata: MetadataService, private adult: AdultService) {}

  /** Une catégorie principale qui a des sous-catégories n'est pas sélectionnable : il faut choisir une sous-catégorie. */
  private async assertSelectableCategory(categoryId: string) {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, _count: { select: { children: true } } } });
    if (!cat) throw new BadRequestException('Catégorie introuvable');
    if (cat._count.children > 0) throw new BadRequestException('Choisissez une sous-catégorie (les catégories principales ne sont pas sélectionnables)');
  }

  async upload(params: {
    userId: string;
    fileBuffer: Buffer;
    name: string;
    description?: string;
    categoryId: string;
    tags: string[];
    anonymous: boolean;
    coverImage?: string;
    metaKind?: string;
    metaId?: string;
    year?: number;
    language?: string;
    resolution?: string;
    codec?: string;
    hdr?: boolean;
    audio?: string;
    source?: string;
    containerFormat?: string;
    origin?: string;
    fps?: number;
    durationMinutes?: number;
    season?: string;
    episode?: string;
    genres?: string[];
    videoType?: string;
    nfo?: string;
  }) {
    // On stocke (et on calcule l'info_hash sur) la version nettoyée : trackers
    // externes retirés, flag private forcé — voir sanitizeTorrentForUpload.
    let cleanBuffer: Buffer;
    let parsed: ReturnType<typeof parseTorrentFile>;
    try {
      cleanBuffer = sanitizeTorrentForUpload(params.fileBuffer);
      parsed = parseTorrentFile(cleanBuffer);
    } catch {
      throw new BadRequestException('Fichier .torrent invalide ou illisible');
    }

    const existing = await this.prisma.torrent.findUnique({ where: { infoHash: parsed.infoHash } });
    if (existing) throw new BadRequestException('Ce torrent existe déjà sur le tracker (dupe)');

    await fs.mkdir(STORAGE_DIR, { recursive: true });
    await this.assertSelectableCategory(params.categoryId);
    const storedPath = path.join(STORAGE_DIR, `${parsed.infoHash}.torrent`);
    await fs.writeFile(storedPath, cleanBuffer);

    const torrent = await this.prisma.torrent.create({
      data: {
        infoHash: parsed.infoHash,
        name: params.name || parsed.name,
        description: params.description,
        filePath: storedPath,
        size: BigInt(parsed.totalSize),
        fileList: parsed.files,
        categoryId: params.categoryId,
        uploaderId: params.userId,
        anonymousUpload: params.anonymous,
        coverImage: params.coverImage || null,
        tags: params.tags,
        year: params.year,
        language: params.language,
        resolution: params.resolution,
        codec: params.codec,
        hdr: params.hdr ?? false,
        audio: params.audio,
        source: params.source,
        containerFormat: params.containerFormat,
        origin: params.origin,
        fps: params.fps,
        durationMinutes: params.durationMinutes,
        season: params.season,
        episode: params.episode,
        genres: params.genres ?? [],
        videoType: params.videoType,
        ...(params.nfo ? { nfoFile: { create: { content: params.nfo } } } : {}),
      },
    });

    // Fiche complète (acteurs, studios, genres...) : ne doit jamais faire échouer l'upload.
    if (params.metaKind && params.metaId) {
      try {
        await this.metadata.attach(torrent.id, params.metaKind, params.metaId);
      } catch {
        // La fiche pourra être rattachée plus tard ; le torrent lui-même est déjà enregistré.
      }
    }

    return torrent;
  }

  /** Génère à la volée le .torrent avec l'announce URL personnalisée (passkey) de l'utilisateur qui télécharge. */
  async getDownloadFile(torrentId: string, userId: string): Promise<Buffer> {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!['MODERATOR', 'ADMIN', 'OWNER'].includes(user.role) && (await this.adult.hiddenFor(userId)).includes(torrent.categoryId)) {
      throw new ForbiddenException('Ce contenu est réservé aux adultes : active-le dans ton profil.');
    }

    const original = await fs.readFile(torrent.filePath);
    const announceUrl = `${ANNOUNCE_BASE_URL}/${user.passkey}/announce`;
    return rewriteTorrentForUser(original, announceUrl);
  }

  /** Torrents déjà présents qui ressemblent à celui qu'on s'apprête à envoyer (même fiche de métadonnées, ou même nom). */
  async findDuplicates(metaId?: string, name?: string, viewerId?: string) {
    const hiddenCategories = await this.adult.hiddenFor(viewerId);
    const or: any[] = [];
    if (metaId) or.push({ metaExternalId: metaId });
    if (name && name.trim().length >= 4) or.push({ name: { equals: name.trim(), mode: 'insensitive' } });
    if (or.length === 0) return [];
    return this.prisma.torrent.findMany({
      where: { status: { in: ['APPROVED', 'PENDING'] }, OR: or, ...(hiddenCategories.length ? { categoryId: { notIn: hiddenCategories } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, size: true, year: true, resolution: true, language: true, seeders: true, status: true, coverImage: true },
    });
  }

  private async buildWhere(params: TorrentFilters) {
    const where: any = { status: params.state === 'dead' ? 'DEAD' : 'APPROVED' };
    if (params.state === 'noseeders') where.seeders = 0;
    // Catégories adultes : invisibles tant que le membre n'a pas activé l'option dans son compte.
    const hiddenCategories = await this.adult.hiddenFor(params.viewerId);
    if (hiddenCategories.length) where.AND = [...(where.AND ?? []), { categoryId: { notIn: hiddenCategories } }];
    if (params.categoryId) {
      // Choisir une catégorie parente inclut aussi ses sous-catégories.
      const ids = await this.prisma.category.findMany({
        where: { OR: [{ id: params.categoryId }, { parentId: params.categoryId }] },
        select: { id: true },
      });
      where.categoryId = { in: ids.map((c) => c.id) };
    }
    if (params.search) {
      // Cherche dans le nom du torrent ET dans les titres du film / de la série en plusieurs langues (avec ou sans accents).
      const plain = params.search.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { searchTitles: { contains: params.search, mode: 'insensitive' } },
        ...(plain !== params.search ? [{ searchTitles: { contains: plain, mode: 'insensitive' } }, { name: { contains: plain, mode: 'insensitive' } }] : []),
      ];
    }
    if (params.uploaderId) where.uploaderId = params.uploaderId;
    if (params.hideAnonymous) where.anonymousUpload = false;
    if (params.entityId) where.entities = { some: { entityId: params.entityId, ...(params.role ? { role: params.role } : {}) } };
    if (params.minSize != null || params.maxSize != null) {
      where.size = {};
      if (params.minSize != null) where.size.gte = BigInt(Math.round(params.minSize));
      if (params.maxSize != null) where.size.lte = BigInt(Math.round(params.maxSize));
    }
    if (params.minSeeders != null) where.seeders = { gte: params.minSeeders };
    if (params.year != null) where.year = params.year;
    if (params.language) where.language = { equals: params.language, mode: 'insensitive' };
    if (params.resolution) where.resolution = { equals: params.resolution, mode: 'insensitive' };
    if (params.codec) where.codec = { equals: params.codec, mode: 'insensitive' };
    if (params.hdr) where.hdr = true;
    if (params.audio) where.audio = { equals: params.audio, mode: 'insensitive' };
    if (params.source) where.source = { equals: params.source, mode: 'insensitive' };
    if (params.genre) where.genres = { has: params.genre };
    if (params.containerFormat) where.containerFormat = { equals: params.containerFormat, mode: 'insensitive' };
    if (params.origin) where.origin = params.origin;
    return where;
  }

  /**
   * Valeurs disponibles pour chaque filtre (avec le nombre de torrents) selon la liste affichée : chaque filtre est calculé
   * en ignorant sa propre sélection, pour qu'on puisse en changer sans repartir de zéro.
   */
  async facets(params: TorrentFilters) {
    const FIELDS = ['resolution', 'source', 'origin', 'language', 'codec', 'audio', 'containerFormat'] as const;
    const out: Record<string, { value: string; count: number }[]> = {};
    for (const field of FIELDS) {
      const where = await this.buildWhere({ ...params, [field]: undefined });
      const groups: any[] = await (this.prisma.torrent.groupBy as any)({ by: [field], where: { ...where, [field]: { not: null } }, _count: { _all: true } });
      out[field] = groups.map((g) => ({ value: g[field] as string, count: g._count._all as number })).filter((g) => g.value).sort((x, y) => y.count - x.count);
    }
    const genreWhere = await this.buildWhere({ ...params, genre: undefined });
    const gRows = await this.prisma.torrent.findMany({ where: { ...genreWhere, genres: { isEmpty: false } }, select: { genres: true }, take: 5000 });
    const counts = new Map<string, number>();
    for (const r of gRows) for (const g of r.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    out.genre = [...counts].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
    const hdrWhere = await this.buildWhere({ ...params, hdr: undefined });
    out.hdr = [{ value: 'HDR', count: await this.prisma.torrent.count({ where: { ...hdrWhere, hdr: true } }) }].filter((x) => x.count > 0);
    return out;
  }

  async list(params: TorrentFilters & { page: number; pageSize: number }) {
    const where = await this.buildWhere(params);

    // Champ de tri + sens par défaut (cliquer sur un titre de colonne inverse le sens).
    const SORTS: Record<string, { build: (dir: 'asc' | 'desc') => any; dir: 'asc' | 'desc' }> = {
      date: { build: (d) => ({ createdAt: d }), dir: 'desc' },
      taille: { build: (d) => ({ size: d }), dir: 'desc' },
      seeders: { build: (d) => ({ seeders: d }), dir: 'desc' },
      leechers: { build: (d) => ({ leechers: d }), dir: 'desc' },
      popularite: { build: (d) => ({ completedCount: d }), dir: 'desc' },
      activite: { build: (d) => ({ updatedAt: d }), dir: 'desc' },
      nom: { build: (d) => ({ name: d }), dir: 'asc' },
      categorie: { build: (d) => ({ category: { name: d } }), dir: 'asc' },
      uploader: { build: (d) => ({ uploader: { username: d } }), dir: 'asc' },
    };
    const sortDef = SORTS[params.sort ?? 'date'] ?? SORTS.date;
    const orderBy: any = sortDef.build(params.order ?? sortDef.dir);

    const [items, total] = await Promise.all([
      this.prisma.torrent.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { category: { include: { parent: { select: { slug: true, name: true } } } }, uploader: { select: { id: true, username: true } } },
      }),
      this.prisma.torrent.count({ where }),
    ]);

    // Extrait du synopsis pour l'infobulle de la liste (le JSON complet reste sur la fiche).
    const rows = items.map(({ metadata, ...t }) => {
      const overview = (metadata as any)?.overview;
      const synopsis = typeof overview === 'string' && overview.trim() ? overview.trim().replace(/\s+/g, ' ') : null;
      const backdrop = (metadata as any)?.backdrop;
      return { ...t, backdrop: typeof backdrop === 'string' ? backdrop : null, synopsis: synopsis && synopsis.length > 320 ? `${synopsis.slice(0, 317).trimEnd()}…` : synopsis };
    });

    return { items: rows, total, page: params.page, pageSize: params.pageSize };
  }

  /**
   * Autres versions du même contenu sur le site (même fiche TMDB / Deezer / etc., et même saison / épisode pour une série) :
   * qualité, source, codec, taille, uploader... La version affichée est incluse et marquée.
   */
  async versions(id: string, viewer?: { userId: string; role: string }) {
    const t = await this.prisma.torrent.findUnique({ where: { id }, select: { metaSource: true, metaExternalId: true, season: true, episode: true, categoryId: true } });
    if (!t || !t.metaSource || !t.metaExternalId) return [];
    if (!['MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '') && (await this.adult.hiddenFor(viewer?.userId)).includes(t.categoryId)) return [];
    const rows = await this.prisma.torrent.findMany({
      where: {
        OR: [
          { id },
          { status: 'APPROVED', metaSource: t.metaSource, metaExternalId: t.metaExternalId, ...(t.season ? { season: t.season, episode: t.episode } : {}) },
        ],
      },
      select: {
        id: true, name: true, size: true, resolution: true, source: true, codec: true, audio: true, language: true, hdr: true, containerFormat: true,
        seeders: true, leechers: true, freeleech: true, createdAt: true, anonymousUpload: true, uploader: { select: { id: true, username: true } },
      },
      take: 60,
    });
    const rank = (r?: string | null) => (r?.startsWith('4K') ? 4 : r === '1080p' ? 3 : r === '720p' ? 2 : r ? 1 : 0);
    return rows
      .sort((a, b) => rank(b.resolution) - rank(a.resolution) || Number(b.size) - Number(a.size))
      .map((r) => ({ ...r, uploader: r.anonymousUpload ? null : r.uploader, current: r.id === id }));
  }

  /**
   * Films de la même saga / saisons et épisodes de la même série, avec ce qui
   * est disponible sur Seeduction (torrents approuvés liés à la même fiche TMDB).
   */
  async related(id: string) {
    const t = await this.prisma.torrent.findUnique({ where: { id }, select: { metaSource: true, metaExternalId: true, metadata: true } });
    if (!t || t.metaSource !== 'tmdb' || !t.metaExternalId) return { kind: null };
    const info = (t.metadata ?? {}) as any;
    const card = { id: true, name: true, size: true, year: true, resolution: true, language: true, seeders: true, leechers: true, coverImage: true };

    if (info.kind === 'movie') {
      const parts: any[] = info.collection?.parts ?? [];
      const ids = parts.map((p) => String(p.tmdbId));
      const found = ids.length
        ? await this.prisma.torrent.findMany({
            where: { status: 'APPROVED', metaSource: 'tmdb', metaExternalId: { in: ids }, metadata: { path: ['kind'], equals: 'movie' } },
            select: { ...card, metaExternalId: true },
            orderBy: { seeders: 'desc' },
          })
        : [];
      return {
        kind: 'movie',
        collection: info.collection ? { id: info.collection.id, name: info.collection.name } : null,
        currentTmdbId: t.metaExternalId,
        parts: parts.map((p) => ({ ...p, torrents: found.filter((f) => f.metaExternalId === String(p.tmdbId)) })),
      };
    }

    if (info.kind === 'tv') {
      const same = await this.prisma.torrent.findMany({
        where: { status: 'APPROVED', metaSource: 'tmdb', metaExternalId: t.metaExternalId, metadata: { path: ['kind'], equals: 'tv' } },
        select: { ...card, fileList: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        kind: 'tv',
        tmdbId: t.metaExternalId,
        seasons: info.seasonList ?? [],
        torrents: same.map(({ fileList, ...rest }) => ({ ...rest, coverage: parseCoverage(rest.name, (fileList as any[]) ?? []) })),
      };
    }

    return { kind: null };
  }

  private readonly cardSelect = {
    id: true, name: true, coverImage: true, year: true, resolution: true, language: true, size: true,
    seeders: true, leechers: true, freeleech: true, doubleUpload: true, createdAt: true, category: { select: { name: true, slug: true, parent: { select: { slug: true, name: true } } } },
  } as const;

  /** Nouveaux torrents (30 jours) liés à des acteurs, studios, genres... auxquels le membre est abonné. */
  async followedFeed(userId: string) {
    const [hidden, follows] = await Promise.all([
      this.adult.hiddenFor(userId),
      this.prisma.entityFollow.findMany({ where: { userId }, select: { entityId: true } }),
    ]);
    if (follows.length === 0) return [];
    return this.prisma.torrent.findMany({
      where: {
        status: 'APPROVED',
        createdAt: { gt: new Date(Date.now() - 30 * 86400_000) },
        entities: { some: { entityId: { in: follows.map((f) => f.entityId) } } },
        ...(hidden.length ? { categoryId: { notIn: hidden } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: this.cardSelect,
    });
  }

  /**
   * Recommandations : torrents qui partagent des acteurs, studios, artistes, genres... avec ce que le membre a
   * déjà complété (les plus proches d'abord), en excluant ce qu'il a déjà.
   */
  async recommended(userId: string) {
    const [hidden, snatches] = await Promise.all([
      this.adult.hiddenFor(userId),
      this.prisma.snatch.findMany({ where: { userId }, orderBy: { completedAt: 'desc' }, take: 25, select: { torrentId: true } }),
    ]);
    const owned = snatches.map((s) => s.torrentId);
    if (owned.length === 0) return [];
    const links = await this.prisma.torrentEntity.findMany({ where: { torrentId: { in: owned } }, select: { entityId: true } });
    const entityIds = [...new Set(links.map((l) => l.entityId))].slice(0, 80);
    if (entityIds.length === 0) return [];

    const ranked = await this.prisma.torrentEntity.groupBy({
      by: ['torrentId'],
      where: {
        entityId: { in: entityIds },
        torrentId: { notIn: owned },
        torrent: { status: 'APPROVED', uploaderId: { not: userId }, ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) },
      },
      _count: { _all: true },
      orderBy: { _count: { torrentId: 'desc' } },
      take: 16,
    });
    if (ranked.length === 0) return [];
    const torrents = await this.prisma.torrent.findMany({ where: { id: { in: ranked.map((r) => r.torrentId) } }, select: this.cardSelect });
    const order = new Map(ranked.map((r, i) => [r.torrentId, i]));
    return torrents.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  }

  /** Torrents que le membre télécharge ou seede en ce moment (d'après ses derniers announces), avec leur avancement. */
  async activeForUser(userId: string) {
    const hidden = await this.adult.hiddenFor(userId);
    const peers = await this.prisma.peer.findMany({
      where: { userId, torrent: { status: 'APPROVED', ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) } },
      orderBy: { lastAnnounceAt: 'desc' },
      take: 40,
      include: { torrent: { select: { id: true, name: true, coverImage: true, size: true, category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } } } } },
    });
    const seen = new Set<string>();
    return peers
      .filter((p) => (seen.has(p.torrentId) ? false : (seen.add(p.torrentId), true)))
      .map((p) => {
        const size = Number(p.torrent.size) || 0;
        const left = Number(p.left) || 0;
        return {
          ...p.torrent,
          isSeeder: p.isSeeder,
          progress: p.isSeeder || size === 0 ? 1 : Math.max(0, Math.min(1, 1 - left / size)),
          lastAnnounceAt: p.lastAnnounceAt,
        };
      });
  }

  /** Infos légères pour l'infobulle d'un torrent (pochette, détails de base, extrait du synopsis). */
  async preview(id: string, viewer?: { userId: string; role: string }) {
    const t = await this.prisma.torrent.findUnique({
      where: { id },
      select: {
        id: true, name: true, coverImage: true, year: true, resolution: true, language: true, size: true, seeders: true, leechers: true,
        createdAt: true, status: true, categoryId: true, category: { select: { name: true, slug: true, parent: { select: { slug: true, name: true } } } }, metadata: true,
      },
    });
    const staff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '');
    if (!t || (t.status !== 'APPROVED' && !staff)) throw new NotFoundException('Torrent introuvable');
    if (!staff && (await this.adult.hiddenFor(viewer?.userId)).includes(t.categoryId)) throw new ForbiddenException('Contenu masqué');

    const { metadata, categoryId, status, ...rest } = t;
    const overview = (metadata as any)?.overview;
    const synopsis = typeof overview === 'string' && overview.trim() ? overview.trim().replace(/\s+/g, ' ') : null;
    return { ...rest, synopsis: synopsis && synopsis.length > 320 ? `${synopsis.slice(0, 317).trimEnd()}…` : synopsis };
  }

  /** NFO d'un torrent (même visibilité que la fiche). */
  async getNfo(id: string, viewer?: { userId: string; role: string }) {
    await this.findOne(id, viewer);
    const nfo = await this.prisma.torrentNfo.findUnique({ where: { torrentId: id } });
    return { content: nfo?.content ?? null };
  }

  async findOne(id: string, viewer?: { userId: string; role: string }) {
    const torrent = await this.prisma.torrent.findUnique({
      where: { id },
      include: {
        category: true,
        uploader: { select: { id: true, username: true } },
        entities: { include: { entity: true }, orderBy: [{ role: 'asc' }, { position: 'asc' }] },
      },
    });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    // Le staff garde l'accès (modération) ; les autres doivent avoir activé le contenu adulte.
    if (!['MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '')) {
      const hidden = await this.adult.hiddenFor(viewer?.userId);
      if (hidden.includes(torrent.categoryId)) {
        throw new ForbiddenException('Ce contenu est réservé aux adultes : active l\'affichage du contenu pour adultes dans ton profil pour y accéder.');
      }
    }
    return torrent;
  }
}
