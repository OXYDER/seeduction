// Valeurs et détection automatique des métadonnées « Film / Série » de l'upload
// (saison, épisode, langue, genres, type 2D/3D), à partir du nom de la release, de la liste des fichiers et du NFO.
import { detectFromReleaseName } from './searchParser';

export const GENRES = [
  'Action', 'Action & Aventure', 'Animation', 'Aventure', 'Biographie', 'Comédie', 'Comédie dramatique', 'Comédie musicale', 'Concert',
  'Crime', 'Documentaire', 'Drame', 'Enfants', 'Famille', 'Fantastique', 'Guerre', 'Histoire', 'Horreur', 'Humour', 'Musique',
  'Mystère', 'Policier', 'Politique', 'Réalité', 'Romance', 'Science-fiction', 'Science-fiction & Fantastique', 'Soap', 'Sport',
  'Talk-show', 'Téléfilm', 'Thriller', 'Western', 'Arts martiaux', 'Catastrophe', 'Espionnage', 'Erotique', 'Spectacle', 'Autre',
];
export const VIDEO_TYPES = ['2D', '3D FSBS', '3D', '3D HSBS'];
export const SEASON_OPTIONS = ['Intégrale', 'Spéciaux', ...Array.from({ length: 50 }, (_, i) => String(i + 1))];
export const EPISODE_OPTIONS = ['Saison complète', 'Spécial', ...Array.from({ length: 150 }, (_, i) => String(i + 1))];

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const GENRE_SYNONYMS: Record<string, string> = {
  comedy: 'Comédie', drama: 'Drame', 'sci fi': 'Science-fiction', scifi: 'Science-fiction', 'science fiction': 'Science-fiction',
  fantasy: 'Fantastique', horror: 'Horreur', adventure: 'Aventure', family: 'Famille', history: 'Histoire',
  war: 'Guerre', music: 'Musique', mystery: 'Mystère', documentary: 'Documentaire',
  kids: 'Enfants', reality: 'Réalité', 'talk show': 'Talk-show', 'tv movie': 'Téléfilm', biography: 'Biographie',
  sports: 'Sport', musical: 'Comédie musicale', police: 'Policier', erotic: 'Erotique',
};
const GENRE_INDEX = new Map<string, string>([
  ...GENRES.map((g) => [strip(g), g] as [string, string]),
  ...Object.entries(GENRE_SYNONYMS),
]);

