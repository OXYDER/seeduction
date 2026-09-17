/** Décodeur bencode minimal (dictionnaires/listes/entiers/byte-strings) — juste assez pour lire les métadonnées d'un .torrent côté client, sans round-trip serveur. */
function decodeBencode(bytes: Uint8Array): any {
  let pos = 0;

  function readByteString(): Uint8Array {
    let lenStr = '';
    while (bytes[pos] !== 58 /* ':' */) { lenStr += String.fromCharCode(bytes[pos]); pos++; }
    pos++;
    const len = parseInt(lenStr, 10);
    const value = bytes.slice(pos, pos + len);
    pos += len;
    return value;
  }

  function readValue(): any {
    const marker = bytes[pos];
    if (marker === 105 /* 'i' */) {
      pos++;
      let numStr = '';
      while (bytes[pos] !== 101 /* 'e' */) { numStr += String.fromCharCode(bytes[pos]); pos++; }
      pos++;
      return parseInt(numStr, 10);
    }
    if (marker === 108 /* 'l' */) {
      pos++;
      const list: any[] = [];
      while (bytes[pos] !== 101) list.push(readValue());
      pos++;
      return list;
    }
    if (marker === 100 /* 'd' */) {
      pos++;
      const dict: Record<string, any> = {};
      while (bytes[pos] !== 101) {
        const key = bytesToText(readByteString());
        dict[key] = readValue();
      }
      pos++;
      return dict;
    }
    return readByteString();
  }

  return readValue();
}

export function bytesToText(v: Uint8Array | undefined): string {
  if (!v) return '';
  return new TextDecoder('utf-8').decode(v);
}

export interface TorrentFileEntry {
  path: string;
  size: number;
}

export interface ParsedTorrent {
  name: string;
  files: TorrentFileEntry[];
}

export async function parseTorrentInfo(file: File): Promise<ParsedTorrent> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = decodeBencode(bytes);
  const info = decoded.info;
  if (!info) throw new Error('Fichier .torrent invalide : section "info" manquante');

  const name = bytesToText(info.name);
  const files: TorrentFileEntry[] = info.files
    ? info.files.map((f: any) => ({
        path: (f.path as Uint8Array[]).map((p) => bytesToText(p)).join('/'),
        size: f.length,
      }))
    : [{ path: name, size: info.length }];

  return { name, files };
}
