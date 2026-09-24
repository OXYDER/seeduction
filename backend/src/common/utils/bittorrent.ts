/**
 * Décode un paramètre BitTorrent encodé en pourcentage vers des octets, puis en hexadécimal.
 * L'info_hash est du binaire (20 octets) : `decodeURIComponent` le lirait comme de l'UTF-8 et
 * lèverait « URI malformed » dès qu'un octet n'est pas du texte valide (cas de la plupart des torrents).
 */
export function percentDecodedToHex(raw: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '%' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3))) {
      bytes.push(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (c === '+') {
      bytes.push(0x20);
    } else {
      bytes.push(raw.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('hex');
}
