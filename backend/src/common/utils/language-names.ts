/**
 * Les vraies langues d'une release, en toutes lettres (« Français (France) », « Anglais »…), pour l'application : l'étiquette de la règle du site
 * (« MULTI.VFF ») ne dit que la variante française ; les autres pistes audio se lisent dans le MediaInfo / NFO de la release.
 */

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Nom français d'une langue d'après son nom (anglais ou français) ou son code ISO. */
const LANGS: Record<string, string> = {
  english: 'Anglais', anglais: 'Anglais', en: 'Anglais', eng: 'Anglais',
  spanish: 'Espagnol', espagnol: 'Espagnol', es: 'Espagnol', spa: 'Espagnol', castilian: 'Espagnol',
  german: 'Allemand', allemand: 'Allemand', de: 'Allemand', ger: 'Allemand', deu: 'Allemand',
  italian: 'Italien', italien: 'Italien', it: 'Italien', ita: 'Italien',
  portuguese: 'Portugais', portugais: 'Portugais', pt: 'Portugais', por: 'Portugais',
  japanese: 'Japonais', japonais: 'Japonais', ja: 'Japonais', jpn: 'Japonais',
  korean: 'Coréen', coreen: 'Coréen', ko: 'Coréen', kor: 'Coréen',
  chinese: 'Chinois', chinois: 'Chinois', zh: 'Chinois', zho: 'Chinois', chi: 'Chinois', mandarin: 'Chinois', cantonese: 'Cantonais',
  russian: 'Russe', russe: 'Russe', ru: 'Russe', rus: 'Russe',
  arabic: 'Arabe', arabe: 'Arabe', ar: 'Arabe', ara: 'Arabe',
  dutch: 'Néerlandais', neerlandais: 'Néerlandais', nl: 'Néerlandais', nld: 'Néerlandais', dut: 'Néerlandais',
  polish: 'Polonais', polonais: 'Polonais', pl: 'Polonais', pol: 'Polonais',
  turkish: 'Turc', turc: 'Turc', tr: 'Turc', tur: 'Turc',
  hindi: 'Hindi', hi: 'Hindi', hin: 'Hindi',
  thai: 'Thaï', th: 'Thaï', tha: 'Thaï',
  swedish: 'Suédois', suedois: 'Suédois', sv: 'Suédois', swe: 'Suédois',
  danish: 'Danois', danois: 'Danois', da: 'Danois', dan: 'Danois',
  norwegian: 'Norvégien', norvegien: 'Norvégien', no: 'Norvégien', nor: 'Norvégien',
  finnish: 'Finnois', finnois: 'Finnois', fi: 'Finnois', fin: 'Finnois',
  czech: 'Tchèque', tcheque: 'Tchèque', cs: 'Tchèque', ces: 'Tchèque', cze: 'Tchèque',
  hungarian: 'Hongrois', hongrois: 'Hongrois', hu: 'Hongrois', hun: 'Hongrois',
  hebrew: 'Hébreu', hebreu: 'Hébreu', he: 'Hébreu', heb: 'Hébreu',
  greek: 'Grec', grec: 'Grec', el: 'Grec', ell: 'Grec', gre: 'Grec',
  ukrainian: 'Ukrainien', ukrainien: 'Ukrainien', uk: 'Ukrainien', ukr: 'Ukrainien',
  romanian: 'Roumain', roumain: 'Roumain', ro: 'Roumain', ron: 'Roumain', rum: 'Roumain',
  vietnamese: 'Vietnamien', vietnamien: 'Vietnamien', vi: 'Vietnamien', vie: 'Vietnamien',
  indonesian: 'Indonésien', indonesien: 'Indonésien', id: 'Indonésien', ind: 'Indonésien',
  catalan: 'Catalan', ca: 'Catalan', cat: 'Catalan',
};

const FRENCH_WORD = /^(french|francais|fr|fre|fra)$/;

/** Libellé d'une variante française de la règle du site. */
export const FRENCH_NAMES: Record<string, string> = {
  VFF: 'Français (France)', TRUEFRENCH: 'Français (France)',
  VFI: 'Français (International)',
  VFQ: 'Français (Québec)',
  VFB: 'Français (Belgique)',
  VOF: 'Français (version originale)',
  VF: 'Français',
};

/** « Spanish (Latin America) » -> « Espagnol (Amérique latine) » ; la région n'est gardée que quand elle change vraiment la piste. */
function withRegion(name: string, region: string): string {
  const r = strip(region);
  if (!r) return name;
  if (name === 'Espagnol' && /latin|latam|419|mex|am[eé]rique/.test(r)) return 'Espagnol (Amérique latine)';
  if (name === 'Espagnol' && /spain|espagne|castil/.test(r)) return 'Espagnol (Espagne)';
  if (name === 'Portugais' && /bra[sz]il/.test(r)) return 'Portugais (Brésil)';
  if (name === 'Portugais' && /portugal|\bpt\b/.test(r) && !/bra/.test(r)) return 'Portugais (Portugal)';
  if (name === 'Anglais' && /\b(us|usa|etats)\b/.test(r)) return 'Anglais';
  return name;
}

