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

// Marque propre à Seeduction dans le dict "info" : sans elle, un torrent déjà
// présent sur un autre tracker privé aurait exactement le même info_hash ici,
// et le client du membre ne pourrait pas le suivre sur les deux trackers.
const SOURCE_TAG = 'seeduction';

// Champs de premier niveau qui désignent d'autres trackers/sources (ou de la
// pub) : ils ne font pas partie de l'info_hash, on les retire sans conséquence.
const FOREIGN_FIELDS = ['announce', 'announce-list', 'nodes', 'url-list', 'httpseeds', 'comment', 'publisher', 'publisher-url'];

/**
 * Nettoie un .torrent à l'upload : retire tous les trackers/sources externes
 * et force le flag "private" (empêche DHT/PEX/trackers publics) + la marque
 * Seeduction. Ces deux derniers changent le dict "info", donc l'info_hash :
 * il doit être calculé sur CE fichier nettoyé (et non sur l'original), et c'est
 * ce fichier-là qui est stocké et redistribué — l'uploader doit donc le
 * retélécharger depuis Seeduction pour seeder.
 */
export function sanitizeTorrentForUpload(originalBuf: Buffer): Buffer {
  const meta = bdecode(originalBuf);
  if (!meta.info) throw new Error('Fichier .torrent invalide : pas de dict "info"');
  for (const field of FOREIGN_FIELDS) delete meta[field];
  meta.info.private = 1;
  meta.info.source = Buffer.from(SOURCE_TAG, 'utf8');
  return bencode(meta);
}

/**
 * Personnalise un .torrent stocké pour le membre qui le télécharge : son
 * announce Seeduction complète (avec sa passkey) est la seule URL de tracker.
 * Le dict "info" n'est jamais touché ici, pour que l'info_hash reste celui
 * enregistré à l'upload.
 */
export function rewriteTorrentForUser(
  originalBuf: Buffer,
  announceUrl: string,
): Buffer {
  const meta = bdecode(originalBuf);
  meta.announce = Buffer.from(announceUrl, 'utf8');
  delete meta['announce-list'];
  return bencode(meta);
}
