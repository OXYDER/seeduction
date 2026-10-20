import { Controller, Get, Logger, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TrackerService } from './tracker.service';
import { bencode } from '../common/utils/bencode';
import { percentDecodedToHex } from '../common/utils/bittorrent';
import { failureReasonOf, isInternalError, isTransientError } from '../common/utils/tracker-errors';

/**
 * Endpoints BitTorrent standard — PAS de JSON ici, les clients BitTorrent
 * (qBittorrent, Transmission, Deluge...) attendent du bencode brut avec le
 * bon Content-Type. Le passkey identifie l'utilisateur (path param, jamais
 * en query pour ne pas fuiter dans les logs de proxy).
 */
@Controller('tracker/:passkey')
export class TrackerController {
  private readonly logger = new Logger(TrackerController.name);

  constructor(private trackerService: TrackerService) {}

  /** Une seule nouvelle tentative, tout de suite, si la base a eu un hoquet passager (redémarrage, réservoir de connexions plein). */
  private async announceWithRetry(params: Parameters<TrackerService['announce']>[0]) {
    try {
      return await this.trackerService.announce(params);
    } catch (err: any) {
      if (!isTransientError(err)) throw err;
      await new Promise((r) => setTimeout(r, 400));
      return this.trackerService.announce(params);
    }
  }

  @Get('announce')
  async announce(@Param('passkey') passkey: string, @Query() query: any, @Req() req: Request, @Res() res: Response) {
    try {
      const infoHashRaw = req.url.match(/info_hash=([^&]+)/)?.[1] ?? '';
      const infoHash = percentDecodedToHex(infoHashRaw);

      const result = await this.announceWithRetry({
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
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      });

      // Format compact : IPv4 (6 octets par pair) dans « peers », IPv6 (18 octets) dans « peers6 » : un seeder joignable en IPv6 n'est plus perdu.
      const cleaned = result.peers.map((p) => ({ ...p, ip: p.ip.replace(/^::ffff:/i, '') })).filter((p) => p.port > 0 && p.port < 65536);
      const ipv4Peers = cleaned.filter((p) => /^(\d{1,3}\.){3}\d{1,3}$/.test(p.ip));
      const peersCompact = Buffer.concat(
        ipv4Peers.map((p) => {
          const parts = p.ip.split('.').map(Number);
          const buf = Buffer.alloc(6);
          parts.forEach((n, i) => buf.writeUInt8(n, i));
          buf.writeUInt16BE(p.port, 4);
          return buf;
        }),
      );
      const peers6Compact = Buffer.concat(
        cleaned.filter((p) => !ipv4Peers.includes(p)).map((p) => ipv6ToBuffer(p.ip, p.port)).filter((b): b is Buffer => !!b),
      );

      res.set('Content-Type', 'text/plain');
      res.send(
        bencode({
          interval: result.interval,
          'min interval': result.minInterval,
          complete: result.complete,
          incomplete: result.incomplete,
          peers: peersCompact,
          ...(peers6Compact.length ? { peers6: peers6Compact } : {}),
        }),
      );
    } catch (err: any) {
      // Une erreur interne (base de données...) est journalisée ici et ne part jamais telle quelle chez le client BitTorrent.
      if (isInternalError(err)) this.logger.error(`Announce en erreur : ${String(err?.message ?? err).slice(0, 600)}`);
      res.set('Content-Type', 'text/plain');
      res.send(bencode({ 'failure reason': failureReasonOf(err) }));
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

/** Adresse IPv6 + port au format compact (16 octets + 2 octets) ; null si l'adresse est illisible. */
export function ipv6ToBuffer(ip: string, port: number): Buffer | null {
  const clean = ip.split('%')[0];
  if (!/^[0-9a-f:.]+$/i.test(clean) || !clean.includes(':')) return null;
  const [head, tail = ''] = clean.split('::');
  const h = head ? head.split(':') : [];
  const t2 = clean.includes('::') && tail ? tail.split(':') : [];
  if (!clean.includes('::') && h.length !== 8) return null;
  const groups = clean.includes('::') ? [...h, ...Array(8 - h.length - t2.length).fill('0'), ...t2] : h;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const buf = Buffer.alloc(18);
  groups.forEach((g, i) => buf.writeUInt16BE(parseInt(g, 16), i * 2));
  buf.writeUInt16BE(port, 16);
  return buf;
}
