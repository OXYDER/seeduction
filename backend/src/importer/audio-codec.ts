/** Titres de sections d'un MediaInfo (anglais ou français) -> section. */
const SECTIONS: Record<string, string> = { general: 'general', video: 'video', audio: 'audio', text: 'text', texte: 'text', menu: 'menu', other: 'other', autre: 'other' };
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Codec audio d'une release : d'après son nom, sinon d'après la première piste audio de son MediaInfo / NFO.
 * Valeurs : Atmos, TrueHD, DTS, E-AC3 (Dolby Digital Plus), AC3 (Dolby Digital), FLAC, Opus, AAC, MP3.
 */
export function audioOf(name: string, nfo = ''): string | undefined {
  const n = ` ${name.replace(/[._\-[\]()]+/g, ' ')} `;
  if (/\bATMOS\b/i.test(n)) return 'Atmos';
  if (/\bTRUE ?HD\b/i.test(n)) return 'TrueHD';
  if (/\bDTS\b/i.test(n)) return 'DTS';
  if (/\b(E ?AC ?3|DDP\d?|DD\+|DD PLUS)\b/i.test(n)) return 'E-AC3';
  if (/\b(AC ?3|DD ?\d(?: \d)?)\b/i.test(n)) return 'AC3';
  if (/\bFLAC\b/i.test(n)) return 'FLAC';
  if (/\bOPUS\b/i.test(n)) return 'Opus';
  if (/\bAAC\b/i.test(n)) return 'AAC';
  if (/\bMP3\b/i.test(n)) return 'MP3';

  // Pas dans le nom : le premier format de piste audio du MediaInfo (section « Audio », ligne « Format : E-AC-3 »).
  let inAudio = false;
  for (const raw of nfo.split(/\r?\n/)) {
    const line = raw.replace(/^[\s─-╿|*+>·•~=_#\-³º°ª]+/, ''); // cadres de NFO « scène »
    const head = SECTIONS[strip(line.replace(/#\s*\d+/, ''))];
    if (head) { inAudio = head === 'audio'; continue; }
    if (!inAudio) continue;
    const f = line.match(/^Format(?:\/Info)?\s*[.\s]*:\s*(.+)$/i)?.[1] ?? line.match(/^Codec(?: ID)?\s*[.\s]*:\s*(.+)$/i)?.[1];
    if (!f) continue;
    if (/atmos/i.test(f)) return 'Atmos';
    if (/true\s*hd|MLP/i.test(f)) return 'TrueHD';
    if (/\bDTS/i.test(f)) return 'DTS';
    if (/E-?AC-?3|DD\+/i.test(f)) return 'E-AC3';
    if (/\bAC-?3\b/i.test(f)) return 'AC3';
    if (/FLAC/i.test(f)) return 'FLAC';
    if (/opus/i.test(f)) return 'Opus';
    if (/AAC/i.test(f)) return 'AAC';
    if (/MPEG Audio|MP3/i.test(f)) return 'MP3';
  }
  return undefined;
}
