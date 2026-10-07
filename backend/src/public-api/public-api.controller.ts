import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PublicApiService } from './public-api.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequireScope } from '../api-keys/scope.decorator';
import { TorrentsService } from '../torrents/torrents.service';
import { AdminService } from '../admin/admin.service';
import { uploadParamsOf } from '../torrents/upload-params';

/**
 * API publique en lecture seule, authentifiée par clé API (voir ApiKeysModule)
 * — pas par session JWT. Limitée à 60 req/min/IP : plus strict que le reste
 * du site puisque destinée à des scripts/intégrations automatisés, sans
 * toucher au throttling global (qui affecterait aussi l'announce BitTorrent).
 */
@UseGuards(ApiKeyGuard, ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public')
export class PublicApiController {
  constructor(private publicApi: PublicApiService, private torrentsService: TorrentsService, private admin: AdminService) {}

  @RequireScope('torrents:read')
  @Get('torrents')
  torrents(@Query('search') search?: string, @Query('categoryId') categoryId?: string, @Query('limit') limit?: string) {
    return this.publicApi.listTorrents({ search, categoryId, limit: limit ? Number(limit) : undefined });
  }

  @RequireScope('torrents:read')
  @Get('torrents/:id')
  torrent(@Param('id') id: string) {
    return this.publicApi.torrentDetail(id);
  }

  /** Catégories (sous-catégories) où envoyer un torrent : sert à relier les catégories d'une source aux tiennes. */
  @RequireScope('torrents:read')
  @Get('categories')
  categories() {
    return this.publicApi.uploadCategories();
  }

  /**
   * Envoi d'un torrent par clé API (outil d'import automatique, voir tools/auto-upload). Mêmes règles que le formulaire du site :
   * .torrent + NFO obligatoires, doublons refusés. Le torrent attend la validation du staff, sauf si la clé appartient à un membre du staff (approuvé directement).
   * Champs multipart : torrentFile, name, categoryId, nfo, description, year, language, resolution, codec, source, genres...
   */
  @RequireScope('torrents:upload')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('torrents')
  @UseInterceptors(FileInterceptor('torrentFile'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body() body: Record<string, string>, @Req() req: Request & { apiKey: { userId: string } }) {
    const { staff } = await this.publicApi.assertCanUpload(req.apiKey.userId);
    const t = await this.torrentsService.upload(uploadParamsOf(file, body, req.apiKey.userId));
    const final = staff ? await this.admin.approveTorrent(t.id) : t; // clé d'un membre du staff : approuvé directement, donc rien à valider à la main
    return { id: t.id, name: t.name, infoHash: t.infoHash, status: final.status };
  }

  /** Le .torrent à seeder (avec ton passkey) d'un torrent que cette clé a envoyé : 409 tant qu'il attend la validation du staff. */
  @RequireScope('torrents:upload')
  @Get('torrents/:id/file')
  async ownFile(@Param('id') id: string, @Req() req: Request & { apiKey: { userId: string } }, @Res() res: Response) {
    await this.publicApi.assertCanUpload(req.apiKey.userId);
    const r = await this.publicApi.ownTorrentFile(req.apiKey.userId, id);
    if ('pending' in r) return res.status(409).json({ statusCode: 409, message: 'En attente de validation par le staff' });
    res.type('application/x-bittorrent').send(r.file);
  }

  @RequireScope('user:read')
  @Get('me')
  me(@Req() req: Request & { apiKey: { userId: string } }) {
    return this.publicApi.meStats(req.apiKey.userId);
  }

  @RequireScope('stats:read')
  @Get('stats')
  stats() {
    return this.publicApi.globalStats();
  }

  @RequireScope('torrents:read')
  @Get('rss/torrents.xml')
  async rss(
    @Query('categoryId') categoryId: string,
    @Query('limit') limit: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const xml = await this.publicApi.rssFeed({ categoryId, limit: limit ? Number(limit) : undefined }, baseUrl);
    res.type('application/rss+xml').send(xml);
  }
}