export function matchGenres(list: string): string[] {
  const out: string[] = [];
  for (const part of list.split(/[,/|;]+|\s{2,}/)) {
    const g = GENRE_INDEX.get(strip(part));
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

export function detectEpisodeInfo(text: string): { season?: string; episode?: string } {
  const se = text.match(/\bS(\d{1,2})[ ._-]?E(\d{1,3})\b/i);
  if (se) return { season: String(Number(se[1])), episode: String(Number(se[2])) };
  const sOnly = text.match(/\bS(\d{1,2})\b(?![ ._-]?E\d)/i) ?? text.match(/\b(?:saison|season)[ ._-]?(\d{1,2})\b/i);
  if (sOnly) return { season: String(Number(sOnly[1])), episode: 'Saison complète' };
  if (/\b(int[eé]grale|complete[ ._-]series|s[eé]rie[ ._-]compl[eè]te)\b/i.test(text)) return { season: 'Intégrale', episode: 'Saison complète' };
  return {};
}

export function detectVideoType(text: string): string | undefined {
  if (/\b(fsbs|full[ ._-]?sbs|3d[ ._-]?fsbs)\b/i.test(text)) return '3D FSBS';
  if (/\b(hsbs|half[ ._-]?sbs|h[ ._-]?sbs|3d[ ._-]?hsbs)\b/i.test(text)) return '3D HSBS';
  if (/\b3d\b/i.test(text)) return '3D';
  return undefined;
}

export interface NfoInfo {
  resolution?: string; codec?: string; audio?: string; language?: string; source?: string; year?: number;
  hdr?: boolean; fps?: number; durationMinutes?: number; genres: string[]; videoType?: string;
  season?: string; episode?: string; containerFormat?: string;
}

const LANG_CODE: Record<string, string> = { french: 'fr', francais: 'fr', fr: 'fr', fre: 'fr', fra: 'fr', english: 'en', anglais: 'en', en: 'en', eng: 'en' };

/** Lit un NFO (texte libre ou sortie MediaInfo) et en tire les valeurs qu'il est possible de deviner ; le reste est laissé vide. */
export function parseNfo(text: string): NfoInfo {
  const out: NfoInfo = { genres: [] };
  if (!text.trim()) return out;

  const width = Number(text.match(/^\s*Width\s*:\s*([\d\s]+)/im)?.[1]?.replace(/\s/g, ''));
  const height = Number(text.match(/^\s*Height\s*:\s*([\d\s]+)/im)?.[1]?.replace(/\s/g, ''));
  if (width || height) {
    out.resolution = width >= 3400 || height >= 1800 ? '4K/2160p' : width >= 1800 || height >= 1000 ? '1080p' : width >= 1200 || height >= 680 ? '720p' : '480p';
  } else {
    const p = text.match(/\b(2160|1080|720|480)p\b/i)?.[1];
    if (p) out.resolution = p === '2160' ? '4K/2160p' : `${p}p`;
  }

  if (/\b(x265|hevc|h\.?265)\b/i.test(text)) out.codec = 'x265/HEVC';
  else if (/\b(x264|avc|h\.?264)\b/i.test(text)) out.codec = 'x264';
  else if (/\bav1\b/i.test(text)) out.codec = 'AV1';
  else if (/\bxvid\b/i.test(text)) out.codec = 'XviD';

  if (/atmos/i.test(text)) out.audio = 'Atmos';
  else if (/truehd/i.test(text)) out.audio = 'TrueHD';
  else if (/\bDTS/i.test(text)) out.audio = 'DTS';
  else if (/\bFLAC\b/i.test(text)) out.audio = 'FLAC';
  else if (/\bAAC\b/i.test(text)) out.audio = 'AAC';
  else if (/\bMP3\b|MPEG Audio/i.test(text)) out.audio = 'MP3';

  if (/HDR10|\bHDR\b|Dolby Vision|BT\.2020/i.test(text)) out.hdr = true;

  const fps = text.match(/Frame rate\s*:\s*([\d.]+)/i)?.[1];
  if (fps) out.fps = Math.round(Number(fps));
  const dur = text.match(/^\s*Duration\s*:\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:min|mn))?/im);
  if (dur && (dur[1] || dur[2])) out.durationMinutes = Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0);

  const container = text.match(/^\s*Format\s*:\s*(Matroska|MPEG-4|AVI)/im)?.[1];
  if (container) out.containerFormat = /matroska/i.test(container) ? 'MKV' : /mpeg-4/i.test(container) ? 'MP4' : 'AVI';

  // Langues : blocs Audio / Text de MediaInfo, sinon mentions explicites (VFQ, TRUEFRENCH, MULTI...).
  const audioLangs = new Set<string>();
  const subLangs = new Set<string>();
  let section = '';
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^\s*(General|Video|Audio|Text|Menu|Other)(?:\s*#\d+)?\s*$/i);
    if (head) { section = head[1].toLowerCase(); continue; }
    const lang = line.match(/^\s*Language\s*:\s*([^\s/(]+)/i)?.[1];
    if (lang) {
      const code = LANG_CODE[strip(lang)] ?? strip(lang).slice(0, 2);
      if (section === 'audio') audioLangs.add(code);
      if (section === 'text') subLangs.add(code);
    }
  }
  const labelled = text.split(/\r?\n/).filter((l) => /^\s*(release|nom|name|titre|langue|language|audio)\b.*[:.]/i.test(l)).join(' ');
  const explicit = detectFromReleaseName(labelled).language;
  if (explicit) out.language = explicit;
  else if (audioLangs.size > 1 && audioLangs.has('fr')) out.language = 'MULTI';
  else if (audioLangs.size === 1 && audioLangs.has('fr')) out.language = /(qu[eé]bec|vfq|canad)/i.test(text) ? 'VFQ' : 'VF';
  else if (audioLangs.size >= 1 && subLangs.has('fr')) out.language = 'VOSTFR';
  else if (audioLangs.size === 1) out.language = 'VO';

  const relLine = text.split(/\r?\n/).find((l) => /^\s*(release|nom|name|titre)\b.*[:.]/i.test(l)) ?? '';
  const det = detectFromReleaseName(relLine);
  if (det.source) out.source = det.source;
  if (det.year) out.year = det.year;
  const yr = text.match(/^\s*(?:ann[eé]e|year|date de sortie|release date)[^:\n]*[:.]+\s*.*?\b((?:19|20)\d{2})\b/im)?.[1];
  if (!out.year && yr) out.year = Number(yr);
  if (!out.source) {
    if (/blu-?ray|bdrip|remux/i.test(text)) out.source = /remux/i.test(text) ? 'Remux' : 'BluRay';
    else if (/web-?dl/i.test(text)) out.source = 'WEB-DL';
    else if (/webrip/i.test(text)) out.source = 'WEBRip';
    else if (/hdtv/i.test(text)) out.source = 'HDTV';
    else if (/dvdrip/i.test(text)) out.source = 'DVDRip';
  }

  const genreLine = text.match(/^\s*genres?\s*[:.]+\s*(.+)$/im)?.[1];
  if (genreLine) out.genres = matchGenres(genreLine);
  out.videoType = detectVideoType(text);
  Object.assign(out, detectEpisodeInfo(relLine));
  return out;
}
