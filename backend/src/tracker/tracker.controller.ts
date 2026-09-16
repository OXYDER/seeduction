import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TrackerService } from './tracker.service';
import { bencode } from '../common/utils/bencode';

/**
 * Endpoints BitTorrent standard — PAS de JSON ici, les clients BitTorrent
 * (qBittorrent, Transmission, Deluge...) attendent du bencode brut avec le
 * bon Content-Type. Le passkey identifie l'utilisateur (path param, jamais
 * en query pour ne pas fuiter dans les logs de proxy).
 */
@Controller('tracker/:passkey')
export class TrackerController {
  constructor(private trackerService: TrackerService) {}

  @Get('announce')
  async announce(@Param('passkey') passkey: string, @Query() query: any, @Req() req: Request, @Res() res: Response) {
    try {
      const infoHashRaw = req.url.match(/info_hash=([^&]+)/)?.[1] ?? '';
      const infoHash = Buffer.from(decodeURIComponent(infoHashRaw), 'binary').toString('hex');

      const result = await this.trackerService.announce({
        infoHash,
        peerId: query.peer_id,
        passkey,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
        port: parseInt(query.port, 10),
        uploaded: parseInt(query.uploaded, 10) || 0,
        downloaded: parseInt(query.downloaded, 10) || 0,
        left: parseInt(query.left, 10) || 0,
        event: query.event,
        numwant: query.numwant ? parseInt(query.numwant, 10) : undefined,
        compact: query.compact === '1',
      });

      const peersCompact = Buffer.concat(
        result.peers.map((p) => {
          const parts = p.ip.split('.').map(Number);
          const buf = Buffer.alloc(6);
          parts.forEach((n, i) => buf.writeUInt8(n, i));
          buf.writeUInt16BE(p.port, 4);
          return buf;
        }),
      );

      res.set('Content-Type', 'text/plain');
      res.send(
        bencode({
          interval: result.interval,
          'min interval': result.minInterval,
          complete: result.complete,
          incomplete: result.incomplete,
          peers: peersCompact,
        }),
      );
    } catch (err: any) {
      res.set('Content-Type', 'text/plain');
      res.send(bencode({ 'failure reason': err.message ?? 'Erreur tracker' }));
    }
  }

  @Get('scrape')
  async scrape(@Query() query: any, @Res() res: Response) {
    const raw = Array.isArray(query.info_hash) ? query.info_hash : [query.info_hash];
    const hashes = raw.filter(Boolean).map((h: string) => Buffer.from(decodeURIComponent(h), 'binary').toString('hex'));

    const torrents = await this.trackerService.scrape(hashes);
    const files: Record<string, any> = {};
    for (const t of torrents) {
      const rawHash = Buffer.from(t.infoHash, 'hex').toString('binary');
      files[rawHash] = {
        complete: t.seeders,
        incomplete: t.leechers,
        downloaded: t.completedCount,
      };
    }

    res.set('Content-Type', 'text/plain');
    res.send(bencode({ files }));
  }
}
