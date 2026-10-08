import { Injectable, BadRequestException, ForbiddenException, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FACETS, facetKeysFor, normalizeAttrs } from '../common/utils/facet-schema';
import { detectAttrs } from '../common/utils/attr-detect';
import { TeamsService } from '../teams/teams.service';
import { AdultService } from '../adult/adult.service';
import { PrismaService } from '../common/prisma.service';
import { parseTorrentFile, rewriteTorrentForUser, sanitizeTorrentForUpload } from '../common/utils/torrent-file';
import { MetadataService } from '../metadata/metadata.service';
import { parseCoverage } from '../common/utils/coverage';
import { languageAtoms, normalizeLanguage, storedValuesFor } from '../common/utils/language';
import { extractInstallNotes } from '../common/utils/install-notes';
import { audioOf } from '../importer/audio-codec';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs/promises';
import * as path from 'path';

const STORAGE_DIR = process.env.TORRENT_STORAGE_DIR ?? './storage/torrents';
const ANNOUNCE_BASE_URL = process.env.ANNOUNCE_BASE_URL ?? 'https://tracker.example.com/tracker';

export interface TorrentFilters {
    /** Filtres propres à la catégorie : { clé: [valeurs acceptées] } (OU entre les valeurs d'une clé, ET entre les clés). */
    attrFilters?: Record<string, string[]>;
    categoryId?: string; search?: string; uploaderId?: string; page?: number; pageSize?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    minSize?: number; maxSize?: number; minSeeders?: number; maxSeeders?: number;
    year?: number; language?: string; resolution?: string; codec?: string;
    hdr?: boolean; audio?: string; source?: string; containerFormat?: string; origin?: string; genre?: string;
    entityId?: string; role?: string; hideAnonymous?: boolean; viewerId?: string;
    /** all = torrents actifs (défaut) ; noseeders = approuvés sans seeder ; dead = retirés des listes après une longue inactivité. */
    state?: 'noseeders' | 'dead';
    /** Ajoutés dans les dernières 24h / 7 jours / 30 jours (Accueil : Derniers torrents / Les plus populaires). */
    period?: 'day' | 'week' | 'month';
  }

/** Inclusions communes à toutes les listes de torrents (Parcourir, favoris, collections, recommandations...). */
export const LIST_INCLUDE = {
  // parent.contentKind : nécessaire pour savoir si une sous-catégorie sans contentKind propre (héritée du
  // parent) est de la vidéo, afin d'afficher ou non le bouton "Visionner" dans la liste.
  category: { include: { parent: { select: { slug: true, name: true, contentKind: true } } } },
  uploader: { select: { id: true, username: true } },
  _count: { select: { comments: true } }, // nombre de commentaires affiché dans les listes
} as const;

/** Extrait du synopsis (infobulle, vue « détails ») + grande image de fond ; le JSON complet reste sur la fiche. */
export function toListRow({ metadata, ...t }: any) {
  const overview = (metadata as any)?.overview;
  const synopsis = typeof overview === 'string' && overview.trim() ? overview.trim().replace(/\s+/g, ' ') : null;
  const backdrop = (metadata as any)?.backdrop;
  const mainTitle = (metadata as any)?.titles?.[0]?.title;
  const runtime = Number((metadata as any)?.runtime) || t.durationMinutes || null;
  return { ...t, metaKind: (metadata as any)?.kind ?? null, runtime, displayTitle: typeof mainTitle === 'string' && mainTitle.trim() ? mainTitle.trim() : null, backdrop: typeof backdrop === 'string' ? backdrop : null, synopsis: synopsis && synopsis.length > 320 ? `${synopsis.slice(0, 317).trimEnd()}…` : synopsis };
}

@Injectable()
export class TorrentsService implements OnModuleInit {
  private readonly log = new Logger(TorrentsService.name);

  constructor(private prisma: PrismaService, private metadata: MetadataService, private adult: AdultService, private teams: TeamsService) {}

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
    /** Filtres de la catégorie choisis ou confirmés par le membre ; complétés par la détection automatique. */
    attrs?: unknown;
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

