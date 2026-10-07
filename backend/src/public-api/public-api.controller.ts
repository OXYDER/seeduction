import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
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
