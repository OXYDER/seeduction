import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PublicApiService } from './public-api.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequireScope } from '../api-keys/scope.decorator';

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
  constructor(private publicApi: PublicApiService) {}

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

  /** Les catégories d'envoi (identifiant, nom, parent) : pour choisir `categoryId` ou `category` à l'envoi. */
  @RequireScope('torrents:read')
  @Get('categories')
  categories() {
    return this.publicApi.listCategories();
  }

  /**
   * Envoie un torrent sans passer par le formulaire du site : multipart/form-data avec `torrentFile` (le .torrent), le NFO (`nfo` en texte ou `nfoFile` en fichier) et les mêmes champs que le formulaire
   * (`name`, `categoryId` ou `category`, `description`, `anonymous`, `year`, `language`, `resolution`...). Portée « torrents:upload » ; au plus 20 envois par minute.
   */
  @RequireScope('torrents:upload')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('torrents')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'torrentFile', maxCount: 1 }, { name: 'nfoFile', maxCount: 1 }], { limits: { fileSize: 15 * 1024 * 1024, files: 2 } }))
  upload(
    @UploadedFiles() files: { torrentFile?: Express.Multer.File[]; nfoFile?: Express.Multer.File[] },
    @Body() body: Record<string, string>,
    @Req() req: Request & { apiKey: { userId: string } },
  ) {
    return this.publicApi.uploadTorrent(req.apiKey.userId, files?.torrentFile?.[0], files?.nfoFile?.[0], body ?? {}, process.env.SITE_URL || `${req.protocol}://${req.get('host')}`);
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