    const releaseName = params.name || parsed.name;
    const attrs = await this.resolveAttrs(params.categoryId, releaseName, parsed.files, params.nfo, params.genres ?? [], params.attrs);
    const releaseGroup = await this.teams.noteRelease(releaseName); // team détectée dans le nom (créée automatiquement si elle est nouvelle)
    const torrent = await this.prisma.torrent.create({
      data: {
        infoHash: parsed.infoHash,
        releaseGroup,
        name: releaseName,
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
        language: normalizeLanguage(params.language),
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
        attrs: attrs as any,
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

  /**
   * Génère à la volée le .torrent avec l'announce URL personnalisée (passkey) de l'utilisateur qui télécharge.
   * `viaStream` marque l'announce comme venant du lecteur Seeduction (navigateur ou desktop) et non d'un vrai
   * téléchargement : le membre ne pourra jamais continuer à seeder une fois la vidéo fermée, donc le tracker n'en
   * tire aucune obligation « hit & run » (voir tracker.service.ts).
   */
  async getDownloadFile(torrentId: string, userId: string, opts?: { viaStream?: boolean; viewerId?: string }): Promise<Buffer> {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(user.role) && (await this.adult.hiddenFor(opts?.viewerId ?? userId)).includes(torrent.categoryId)) {
      throw new ForbiddenException('Ce contenu est réservé aux adultes : active-le dans ton profil.');
    }

    const original = await fs.readFile(torrent.filePath);
    const announceUrl = `${ANNOUNCE_BASE_URL}/${user.passkey}/announce${opts?.viaStream ? '?stream=1' : ''}`;
    return rewriteTorrentForUser(original, announceUrl);
  }

  /** Résumé minimal (titre + pochette) pour l'affichage côté lecteur desktop (fenêtre Téléchargements). */
  async getSummary(torrentId: string) {
    return this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, name: true, coverImage: true } });
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

  // ------------------------------------------------------------------ filtres propres à la catégorie (attrs)

  onModuleInit() {
    // Les torrents déjà en base sont analysés en arrière-plan (nom, fichiers, NFO) pour que les filtres existent aussi pour eux.
    setTimeout(() => { void this.backfillAttrs().catch((err) => this.log.warn(`Analyse des filtres interrompue : ${err?.message}`)); }, 30_000);
  }