/** Les langues audio qui ne sont PAS du français, lues dans un MediaInfo (sections « Audio ») ou une ligne d'audio de NFO texte, dans l'ordre des pistes, sans doublon. */
export function otherAudioLanguages(nfo: string | null | undefined): string[] {
  const out: string[] = [];
  const add = (n: string | undefined) => { if (n && !out.includes(n)) out.push(n); };
  const text = String(nfo ?? '').slice(0, 60_000);
  let section = '';
  let structured = 0;
  const SECTIONS: Record<string, string> = { general: 'general', video: 'video', audio: 'audio', text: 'text', texte: 'text', menu: 'menu', other: 'other', autre: 'other' };
  for (const line of text.split(/\r?\n/)) {
    const head = SECTIONS[strip(line.replace(/#\s*\d+/, ''))];
    if (head) { section = head; continue; }
    if (section !== 'audio') continue;
    const m = line.match(/^\s*(?:Language|Langue)(?:\s*\/[^:]*)?[\s.]*:\s*(.+)$/i)?.[1]?.trim();
    if (!m) continue;
    structured++;
    const first = strip(m.split(/[\s/(]/)[0]);
    if (FRENCH_WORD.test(first)) continue;
    const name = LANGS[first];
    if (name) add(withRegion(name, m.match(/\(([^)]*)\)/)?.[1] ?? ''));
  }
  if (structured === 0) {
    // NFO texte : « Audio : French E-AC-3 5.1 / English E-AC-3 5.1 | S: French ».
    for (const raw of text.split(/\r?\n/)) {
      const m = raw.match(/(?:^|[|\s])(?:audio|audios|a)\s*\d*\s*:\s*(.+)$/i);
      if (!m) continue;
      const rest = m[1].split(/\|\s*(?:s|st|sub|subs|subtitles?)\s*:/i)[0];
      for (const hit of rest.matchAll(/\b([A-Za-zÀ-ÿ]{3,})\b(?:\s*\(([^)]*)\))?/g)) {
        const w = strip(hit[1]);
        if (FRENCH_WORD.test(w) || w.startsWith('fran')) continue;
        const name = LANGS[w];
        if (name) add(withRegion(name, hit[2] ?? ''));
      }
    }
  }
  return out;
}

/**
 * Les langues audio d'une release en toutes lettres. `tag` : l'étiquette du site (« MULTI.VFQ ») ; `nfo` : le MediaInfo / NFO, pour les autres pistes.
 * Une release « MULTI » dont le NFO ne dit rien des autres pistes se termine par « Autres langues » (on ne devine pas lesquelles).
 */
export function audioLanguageNames(tag: string | null | undefined, nfo?: string | null): string[] {
  const t = String(tag ?? '').trim().toUpperCase();
  if (!t) {
    const others = otherAudioLanguages(nfo);
    return others;
  }
  const atoms = t.split('.').filter(Boolean);
  const out: string[] = [];
  const add = (n: string) => { if (!out.includes(n)) out.push(n); };
  if (atoms.includes('MUET')) return ['Muet'];
  if (atoms.includes('VF2')) { add(FRENCH_NAMES.VFF); add(FRENCH_NAMES.VFQ); }
  for (const a of atoms) if (FRENCH_NAMES[a] && a !== 'VF2') add(FRENCH_NAMES[a]);
  const isMulti = atoms.includes('MULTI') || atoms.includes('VF2');
  const isOriginal = atoms.includes('VO') || (atoms.includes('VOSTFR') && !out.length);
  if (isOriginal && !out.length) { const o = otherAudioLanguages(nfo); return o.length ? o.map((n) => n) : ['Version originale']; }
  if (isMulti || otherAudioLanguages(nfo).length) {
    const others = otherAudioLanguages(nfo);
    if (others.length) others.forEach(add); else if (isMulti) add('Autres langues');
  }
  return out;
}

/** Sous-titres en toutes lettres : « FR » -> « Français », « FR forcés » -> « Français (forcés) », « EN » -> « Anglais ». */
export function subtitleNames(subs: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const s of subs ?? []) {
    const [code, ...rest] = String(s).trim().split(/\s+/);
    const w = strip(code);
    const base = FRENCH_WORD.test(w) ? 'Français' : LANGS[w] ?? String(code);
    const extra = rest.join(' ').trim();
    const label = extra ? `${base} (${extra})` : base;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}
