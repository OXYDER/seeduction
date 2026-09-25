import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TrackerService } from './tracker.service';
import { bencode } from '../common/utils/bencode';
import { percentDecodedToHex } from '../common/utils/bittorrent';

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
      const infoHash = percentDecodedToHex(infoHashRaw);

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
        // Ajouté par TorrentsService.getDownloadFile() quand le .torrent sert au lecteur Seeduction (pas à un
        // téléchargement classique) — voir tracker.service.ts pour ce que ça change côté hit & run.
        viaStream: query.stream === '1',
      });

      // Format compact IPv4 (6 octets par peer) : les peers IPv6 sont ignorés au lieu de faire échouer l'announce.
      const ipv4Peers = result.peers
        .map((p) => ({ ...p, ip: p.ip.replace(/^::ffff:/i, '') }))
        .filter((p) => /^(\d{1,3}\.){3}\d{1,3}$/.test(p.ip) && p.port > 0 && p.port < 65536);
      const peersCompact = Buffer.concat(
        ipv4Peers.map((p) => {
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
  async scrape(@Req() req: Request, @Res() res: Response) {
    // Lu dans l'URL brute : l'info_hash est du binaire encodé en %XX, pas du texte UTF-8.
    const hashes = [...req.url.matchAll(/info_hash=([^&]+)/g)].map((m) => percentDecodedToHex(m[1]));

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
