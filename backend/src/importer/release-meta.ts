import { FR_VARIANTS } from '../common/utils/language';
import { audioOf } from './audio-codec';

/**
 * Métadonnées d'une release (langue, résolution, source, codec...) devinées à partir de son NOM et de son NFO / MediaInfo, comme le fait le
 * formulaire d'envoi du site côté navigateur. L'import automatique n'a pas de formulaire : sans ça, aucun filtre ne serait rempli.
 *
 * Langue : étiquette de la règle de Seeduction (voir common/utils/language.ts) —
 *   VOF / TRUEFRENCH / VFF / VFI / VFB / VFQ (une seule piste française), MULTI.<variante> (plusieurs langues, une piste française),
 *   MULTI.VF2 (VFF + VFQ), VOSTFR (aucune piste française, sous-titres français), MUET / MUET.VOSTFR.
 * Le nom de la release fait foi ; le MediaInfo la précise (piste « French (CA) » = VFQ) ou la corrige (deux pistes françaises = MULTI.VF2).
 */
export interface ReleaseMeta {
  year?: number;
  resolution?: string;
  language?: string;
  source?: string;
  codec?: string;
  hdr?: boolean;
  audio?: string;
  containerFormat?: string;
  season?: string;
  episode?: string;
}

const tokensOf = (name: string): string[] => name.replace(/\.torrent$/i, '').split(/[.\_\[\]()\s+/,]+/).filter(Boolean); // « VFQ+VFF », « VFQ/VFF » : deux étiquettes
const LANG_CODE: Record<string, string> = { french: 'fr', francais: 'fr', fr: 'fr', fre: 'fr', fra: 'fr', english: 'en', anglais: 'en', en: 'en', eng: 'en' };
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type Variant = typeof FR_VARIANTS[number];

/** Titres de sections d'un MediaInfo (anglais ou français) -> section. */
const SECTIONS: Record<string, string> = { general: 'general', video: 'video', audio: 'audio', text: 'text', texte: 'text', menu: 'menu', other: 'other', autre: 'other' };

/** Ce que dit le NOM : variantes françaises annoncées, MULTI, MUET, VOSTFR. */
function fromName(tokens: string[]) {
  const all = tokens.flatMap((t) => [t.toLowerCase(), ...t.toLowerCase().split('-')]);
  const has = (...w: string[]) => w.some((x) => all.includes(x));
  const fr = new Set<Variant>();
  if (has('vof')) fr.add('VOF');
  if (has('truefrench')) fr.add('TRUEFRENCH');
  if (has('vff')) fr.add('VFF');
  if (has('vfi')) fr.add('VFI');
  if (has('vfb')) fr.add('VFB');
  if (has('vfq', 'vq', 'vfqc', 'quebec', 'québec', 'canadien')) fr.add('VFQ');
  if (has('vf2')) { fr.add('VFF'); fr.add('VFQ'); }
  return {
    fr,
    multi: has('multi', 'multi2', 'multi3', 'multilang', 'multilangue', 'dual'), // DUAL : deux langues audio
    muet: has('muet'),
    vostfr: has('vostfr', 'vost', 'subfrench'),
  };
}

