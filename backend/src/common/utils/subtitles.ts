// Sous-titres d'une release : langues lues dans le MediaInfo (pistes « Text »), dans un NFO texte (« Sous-titres : Français, Anglais »), dans le nom (VOSTFR...)
// et dans la liste des fichiers du torrent (fichiers .srt / .ass / .sub / .idx / .sup à côté de la vidéo, dont la langue est lue dans leur nom ou leur dossier).
// Résultat : codes de langue en majuscules, avec « forcés » ou « SDH » quand c'est précisé (« FR », « EN », « FR forcés », « FR SDH »).

const LANGS: Record<string, string> = {
  french: 'FR', francais: 'FR', fr: 'FR', fre: 'FR', fra: 'FR', english: 'EN', anglais: 'EN', en: 'EN', eng: 'EN', spanish: 'ES', espagnol: 'ES', es: 'ES', spa: 'ES', castilian: 'ES',
  german: 'DE', allemand: 'DE', de: 'DE', deu: 'DE', ger: 'DE', italian: 'IT', italien: 'IT', it: 'IT', ita: 'IT', portuguese: 'PT', portugais: 'PT', pt: 'PT', por: 'PT',
  japanese: 'JA', japonais: 'JA', ja: 'JA', jpn: 'JA', korean: 'KO', coreen: 'KO', ko: 'KO', kor: 'KO', chinese: 'ZH', chinois: 'ZH', mandarin: 'ZH', cantonese: 'ZH', zh: 'ZH', chi: 'ZH', zho: 'ZH',
  russian: 'RU', russe: 'RU', ru: 'RU', rus: 'RU', arabic: 'AR', arabe: 'AR', ar: 'AR', ara: 'AR', dutch: 'NL', neerlandais: 'NL', nl: 'NL', nld: 'NL', dut: 'NL', polish: 'PL', polonais: 'PL', pl: 'PL', pol: 'PL',
  turkish: 'TR', turc: 'TR', tr: 'TR', tur: 'TR', swedish: 'SV', suedois: 'SV', sv: 'SV', swe: 'SV', norwegian: 'NO', norvegien: 'NO', no: 'NO', nor: 'NO', danish: 'DA', danois: 'DA', da: 'DA', dan: 'DA',
  finnish: 'FI', finnois: 'FI', fi: 'FI', fin: 'FI', czech: 'CS', tcheque: 'CS', cs: 'CS', ces: 'CS', hungarian: 'HU', hongrois: 'HU', hu: 'HU', hun: 'HU', greek: 'EL', grec: 'EL', el: 'EL', ell: 'EL',
  hebrew: 'HE', hebreu: 'HE', he: 'HE', heb: 'HE', hindi: 'HI', hi: 'HI', hin: 'HI', thai: 'TH', th: 'TH', tha: 'TH', vietnamese: 'VI', vietnamien: 'VI', vi: 'VI', vie: 'VI',
  indonesian: 'ID', indonesien: 'ID', id: 'ID', ind: 'ID', romanian: 'RO', roumain: 'RO', ro: 'RO', ron: 'RO', rum: 'RO', ukrainian: 'UK', ukrainien: 'UK', uk: 'UK', ukr: 'UK',
};
/** Libellés français pour l'affichage (infobulles, page du torrent). */
export const SUBTITLE_NAMES: Record<string, string> = {
  FR: 'Français', EN: 'Anglais', ES: 'Espagnol', DE: 'Allemand', IT: 'Italien', PT: 'Portugais', JA: 'Japonais', KO: 'Coréen', ZH: 'Chinois', RU: 'Russe', AR: 'Arabe', NL: 'Néerlandais',
  PL: 'Polonais', TR: 'Turc', SV: 'Suédois', NO: 'Norvégien', DA: 'Danois', FI: 'Finnois', CS: 'Tchèque', HU: 'Hongrois', EL: 'Grec', HE: 'Hébreu', HI: 'Hindi', TH: 'Thaï', VI: 'Vietnamien',
  ID: 'Indonésien', RO: 'Roumain', UK: 'Ukrainien',
};

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SECTIONS: Record<string, string> = { general: 'general', video: 'video', audio: 'audio', text: 'text', texte: 'text', menu: 'menu', other: 'other', autre: 'other' };

/** « French (CA) », « Français », « fre » → code ; null si la valeur n'est pas une langue connue. */
function codeOf(value: string): string | null {
  const first = strip(value.split(/[(/,|;]/)[0]).split(' ')[0];
  const code = LANGS[first] ?? null;
  if (!code) return null;
  if (code === 'FR' && /\((?:ca|can)\)|canad|qu[eé]b|fr-?ca/i.test(value)) return 'FR-CA';
  return code;
}

const flagsOf = (text: string) => ({
  forced: /\bforced\b|\bforc[eé]s?\b/i.test(text),
  sdh: /\bsdh\b|\bhearing|\bsourds?\b|\bmalentendants?\b|\bcc\b/i.test(text),
});
const label = (code: string, f: { forced: boolean; sdh: boolean }) => (f.forced ? `${code} forcés` : f.sdh ? `${code} SDH` : code);

/** Les langues de sous-titres citées dans un texte libre (« French, English (SRT) | Spanish »), dans l'ordre. */
function listIn(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,/;|+&]|\bet\b|\band\b/i)) {
    const code = codeOf(part.replace(/[←-⇿─-╿]/g, ' ').trim());
    if (code) out.push(label(code, flagsOf(part)));
  }
  return out;
}