  /** Catégorie principale + sous-catégorie d'un torrent (ou de la catégorie choisie à l'envoi). */
  private async categoryPath(categoryId: string): Promise<{ top: string; leaf: string }> {
    const c = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { name: true, parent: { select: { name: true } } } });
    return { top: c?.parent?.name ?? c?.name ?? '', leaf: c?.name ?? '' };
  }

  /** Valeurs fournies par le membre (validées contre le schéma) complétées par ce que la détection a trouvé. */
  private async resolveAttrs(categoryId: string, name: string, files: { path: string; size: number }[], nfo: string | undefined, genres: string[], provided: unknown) {
    const { top, leaf } = await this.categoryPath(categoryId);
    const allowed = facetKeysFor(top, leaf);
    const chosen = normalizeAttrs(provided, allowed);
    const detected = detectAttrs({ name, files, nfo, top, leaf, metaGenres: genres });
    return { ...detected, ...chosen };
  }

  /** Aperçu pour le formulaire d'envoi : filtres de la catégorie et valeurs déjà trouvées (nom, fichiers, NFO, genres de la fiche). */
  async analyze(input: { categoryId: string; name: string; files: { path: string; size?: number }[]; nfo?: string; genres?: string[] }) {
    const { top, leaf } = await this.categoryPath(input.categoryId);
    const keys = facetKeysFor(top, leaf);
    return {
      facets: keys.map((k) => FACETS[k]),
      detected: detectAttrs({ name: input.name ?? '', files: input.files ?? [], nfo: input.nfo, top, leaf, metaGenres: input.genres }),
    };
  }

  /** Analyse (par lots) les torrents qui n'ont pas encore leurs filtres ; ceux où rien n'est trouvé reçoivent {} pour ne pas être relus. */
  async backfillAttrs() {
    let total = 0;
    for (;;) {
      const batch = await this.prisma.torrent.findMany({
        where: { attrs: { equals: Prisma.DbNull } },
        take: 100,
        select: { id: true, name: true, fileList: true, genres: true, category: { select: { name: true, parent: { select: { name: true } } } }, nfoFile: { select: { content: true } } },
      });
      if (batch.length === 0) break;
      for (const t of batch) {
        const files = Array.isArray(t.fileList) ? (t.fileList as any[]).map((f) => ({ path: String(f?.path ?? ''), size: Number(f?.size) || 0 })) : [];
        const attrs = detectAttrs({ name: t.name, files, nfo: t.nfoFile?.content, top: t.category.parent?.name ?? t.category.name, leaf: t.category.name, metaGenres: t.genres });
        await this.prisma.torrent.update({ where: { id: t.id }, data: { attrs: attrs as any } });
      }
      total += batch.length;
    }
    if (total) this.log.log(`Filtres de catégorie : ${total} torrent(s) analysé(s)`);
    return total;
  }

  /** Filtre d'un torrent modifié à la main (staff / envoyeur) : seules les clés et valeurs du schéma sont acceptées. */
  async setAttrs(id: string, input: unknown) {
    const t = await this.prisma.torrent.findUnique({ where: { id }, select: { categoryId: true } });
    if (!t) throw new NotFoundException('Torrent introuvable');
    const { top, leaf } = await this.categoryPath(t.categoryId);
    const attrs = normalizeAttrs(input, facetKeysFor(top, leaf));
    await this.prisma.torrent.update({ where: { id }, data: { attrs: attrs as any } });
    return attrs;
  }

  private attrConditions(attrFilters?: Record<string, string[]>) {
    const out: any[] = [];
    for (const [key, values] of Object.entries(attrFilters ?? {})) {
      if (!FACETS[key] || values.length === 0) continue;
      out.push({ OR: values.map((v) => ({ attrs: { path: [key], array_contains: [v] } })) });
    }
    return out;
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
        // ... et les torrents dont un acteur, un réalisateur, un producteur, un studio ou un genre porte ce nom.
        { entities: { some: { entity: { name: { contains: params.search, mode: 'insensitive' } } } } },
        ...(plain !== params.search ? [{ entities: { some: { entity: { name: { contains: plain, mode: 'insensitive' } } } } }] : []),
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
    if (params.minSeeders != null || params.maxSeeders != null) {
      where.seeders = {};
      if (params.minSeeders != null) where.seeders.gte = params.minSeeders;
      if (params.maxSeeders != null) where.seeders.lte = params.maxSeeders;
    }
    if (params.year != null) where.year = params.year;
    if (params.language) {
      // « VFQ » retrouve aussi MULTI.VFQ et MULTI.VF2 ; « MULTI » toutes les étiquettes MULTI.* (voir common/utils/language.ts).
      const values = storedValuesFor(params.language);
      where.language = values ? { in: values } : { equals: params.language, mode: 'insensitive' };
    }
    if (params.resolution) where.resolution = { equals: params.resolution, mode: 'insensitive' };
    if (params.codec) where.codec = { equals: params.codec, mode: 'insensitive' };
    if (params.hdr) where.hdr = true;
    if (params.audio) where.audio = { equals: params.audio, mode: 'insensitive' };
    if (params.source) where.source = { equals: params.source, mode: 'insensitive' };
    if (params.genre) where.genres = { has: params.genre };
    if (params.containerFormat) where.containerFormat = { equals: params.containerFormat, mode: 'insensitive' };
    if (params.origin) where.origin = params.origin;
    const attrConds = this.attrConditions(params.attrFilters);
    if (attrConds.length) where.AND = [...(where.AND ?? []), ...attrConds];
    if (params.period) {
      const ms = { day: 86400_000, week: 7 * 86400_000, month: 30 * 86400_000 }[params.period];
      where.createdAt = { gte: new Date(Date.now() - ms) };
    }
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
      if (field === 'language') {
        // Un torrent MULTI.VF2 compte pour MULTI, VF2, VFF et VFQ : on additionne par « atome » d'étiquette.
        const byAtom = new Map<string, number>();
        for (const g of groups) if (g.language) for (const a of languageAtoms(g.language)) byAtom.set(a, (byAtom.get(a) ?? 0) + (g._count._all as number));
        out[field] = [...byAtom].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
        continue;
      }
      out[field] = groups.map((g) => ({ value: g[field] as string, count: g._count._all as number })).filter((g) => g.value).sort((x, y) => y.count - x.count);
    }
    const genreWhere = await this.buildWhere({ ...params, genre: undefined });
    const gRows = await this.prisma.torrent.findMany({ where: { ...genreWhere, genres: { isEmpty: false } }, select: { genres: true }, take: 5000 });
    const counts = new Map<string, number>();
    for (const r of gRows) for (const g of r.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    out.genre = [...counts].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
    const hdrWhere = await this.buildWhere({ ...params, hdr: undefined });
    out.hdr = [{ value: 'HDR', count: await this.prisma.torrent.count({ where: { ...hdrWhere, hdr: true } }) }].filter((x) => x.count > 0);
    return { ...out, attrs: await this.attrFacets(params) };
  }

  /**
   * Filtres de catégorie disponibles pour la liste affichée : seules les valeurs portées par au moins un résultat sont proposées,
   * chaque filtre étant compté sans tenir compte de sa propre sélection (comme pour les autres filtres).
   */
  private async attrFacets(params: TorrentFilters) {
    const baseWhere = await this.buildWhere({ ...params, attrFilters: undefined });
    const rows = await this.prisma.torrent.findMany({ where: { ...baseWhere, attrs: { not: Prisma.DbNull } }, select: { attrs: true }, take: 5000 });
    const selected = params.attrFilters ?? {};
    const out: { key: string; label: string; multi: boolean; values: { value: string; count: number }[] }[] = [];
    for (const def of Object.values(FACETS)) {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const a = row.attrs as Record<string, string[]> | null;
        if (!a) continue;
        // La ligne doit respecter les AUTRES filtres sélectionnés.
        if (Object.entries(selected).some(([k, vals]) => k !== def.key && vals.length && !vals.some((v) => (a[k] ?? []).includes(v)))) continue;
        for (const v of a[def.key] ?? []) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      for (const v of selected[def.key] ?? []) if (!counts.has(v)) counts.set(v, 0); // une sélection active reste visible
      if (counts.size === 0) continue;
      const rank = (v: string) => { const i = def.options.indexOf(v); return i === -1 ? 999 : i; };
      out.push({ key: def.key, label: def.label, multi: def.multi, values: [...counts].map(([value, count]) => ({ value, count })).sort((x, y) => rank(x.value) - rank(y.value)) });
    }
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
        include: LIST_INCLUDE,
      }),
      this.prisma.torrent.count({ where }),
    ]);

    const rows = items.map(toListRow);

    return { items: rows, total, page: params.page, pageSize: params.pageSize };
  }

  /**
   * Autres versions du même contenu sur le site (même fiche TMDB / Deezer / etc., et même saison / épisode pour une série) :
   * qualité, source, codec, taille, uploader... La version affichée est incluse et marquée.
   */
  async versions(id: string, viewer?: { userId: string; role: string }) {
    const t = await this.prisma.torrent.findUnique({ where: { id }, select: { metaSource: true, metaExternalId: true, season: true, episode: true, categoryId: true } });
    if (!t || !t.metaSource || !t.metaExternalId) return [];
    if (!['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '') && (await this.adult.hiddenFor(viewer?.userId)).includes(t.categoryId)) return [];
    const rows = await this.prisma.torrent.findMany({
      where: {
        OR: [
          { id },
          { status: 'APPROVED', metaSource: t.metaSource, metaExternalId: t.metaExternalId, ...(t.season ? { season: t.season, episode: t.episode } : {}) },
        ],
      },
      select: {
        id: true, name: true, size: true, resolution: true, source: true, codec: true, audio: true, language: true, hdr: true, containerFormat: true, releaseDate: true,
        seeders: true, leechers: true, freeleech: true, createdAt: true, anonymousUpload: true, completedCount: true, season: true, episode: true, status: true, releaseGroup: true, _count: { select: { comments: true } }, uploader: { select: { id: true, username: true } },
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
    const card = { id: true, name: true, size: true, year: true, resolution: true, language: true, seeders: true, leechers: true, coverImage: true, source: true, codec: true, audio: true, hdr: true, containerFormat: true, origin: true, season: true, episode: true, releaseDate: true, createdAt: true };

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
    source: true, codec: true, audio: true, hdr: true, containerFormat: true, origin: true, season: true, episode: true, releaseDate: true,
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

  /** Torrents que le membre télécharge ou seede en ce moment (d'après ses derniers announces), avec leur avancement. */
  async activeForUser(userId: string, viewerId?: string) {
    const hidden = await this.adult.hiddenFor(viewerId ?? userId);
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

  /** Infos légères pour l'infobulle d'un torrent (pochette, détails de base, note, casting, extrait du synopsis). */
  async preview(id: string, viewer?: { userId: string; role: string }) {
    const t = await this.prisma.torrent.findUnique({
      where: { id },
      select: {
        id: true, name: true, coverImage: true, year: true, resolution: true, language: true, size: true, seeders: true, leechers: true,
        source: true, codec: true, audio: true, hdr: true, containerFormat: true, origin: true, season: true, episode: true, releaseDate: true,
        createdAt: true, status: true, categoryId: true, genres: true,
        category: { select: { name: true, slug: true, parent: { select: { slug: true, name: true } } } }, metadata: true,
        entities: {
          where: { role: { in: ['ACTOR', 'DIRECTOR'] } },
          orderBy: [{ role: 'asc' }, { position: 'asc' }],
          take: 8,
          select: { role: true, entity: { select: { id: true, name: true } } },
        },
      },
    });
    const staff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '');
    if (!t || (t.status !== 'APPROVED' && !staff)) throw new NotFoundException('Torrent introuvable');
    if (!staff && (await this.adult.hiddenFor(viewer?.userId)).includes(t.categoryId)) throw new ForbiddenException('Contenu masqué');

    const { metadata, categoryId, status, entities, ...rest } = t;
    const meta = (metadata as any) ?? {};
    const overview = meta.overview;
    const synopsis = typeof overview === 'string' && overview.trim() ? overview.trim().replace(/\s+/g, ' ') : null;
    return {
      ...rest,
      synopsis: synopsis && synopsis.length > 320 ? `${synopsis.slice(0, 317).trimEnd()}…` : synopsis,
      rating: typeof meta.rating === 'number' ? meta.rating : null,
      runtime: typeof meta.runtime === 'number' ? meta.runtime : null,
      backdrop: typeof meta.backdrop === 'string' ? meta.backdrop : null,
      director: entities.find((e) => e.role === 'DIRECTOR')?.entity.name ?? null,
      cast: entities.filter((e) => e.role === 'ACTOR').slice(0, 4).map((e) => e.entity.name),
    };
  }

  /** NFO d'un torrent (même visibilité que la fiche). */
  async getNfo(id: string, viewer?: { userId: string; role: string }) {
    await this.findOne(id, viewer);
    const nfo = await this.prisma.torrentNfo.findUnique({ where: { torrentId: id } });
    return { content: nfo?.content ?? null };
  }

  private audioCursor: Date | null = null;
  private audioDone = false;

  /**
   * Rattrapage : les torrents sans codec audio enregistré (envoyés avant la détection élargie : AC3, E-AC3 / DD+, Opus…) le reçoivent d'après leur nom,
   * sinon d'après les pistes audio de leur NFO / MediaInfo. 200 torrents toutes les 10 minutes ; la date de modification n'est pas touchée.
   */
  @Cron('*/10 * * * *')
  async backfillAudio() {
    if (this.audioDone) return;
    const rows = await this.prisma.torrent.findMany({
      where: { audio: null, ...(this.audioCursor ? { createdAt: { gt: this.audioCursor } } : {}) },
      orderBy: { createdAt: 'asc' }, take: 200,
      select: { id: true, name: true, createdAt: true, nfoFile: { select: { content: true } } },
    });
    for (const r of rows) {
      const a = audioOf(r.name, r.nfoFile?.content ?? '');
      if (a) await this.prisma.$executeRaw`UPDATE "Torrent" SET audio = ${a} WHERE id = ${r.id} AND audio IS NULL`;
    }
    if (rows.length < 200) this.audioDone = true;
    else this.audioCursor = rows[rows.length - 1].createdAt;
  }

  /** Instructions d'installation / d'utilisation trouvées dans le NFO (rubriques « INSTALL NOTES », « HOW TO »...), pour les logiciels et les jeux. */
  async installNotes(id: string, viewer?: { userId: string; role: string }) {
    const { content } = await this.getNfo(id, viewer);
    return { sections: content ? extractInstallNotes(content) : [] };
  }

  async findOne(id: string, viewer?: { userId: string; role: string }) {
    const torrent = await this.prisma.torrent.findUnique({
      where: { id },
      include: {
        // Le parent est nécessaire pour déterminer le type de contenu (FILM/SERIE/XXX...) d'une sous-catégorie qui
        // n'a pas le sien propre — voir resolveContentKind() côté frontend (bouton « Ouvrir dans le lecteur »).
        category: { include: { parent: true } },
        uploader: { select: { id: true, username: true } },
        entities: { include: { entity: true }, orderBy: [{ role: 'asc' }, { position: 'asc' }] },
      },
    });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    // Le staff garde l'accès (modération) ; les autres doivent avoir activé le contenu adulte.
    if (!['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '')) {
      const hidden = await this.adult.hiddenFor(viewer?.userId);
      if (hidden.includes(torrent.categoryId)) {
        throw new ForbiddenException('Ce contenu est réservé aux adultes : active l\'affichage du contenu pour adultes dans ton profil pour y accéder.');
      }
    }
    return torrent;
  }
}
