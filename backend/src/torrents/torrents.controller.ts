import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Request,
  UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { TorrentsService } from './torrents.service';
import { RecommendationsService } from './recommendations.service';
import { accountOf, assertPerm } from '../common/utils/account';
import { normalizeOrigin } from '../common/utils/facets';
import { FACETS } from '../common/utils/facet-schema';
import { GAME_PLATFORMS, detectGamePlatforms, platformIdsFromRawg } from '../common/utils/game-platforms';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

/** Filtres de catégorie de l'adresse : `f.formatMusique=FLAC (24 bit)|MP3` (OU entre valeurs, ET entre filtres). */
const attrFiltersOf = (query: Record<string, string>) => {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('f.') && typeof v === 'string' && v) out[k.slice(2)] = v.split('|').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  }
  return out;
};

@Controller('torrents')
export class TorrentsController {
  constructor(private torrentsService: TorrentsService, private recommendations: RecommendationsService) {}

  /** Libellés et valeurs de tous les filtres de catégorie (fiche d'un torrent, édition). */
  @Get('facet-schema')
  facetSchema() {
    return FACETS;
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('facets')
  facets(@Query() query: Record<string, string>, @Request() req: any) {
    // Les uploads anonymes d'un membre ne se retrouvent que par lui-même ou par le staff.
    const seesAnonymous = !!req.user && (req.user.userId === query.uploaderId || ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(req.user.role));
    return this.torrentsService.facets({
      hideAnonymous: !!query.uploaderId && !seesAnonymous,
      viewerId: req.user?.userId,
      state: query.state === 'dead' ? 'dead' : query.state === 'noseeders' ? 'noseeders' : undefined,
      attrFilters: attrFiltersOf(query),
      categoryId: query.categoryId,
      search: query.search,
      uploaderId: query.uploaderId,
      minSize: query.minSize ? Number(query.minSize) : undefined,
      maxSize: query.maxSize ? Number(query.maxSize) : undefined,
      minSeeders: query.minSeeders ? Number(query.minSeeders) : undefined,
      maxSeeders: query.maxSeeders ? Number(query.maxSeeders) : undefined,
      year: query.year ? Number(query.year) : undefined,
      language: query.language,
      origin: normalizeOrigin(query.origin),
      resolution: query.resolution,
      codec: query.codec,
      hdr: query.hdr === 'true' ? true : undefined,
      audio: query.audio,
      source: query.source,
      containerFormat: query.containerFormat,
      genre: query.genre,
      entityId: query.entityId,
      role: query.role,
      period: query.period === 'day' || query.period === 'week' || query.period === 'month' ? query.period : undefined,
    });
  }


  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Query() query: Record<string, string>, @Request() req: any) {
    // Les uploads anonymes d'un membre ne se retrouvent que par lui-même ou par le staff.
    const seesAnonymous = !!req.user && (req.user.userId === query.uploaderId || ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(req.user.role));
    return this.torrentsService.list({
      hideAnonymous: !!query.uploaderId && !seesAnonymous,
      viewerId: req.user?.userId,
      state: query.state === 'dead' ? 'dead' : query.state === 'noseeders' ? 'noseeders' : undefined,
      attrFilters: attrFiltersOf(query),
      categoryId: query.categoryId,
      search: query.search,
      uploaderId: query.uploaderId,
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '25', 10),
      sort: query.sort,
      order: query.order === 'asc' ? 'asc' : query.order === 'desc' ? 'desc' : undefined,
      period: query.period === 'day' || query.period === 'week' || query.period === 'month' ? query.period : undefined,
      minSize: query.minSize ? Number(query.minSize) : undefined,
      maxSize: query.maxSize ? Number(query.maxSize) : undefined,
      minSeeders: query.minSeeders ? Number(query.minSeeders) : undefined,
      maxSeeders: query.maxSeeders ? Number(query.maxSeeders) : undefined,
      year: query.year ? Number(query.year) : undefined,
      language: query.language,
      origin: normalizeOrigin(query.origin),
      resolution: query.resolution,
      codec: query.codec,
      hdr: query.hdr === 'true' ? true : undefined,
      audio: query.audio,
      source: query.source,
      containerFormat: query.containerFormat,
      genre: query.genre,
      entityId: query.entityId,
      role: query.role,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine/followed')
  followed(@Request() req: any) {
    return this.torrentsService.followedFeed(req.user.userId);
  }

  /** Offres basées sur l'historique : `basedOn` (id d'un torrent) les oriente vers ce qui ressemble à cette fiche. */
  @UseGuards(JwtAuthGuard)
  @Get('mine/recommended')
  recommended(@Query('basedOn') basedOn: string | undefined, @Query('limit') limit: string | undefined, @Request() req: any) {
    return this.recommendations.forUser(req.user.userId, { basedOn: basedOn || undefined, limit: limit ? Number(limit) : undefined });
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine/active')
  active(@Request() req: any) {
    return this.torrentsService.activeForUser(accountOf(req), req.user.userId);
  }

  /** Formulaire d'envoi : filtres de la catégorie choisie et valeurs déjà trouvées (nom, fichiers du .torrent, NFO, genres de la fiche). */
  @UseGuards(JwtAuthGuard)
  @Post('analyze')
  analyze(@Body() body: { categoryId?: string; name?: string; files?: { path: string; size?: number }[]; nfo?: string; genres?: string[] }) {
    if (!body?.categoryId) return { facets: [], detected: {} };
    return this.torrentsService.analyze({
      categoryId: body.categoryId,
      name: String(body.name ?? '').slice(0, 400),
      files: (Array.isArray(body.files) ? body.files : []).slice(0, 400).map((f) => ({ path: String(f?.path ?? '').slice(0, 400), size: Number(f?.size) || 0 })),
      nfo: typeof body.nfo === 'string' ? body.nfo.slice(0, 100_000) : undefined,
      genres: Array.isArray(body.genres) ? body.genres.map(String).slice(0, 20) : undefined,
    });
  }

  /**
   * Jeux : plateformes proposées (Windows, Switch, PS5, Xbox 360...) avec la sous-catégorie et le filtre associés, celles reconnues dans
   * le nom / les fichiers / le NFO, et celles de la fiche RAWG choisie (`rawg` = « PC, PlayStation 5, Nintendo Switch »).
   */
  @UseGuards(JwtAuthGuard)
  @Post('platforms')
  platforms(@Body() body: { name?: string; files?: { path: string }[]; nfo?: string; rawg?: string }) {
    const files = (Array.isArray(body?.files) ? body.files : []).slice(0, 400).map((f) => String(f?.path ?? ''));
    return {
      platforms: GAME_PLATFORMS.map(({ id, label, group, category, facetKey, facetValue }) => ({ id, label, group, category, facetKey, facetValue })),
      detected: detectGamePlatforms(String(body?.name ?? '').slice(0, 400), files, typeof body?.nfo === 'string' ? body.nfo.slice(0, 20_000) : undefined),
      onFiche: platformIdsFromRawg(String(body?.rawg ?? '').slice(0, 1000)),
    };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('duplicates')
  duplicates(@Query('metaId') metaId: string | undefined, @Query('name') name: string | undefined, @Request() req: any) {
    return this.torrentsService.findDuplicates(metaId, name, req.user?.userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/preview')
  preview(@Param('id') id: string, @Request() req: any) {
    return this.torrentsService.preview(id, req.user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/versions')
  versions(@Param('id') id: string, @Request() req: any) {
    return this.torrentsService.versions(id, req.user);
  }

  @Get(':id/related')
  related(@Param('id') id: string) {
    return this.torrentsService.related(id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/nfo')
  nfo(@Param('id') id: string, @Request() req: any) {
    return this.torrentsService.getNfo(id, req.user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.torrentsService.findOne(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('torrentFile'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
    @Request() req: any,
  ) {
    assertPerm(req, 'upload');
    return this.torrentsService.upload({
      userId: accountOf(req),
      fileBuffer: file.buffer,
      name: body.name,
      description: body.description,
      categoryId: body.categoryId,
      tags: body.tags ? body.tags.split(',').map((t) => t.trim()) : [],
      anonymous: body.anonymous === 'true',
      coverImage: body.coverImage || undefined,
      metaKind: body.metaKind || undefined,
      metaId: body.metaId || undefined,
      year: body.year ? Number(body.year) : undefined,
      language: body.language || undefined,
      origin: normalizeOrigin(body.origin),
      resolution: body.resolution || undefined,
      codec: body.codec || undefined,
      hdr: body.hdr === 'true',
      audio: body.audio || undefined,
      source: body.source || undefined,
      containerFormat: body.containerFormat || undefined,
      fps: body.fps ? Number(body.fps) : undefined,
      durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : undefined,
      season: body.season || undefined,
      episode: body.episode || undefined,
      genres: body.genres ? body.genres.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 8) : [],
      videoType: body.videoType || undefined,
      nfo: body.nfo && body.nfo.trim() ? body.nfo.slice(0, 200_000) : undefined,
      attrs: (() => { try { return body.attrs ? JSON.parse(body.attrs) : undefined; } catch { return undefined; } })(),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    assertPerm(req, 'download');
    const buf = await this.torrentsService.getDownloadFile(id, accountOf(req), { viewerId: req.user.userId });
    res.set({
      'Content-Type': 'application/x-bittorrent',
      'Content-Disposition': `attachment; filename="${id}.torrent"`,
    });
    res.send(buf);
  }
}
