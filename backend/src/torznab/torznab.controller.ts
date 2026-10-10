import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parseTorznabQuery } from './torznab-core';
import { TorznabError, TorznabService } from './torznab.service';

const SEARCH_FUNCTIONS = ['search', 'tvsearch', 'movie', 'music', 'book'];

/**
 * Torznab pour Prowlarr, Jackett, Sonarr, Radarr, Lidarr et Readarr, et flux RSS pour les clients torrent.
 * Les outils *arr ajoutent « /api » à l'adresse du site : l'adresse de base est donc simplement https://ton-site (route « /api »).
 * Les alias « /api/torznab » et « /api/torznab/api » existent pour les outils qui demandent l'adresse complète.
 */
@Controller()
export class TorznabController {
  constructor(private service: TorznabService) {}

  @Get(['', 'torznab', 'torznab/api'])
  async api(@Query() query: Record<string, any>, @Req() req: Request, @Res() res: Response) {
    const site = this.service.siteUrl(req);
    const q = parseTorznabQuery(query);
    res.type('application/xml; charset=utf-8');
    try {
      if (q.t === 'caps') return res.send(this.service.caps(site)); // ne demande pas de clé
      if (!SEARCH_FUNCTIONS.includes(q.t)) throw new TorznabError(202, `Fonction inconnue : ${q.t}`);
      const rawKey = String(query.apikey ?? query.key ?? req.headers['x-api-key'] ?? '').trim() || undefined;
      const { userId } = await this.service.authenticate(rawKey, 'torrents:read');
      return res.send(await this.service.search(q, userId, rawKey!, site));
    } catch (e: any) {
      if (e instanceof TorznabError) return res.send(this.service.errorXml(e)); // les erreurs Torznab sont du XML (code HTTP 200)
      return res.status(500).send(this.service.errorXml(new TorznabError(900, 'Erreur interne')));
    }
  }

  @Get('torznab/download/:id')
  async download(@Param('id') id: string, @Query() query: Record<string, any>, @Req() req: Request, @Res() res: Response) {
    try {
      const rawKey = String(query.apikey ?? query.key ?? req.headers['x-api-key'] ?? '').trim() || undefined;
      const { userId } = await this.service.authenticate(rawKey, 'torrents:download');
      const buf = await this.service.download(id, userId);
      res.set({ 'Content-Type': 'application/x-bittorrent', 'Content-Disposition': `attachment; filename="${id}.torrent"` });
      return res.send(buf);
    } catch (e: any) {
      if (e instanceof TorznabError) return res.status(e.code === 500 ? 429 : 401).type('text/plain').send(e.message);
      const status = typeof e?.getStatus === 'function' ? e.getStatus() : 500;
      return res.status(status).type('text/plain').send(String(e?.message ?? 'Erreur'));
    }
  }
}