const SUB_EXT = /\.(srt|ass|ssa|sub|idx|sup|vtt|smi|sbv)$/i;
/** Langues écrites en toutes lettres ou en 3 lettres : sûres dans un nom de fichier. Les codes à 2 lettres (« fr », « en »...) ne comptent qu'en fin de nom (« Film.2020.fr.srt »). */
const SAFE_TOKEN = (t: string) => t.length >= 3 && !!LANGS[t];

/**
 * Sous-titres livrés en fichiers séparés dans le torrent : « Film.2020.French.srt », « Subs/2_English.srt », « Film.fr.forced.srt », « Sous-titres/fre.idx ».
 * La langue vient du nom du fichier, sinon du dossier (« Subs/French/2.srt ») ; un fichier de sous-titres dont la langue est introuvable est ignoré.
 */
export function subtitleFilesOf(files: { path: string }[]): string[] {
  const out: string[] = [];
  for (const f of files.slice(0, 5000)) {
    const p = String(f?.path ?? '').replace(/\\/g, '/');
    if (!SUB_EXT.test(p)) continue;
    const parts = p.replace(SUB_EXT, '').split('/');
    const stem = parts[parts.length - 1];
    const dirs = parts.slice(0, -1).slice(-2);
    const flags = flagsOf(stem);
    const tokens = strip(stem.replace(/([a-z])([A-Z])/g, '$1 $2')).split(' ').filter(Boolean);
    // les « mots » qui ne sont pas des langues (forced, sdh, cc, numéros) sont ignorés ; le dernier mot peut être un code à 2 lettres
    let code: string | null = null;
    for (let i = tokens.length - 1; i >= 0 && !code; i--) {
      const t = tokens[i];
      if (SAFE_TOKEN(t) || (i === tokens.length - 1 && t.length === 2 && LANGS[t]) || (i === tokens.length - 2 && t.length === 2 && LANGS[t] && /^(forced|forces|sdh|cc|full|signs|songs)$/.test(tokens[i + 1]))) code = LANGS[t];
    }
    if (!code) {
      for (const d of dirs.reverse()) { const dc = codeOf(d); if (dc && strip(d).length >= 2) { code = dc; break; } }
    }
    if (code) out.push(label(code, flags));
  }
  return out;
}

export function subtitlesOf(name: string, nfo = '', files: { path: string }[] = []): string[] {
  const found: string[] = [];

  // 1. MediaInfo : une section « Text » par piste de sous-titres.
  let section = '';
  let track: { lang?: string; forced: boolean; sdh: boolean } | null = null;
  const endTrack = () => { if (track?.lang) found.push(label(track.lang, track)); track = null; };
  for (const raw of nfo.split(/\r?\n/)) {
    const line = raw.replace(/^[\s─-╿|*+>·•~=_#³º°ª]+/, '');
    const head = SECTIONS[strip(line.replace(/#\s*\d+/, ''))];
    if (head) { endTrack(); section = head; if (head === 'text') track = { forced: false, sdh: false }; continue; }
    if (section !== 'text' || !track) continue;
    const lang = line.match(/^(?:Language|Langue)(?:\s*\/[^:]*)?[\s.]*:\s*(.+)$/i)?.[1];
    if (lang) track.lang = codeOf(lang) ?? track.lang;
    if (/^Forced[\s.]*:\s*Yes/i.test(line) || /^(?:Forc[eé]s?)[\s.]*:\s*(?:Oui|Yes)/i.test(line)) track.forced = true;
    const title = line.match(/^(?:Title|Titre)[\s.]*:\s*(.+)$/i)?.[1];
    if (title) { const f = flagsOf(title); track.forced = track.forced || f.forced; track.sdh = track.sdh || f.sdh; }
  }
  endTrack();

  // 2. NFO texte : « Sous-titres : Français, Anglais », « Subtitles ........: French (SRT) », « | S: French ».
  if (found.length === 0) {
    for (const raw of nfo.split(/\r?\n/)) {
      const m = raw.match(/(?:sous[- ]?titres?|subtitles?|subs)\s*\d*\s*[.\s:]*:\s*(.+)$/i) ?? raw.match(/\|\s*(?:s|st|sub|subs)\s*:\s*(.+)$/i);
      if (m) found.push(...listIn(m[1]));
    }
  }

  // 3. Le nom : VOSTFR / SUBFRENCH annoncent des sous-titres français.
  if (found.length === 0 && /(?:^|[.\s_\-[(])(?:vostfr|subfrench|st[.\-_ ]?fr)(?:$|[.\s_\-\])])/i.test(name)) found.push('FR');

  // 4. Fichiers de sous-titres livrés dans le torrent : s'ajoutent à ceux qui sont intégrés à la vidéo.
  found.push(...subtitleFilesOf(files));

  return [...new Set(found)].slice(0, 12);
}

/** Affichage : « Français, Anglais, Français forcés ». */
export function subtitleNames(list: string[]): string {
  return list.map((s) => { const [code, ...rest] = s.split(' '); const base = code === 'FR-CA' ? 'Français (Canada)' : SUBTITLE_NAMES[code] ?? code; return rest.length ? `${base} ${rest.join(' ')}` : base; }).join(', ');
}
