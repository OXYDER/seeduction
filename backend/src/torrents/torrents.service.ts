import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { parseTorrentFile, rewriteTorrentForUser, sanitizeTorrentForUpload } from '../common/utils/torrent-file';
import { MetadataService } from '../metadata/metadata.service';
import { parseCoverage } from '../common/utils/coverage';
import * as fs from 'fs/promises';
import * as path from 'path';

const STORAGE_DIR = process.env.TORRENT_STORAGE_DIR ?? './storage/torrents';
const ANNOUNCE_BASE_URL = process.env.ANNOUNCE_BASE_URL ?? 'https://tracker.example.com/tracker';

@Injectable()
export class TorrentsService {
  constructor(private prisma: PrismaService, private metadata: MetadataService) {}

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
    fps?: number;
    durationMinutes?: number;
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
        fps: params.fps,
        durationMinutes: params.durationMinutes,
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

    const original = await fs.readFile(torrent.filePath);
    const announceUrl = `${ANNOUNCE_BASE_URL}/${user.passkey}/announce`;
    return rewriteTorrentForUser(original, announceUrl);
  }

  async list(params: {
    categoryId?: string; search?: string; uploaderId?: string; page: number; pageSize: number;
    sort?: string;
    order?: 'asc' | 'desc';
    minSize?: number; maxSize?: number; minSeeders?: number;
    year?: number; language?: string; resolution?: string; codec?: string;
    hdr?: boolean; audio?: string; source?: string; containerFormat?: string;
    entityId?: string; role?: string; hideAnonymous?: boolean;
  }) {
    const where: any = { status: 'APPROVED' };
    if (params.categoryId) {
      // Choisir une catégorie parente inclut aussi ses sous-catégories.
      const ids = await this.prisma.category.findMany({
        where: { OR: [{ id: params.categoryId }, { parentId: params.categoryId }] },
        select: { id: true },
      });
      where.categoryId = { in: ids.map((c) => c.id) };
    }
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
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
    if (params.containerFormat) where.containerFormat = { equals: params.containerFormat, mode: 'insensitive' };

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
        include: { category: true, uploader: { select: { id: true, username: true } } },
      }),
      this.prisma.torrent.count({ where }),
    ]);

    // Extrait du synopsis pour l'infobulle de la liste (le JSON complet reste sur la fiche).
    const rows = items.map(({ metadata, ...t }) => {
      const overview = (metadata as any)?.overview;
      const synopsis = typeof overview === 'string' && overview.trim() ? overview.trim().replace(/\s+/g, ' ') : null;
      return { ...t, synopsis: synopsis && synopsis.length > 320 ? `${synopsis.slice(0, 317).trimEnd()}…` : synopsis };
    });

    return { items: rows, total, page: params.page, pageSize: params.pageSize };
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

  async findOne(id: string) {
    const torrent = await this.prisma.torrent.findUnique({
      where: { id },
      include: {
        category: true,
        uploader: { select: { id: true, username: true } },
        entities: { include: { entity: true }, orderBy: [{ role: 'asc' }, { position: 'asc' }] },
      },
    });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    return torrent;
  }
}
