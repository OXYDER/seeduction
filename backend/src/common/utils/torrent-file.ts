import { createHash } from 'crypto';
import { bdecode, bencode } from './bencode';

export interface ParsedTorrent {
  infoHash: string; // sha1 hex
  name: string;
  totalSize: number;
  files: { path: string; size: number }[];
  isPrivate: boolean;
}

/**
 * Parse un buffer .torrent brut et calcule son info_hash (sha1 du dict "info"
 * ré-encodé en bencode, conformément à la BEP 3).
 */
export function parseTorrentFile(buf: Buffer): ParsedTorrent {
  const meta = bdecode(buf);
  if (!meta.info) throw new Error('Fichier .torrent invalide : pas de dict "info"');

  const infoBencoded = bencode(meta.info);
  const infoHash = createHash('sha1').update(infoBencoded).digest('hex');

  const name = meta.info.name?.toString('utf8') ?? 'unknown';
  const isPrivate = meta.info.private === 1;

  let files: { path: string; size: number }[];
  if (meta.info.files) {
    // torrent multi-fichiers
    files = meta.info.files.map((f: any) => ({
      path: f.path.map((p: Buffer) => p.toString('utf8')).join('/'),
      size: f.length,
    }));
  } else {
    // torrent mono-fichier
    files = [{ path: name, size: meta.info.length }];
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return { infoHash, name, totalSize, files, isPrivate };
}

/**
 * Injecte/écrase l'annonce URL avec la passkey de l'utilisateur, et force
 * le flag "private" à 1 — indispensable pour un tracker privé (empêche
 * le partage sur DHT/PEX/trackers publics).
 */
export function rewriteTorrentForUser(
  originalBuf: Buffer,
  announceUrl: string,
): Buffer {
  const meta = bdecode(originalBuf);
  meta.announce = Buffer.from(announceUrl, 'utf8');
  delete meta['announce-list'];
  meta.info.private = 1;
  return bencode(meta);
}
