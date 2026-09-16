/**
 * Encodeur/décodeur Bencode minimaliste — nécessaire pour répondre
 * aux clients BitTorrent sur les endpoints announce/scrape, et pour
 * parser les fichiers .torrent uploadés.
 *
 * Le format bencode supporte 4 types : integers, byte strings, lists, dicts.
 */

type Bencodable =
  | number
  | Buffer
  | string
  | Bencodable[]
  | { [key: string]: Bencodable };

export function bencode(data: Bencodable): Buffer {
  if (typeof data === 'number') {
    return Buffer.from(`i${Math.trunc(data)}e`);
  }
  if (Buffer.isBuffer(data)) {
    return Buffer.concat([Buffer.from(`${data.length}:`), data]);
  }
  if (typeof data === 'string') {
    const buf = Buffer.from(data, 'utf8');
    return Buffer.concat([Buffer.from(`${buf.length}:`), buf]);
  }
  if (Array.isArray(data)) {
    const parts = data.map(bencode);
    return Buffer.concat([Buffer.from('l'), ...parts, Buffer.from('e')]);
  }
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data).sort(); // les clés doivent être triées
    const parts: Buffer[] = [Buffer.from('d')];
    for (const key of keys) {
      parts.push(bencode(key));
      parts.push(bencode(data[key]));
    }
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }
  throw new Error('Type non bencodable');
}

export function bdecode(buf: Buffer): any {
  let offset = 0;

  function decodeNext(): any {
    const marker = buf[offset];
    if (marker === 0x69 /* 'i' */) return decodeInt();
    if (marker === 0x6c /* 'l' */) return decodeList();
    if (marker === 0x64 /* 'd' */) return decodeDict();
    if (marker >= 0x30 && marker <= 0x39 /* '0'-'9' */) return decodeString();
    throw new Error(`Bencode invalide à l'offset ${offset}`);
  }

  function decodeInt(): number {
    offset++; // skip 'i'
    const end = buf.indexOf(0x65, offset); // 'e'
    const val = parseInt(buf.toString('ascii', offset, end), 10);
    offset = end + 1;
    return val;
  }

  function decodeString(): Buffer {
    const colon = buf.indexOf(0x3a, offset); // ':'
    const len = parseInt(buf.toString('ascii', offset, colon), 10);
    const start = colon + 1;
    const val = buf.subarray(start, start + len);
    offset = start + len;
    return val;
  }

  function decodeList(): any[] {
    offset++; // skip 'l'
    const list: any[] = [];
    while (buf[offset] !== 0x65) list.push(decodeNext());
    offset++; // skip 'e'
    return list;
  }

  function decodeDict(): Record<string, any> {
    offset++; // skip 'd'
    const dict: Record<string, any> = {};
    while (buf[offset] !== 0x65) {
      const key = decodeString().toString('utf8');
      dict[key] = decodeNext();
    }
    offset++; // skip 'e'
    return dict;
  }

  return decodeNext();
}