/** Ce que dit le MediaInfo : variantes des pistes audio françaises, autres langues audio, sous-titres français. */
function fromNfo(nfo: string) {
  const fr = new Set<Variant>();
  let nonFr = 0;
  let subsFr = false;
  let section = '';
  let trackLang = '';
  let trackTitle = '';
  let structured = 0; // pistes lues dans un vrai MediaInfo (sections « Audio »)
  const endAudio = () => {
    if (section === 'audio' && trackLang) {
      structured++;
      if (trackLang === 'fr') fr.add(variantOf(trackLang, trackTitle));
      else nonFr++;
    }
    trackLang = ''; trackTitle = '';
  };
  const variantOf = (_code: string, label: string): Variant => {
    if (/\((?:ca|can)\)|canad|qu[eé]b|fr-?ca|\bvfq\b|\bvq\b/i.test(label)) return 'VFQ';
    if (/\((?:be|bel)\)|belg|fr-?be|\bvfb\b/i.test(label)) return 'VFB';
    if (/\bvfi\b|international/i.test(label)) return 'VFI';
    if (/\bvof\b/i.test(label)) return 'VOF';
    if (/truefrench/i.test(label)) return 'TRUEFRENCH';
    return 'VFF';
  };
  for (const line of nfo.split(/\r?\n/)) {
    const head = SECTIONS[strip(line.replace(/#\s*\d+/, ''))]; // « Audio #2 », « Général », « Vidéo », « Texte » (MediaInfo en français)
    if (head) { endAudio(); section = head; continue; }
    const lang = line.match(/^\s*(?:Language|Langue)(?:\s*\/[^:]*)?[\s.]*:\s*(.+)$/i)?.[1]?.trim();
    if (lang) {
      const code = LANG_CODE[strip(lang.split(/[\s/(]/)[0])] ?? strip(lang).slice(0, 2);
      if (section === 'audio') { trackLang = code; trackTitle = lang + ' ' + trackTitle; }
      if (section === 'text' && code === 'fr') subsFr = true;
    }
    if (section === 'audio' && /^\s*(?:Title|Titre)\s*:/i.test(line)) trackTitle += ' ' + line;
  }
  endAudio();
  // Mention explicite dans un NFO texte (« Langue : VFQ », « Audio : Français (Canada) »).
  for (const raw of nfo.split(/\r?\n/)) {
    // NFO « scène » encadré (souvent en CP437, cadres mal décodés : « ³ Audio : French (Canadien) E-AC-3 ... ») : le mot-clé est cherché n'importe où dans la ligne.
    const line = raw.match(/(?:^|[^a-z])(?:release|nom|name|titre|langues?|language|audio|son)s?\b[\s.]*:.*$/i)?.[0];
    if (!line) continue;
    if (/\bvf2\b/i.test(line)) { fr.add('VFF'); fr.add('VFQ'); }
    if (/\bvfq\b|\bvq\b|qu[eé]b|canad|\((?:ca|qc)\)|fr-?ca/i.test(line)) fr.add('VFQ');
    if (/\bvff\b/i.test(line)) fr.add('VFF');
    if (/\bvfi\b/i.test(line)) fr.add('VFI');
    if (/\bvfb\b/i.test(line)) fr.add('VFB');
    if (/\bvof\b/i.test(line)) fr.add('VOF');
    if (/truefrench/i.test(line)) fr.add('TRUEFRENCH');
  }
  // NFO « texte » sans sections MediaInfo : pistes audio décrites en une ligne.
  if (structured === 0) {
    const t = textAudioTracks(nfo);
    t.fr.forEach((v) => fr.add(v));
    nonFr += t.nonFr;
  }
  return { fr, nonFr, subsFr };
}

const TRACK_LANG = /\b(french|fran[cç]ais|english|anglais|spanish|espagnol|german|allemand|italian|italien|japanese|japonais|korean|cor[ée]en|portuguese|portugais|russian|russe|chinese|chinois|arabic|arabe|dutch|n[ée]erlandais|polish|polonais|turkish|turc|hindi|thai|swedish|danish|norwegian|finnish)\b(?:\s*\(([^)]*)\))?/gi;

/**
 * Pistes audio d'un NFO texte, sur une ligne : « Audio : French (France) E-AC-3 5.1 ↔ … » (NFO « scène », cadres et flèches ignorés)
 * ou « A: French E-AC-3 5.1 / English E-AC-3 5.1 | S: French » (la partie sous-titres, « S: », est ignorée).
 * Français : (Canada / Canadien / Québec / QC) = VFQ, (Belgique / BE) = VFB, sinon VFF — comme pour un MediaInfo.
 */
function textAudioTracks(nfo: string): { fr: Set<Variant>; nonFr: number } {
  const fr = new Set<Variant>();
  let nonFr = 0;
  for (const raw of nfo.split(/\r?\n/)) {
    const m = raw.match(/(?:^|[|\s])(?:audio|audios|a)\s*\d*\s*:\s*(.+)$/i);
    if (!m) continue;
    const rest = m[1].split(/\|\s*(?:s|st|sub|subs|subtitles?)\s*:/i)[0];
    for (const hit of rest.matchAll(TRACK_LANG)) {
      const lang = hit[1].toLowerCase();
      if (lang === 'french' || lang.startsWith('fran')) {
        const region = hit[2] ?? '';
        fr.add(/canad|qu[eé]b|\bqc\b|\bca\b|\bcan\b/i.test(region) ? 'VFQ' : /belg|\bbe\b|\bbel\b/i.test(region) ? 'VFB' : 'VFF');
      } else nonFr++;
    }
  }
  return { fr, nonFr };
}

function languageOf(name: string, nfo: string): string | undefined {
  const n = fromName(tokensOf(name));
  const m = fromNfo(nfo);
  // Aucune piste française annoncée par le nom : muet / VOSTFR.
  const frAll = new Set<Variant>([...n.fr, ...m.fr]);
  const both = frAll.has('VFF') && frAll.has('VFQ');
  if (n.fr.size === 0 && m.fr.size === 0) {
    if (n.muet) return n.vostfr ? 'MUET.VOSTFR' : 'MUET';
    if (n.vostfr || m.subsFr) return 'VOSTFR';
    return undefined; // « FRENCH », « MULTi » seuls : rien de précis dans le nom ni le MediaInfo
  }
  // Deux versions françaises (VFF + VFQ) : MULTI.VF2 est obligatoire.
  if (both) return 'MULTI.VF2';
  // Une variante : le nom l'emporte, le MediaInfo la précise quand le nom ne dit que « MULTI » / « FRENCH ».
  const variant: Variant = (n.fr.size ? [...n.fr][0] : [...m.fr][0]) as Variant;
  const multi = n.multi || m.nonFr > 0; // d'autres pistes audio que le français : l'étiquette doit commencer par MULTI
  return multi ? `MULTI.${variant}` : variant;
}

function episodeOf(text: string): { season?: string; episode?: string } {
  const se = text.match(/\bS(\d{1,2})[ ._-]?E(\d{1,3})\b/i);
  if (se) return { season: String(Number(se[1])), episode: String(Number(se[2])) };
  const sOnly = text.match(/\bS(\d{1,2})\b(?![ ._-]?E\d)/i) ?? text.match(/\b(?:saison|season)[ ._-]?(\d{1,2})\b/i);
  if (sOnly) return { season: String(Number(sOnly[1])), episode: 'Saison complète' };
  if (/\b(int[eé]grale|complete[ ._-]series|s[eé]rie[ ._-]compl[eè]te)\b/i.test(text)) return { season: 'Intégrale', episode: 'Saison complète' };
  return {};
}

export function detectReleaseMeta(name: string, nfo = ''): ReleaseMeta {
  const out: ReleaseMeta = {};
  const tokens = tokensOf(name);
  const lower = tokens.flatMap((t) => [t.toLowerCase(), ...t.toLowerCase().split('-')]);
  const has = (...w: string[]) => w.some((x) => lower.includes(x));
  const thisYear = new Date().getFullYear() + 1;

  for (const t of tokens) { const m = t.match(/^((?:19|20)\d{2})$/); if (m && Number(m[1]) <= thisYear) out.year = Number(m[1]); }

  if (has('2160p', '4k', 'uhd', '2160')) out.resolution = '4K/2160p';
  else if (has('1080p', '1080i', 'fhd', 'fullhd')) out.resolution = '1080p';
  else if (has('720p', '720i')) out.resolution = '720p';
  else if (has('480p', '576p', 'sd')) out.resolution = '480p';
  else {
    const w = Number(nfo.match(/^\s*Width\s*:\s*([\d\s]+)/im)?.[1]?.replace(/\s/g, ''));
    const h = Number(nfo.match(/^\s*Height\s*:\s*([\d\s]+)/im)?.[1]?.replace(/\s/g, ''));
    if (w || h) out.resolution = w >= 3400 || h >= 1800 ? '4K/2160p' : w >= 1800 || h >= 1000 ? '1080p' : w >= 1200 || h >= 680 ? '720p' : '480p';
  }

  if (has('remux')) out.source = 'Remux';
  else if (has('bluray', 'blu-ray', 'bdrip', 'brrip', 'bdr')) out.source = 'BluRay';
  else if (has('web-dl', 'webdl', 'amzn', 'nf', 'dsnp', 'atvp', 'hmax')) out.source = 'WEB-DL';
  else if (has('webrip')) out.source = 'WEBRip';
  else if (has('hdtv')) out.source = 'HDTV';
  else if (has('dvdrip')) out.source = 'DVDRip';
  else if (has('cam')) out.source = 'CAM';
  else if (has('web')) out.source = 'WEB-DL';

  if (/\b(x265|h[ ._]?265|hevc)\b/i.test(name)) out.codec = 'x265/HEVC';
  else if (/\b(x264|h[ ._]?264|avc)\b/i.test(name)) out.codec = 'x264';
  else if (has('av1')) out.codec = 'AV1';
  else if (has('xvid')) out.codec = 'XviD';
  if (/\b(hdr10?|hdr|dv|dolby[ ._]?vision)\b/i.test(name)) out.hdr = true;

  out.audio = audioOf(name, nfo);

  const container = nfo.match(/^\s*Format\s*:\s*(Matroska|MPEG-4|AVI)/im)?.[1];
  if (container) out.containerFormat = /matroska/i.test(container) ? 'MKV' : /mpeg-4/i.test(container) ? 'MP4' : 'AVI';
  else if (has('mkv')) out.containerFormat = 'MKV';

  out.language = languageOf(name, nfo);
  Object.assign(out, episodeOf(name));
  return out;
}
