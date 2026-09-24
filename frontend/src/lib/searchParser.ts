// Vocabulaire partagé entre le formulaire d'upload (menus déroulants) et le
// parseur de recherche en langage naturel, pour que les valeurs se
// correspondent toujours exactement des deux côtés.
export const RESOLUTIONS = ['4K/2160p', '1080p', '720p', '480p'];
export const LANGUAGES = ['VFQ', 'VFF', 'VF', 'VOSTFR', 'VO', 'MULTI'];
export const ORIGINS = ['Québec', 'France', 'Canada anglais', 'International'];
export const SOURCES = ['Remux', 'BluRay', 'WEB-DL', 'WEBRip', 'HDTV', 'DVDRip', 'CAM'];
export const CODECS = ['x264', 'x265/HEVC', 'AV1', 'XviD'];
export const AUDIO_FORMATS = ['MP3', 'FLAC', 'AAC', 'DTS', 'TrueHD', 'Atmos'];
export const CONTAINERS = ['MKV', 'MP4', 'AVI'];

type AliasField = 'resolution' | 'language' | 'source' | 'codec' | 'audio' | 'containerFormat' | 'hdr';
const ALIASES: Record<string, { field: AliasField; value: string | true }> = {};
function alias(tokens: string[], field: AliasField, value: string | true) {
  for (const t of tokens) ALIASES[t.toLowerCase()] = { field, value };
}
alias(['4k', '2160p', 'uhd'], 'resolution', '4K/2160p');
alias(['1080p', 'fhd', 'fullhd'], 'resolution', '1080p');
alias(['720p', 'hd'], 'resolution', '720p');
alias(['480p', 'sd'], 'resolution', '480p');
alias(['vostfr', 'vost'], 'language', 'VOSTFR');
alias(['vf', 'french'], 'language', 'VF');
alias(['vfq', 'quebec', 'québec'], 'language', 'VFQ');
alias(['vff', 'truefrench'], 'language', 'VFF');
alias(['vo'], 'language', 'VO');
alias(['multi'], 'language', 'MULTI');
alias(['remux'], 'source', 'Remux');
alias(['bluray', 'blu-ray', 'bdrip'], 'source', 'BluRay');
alias(['web-dl', 'webdl'], 'source', 'WEB-DL');
alias(['webrip'], 'source', 'WEBRip');
alias(['hdtv'], 'source', 'HDTV');
alias(['dvdrip'], 'source', 'DVDRip');
alias(['cam'], 'source', 'CAM');
alias(['x264', 'h264'], 'codec', 'x264');
alias(['x265', 'h265', 'hevc'], 'codec', 'x265/HEVC');
alias(['av1'], 'codec', 'AV1');
alias(['xvid'], 'codec', 'XviD');
alias(['flac'], 'audio', 'FLAC');
alias(['mp3'], 'audio', 'MP3');
alias(['aac'], 'audio', 'AAC');
alias(['dts'], 'audio', 'DTS');
alias(['truehd'], 'audio', 'TrueHD');
alias(['atmos'], 'audio', 'Atmos');
alias(['mkv'], 'containerFormat', 'MKV');
alias(['mp4'], 'containerFormat', 'MP4');
alias(['avi'], 'containerFormat', 'AVI');
alias(['hdr', 'hdr10'], 'hdr', true);

export interface ParsedQuery {
  name: string;
  year?: number;
  resolution?: string;
  language?: string;
  source?: string;
  codec?: string;
  audio?: string;
  containerFormat?: string;
  hdr?: boolean;
}

/** Transforme une requête en langage naturel ("Dune 2024 4K HDR VOSTFR") en filtres structurés + reste du texte à chercher sur le nom. */
export function parseNaturalQuery(query: string): ParsedQuery {
  const result: ParsedQuery = { name: '' };
  const remaining: string[] = [];

  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const yearMatch = token.match(/^(19|20)\d{2}$/);
    if (yearMatch) {
      result.year = Number(token);
      continue;
    }
    const match = ALIASES[token.toLowerCase()];
    if (match) {
      (result as any)[match.field] = match.value;
      continue;
    }
    remaining.push(token);
  }

  result.name = remaining.join(' ');
  return result;
}

/**
 * Détecte les mêmes tags techniques que parseNaturalQuery mais à partir d'un
 * nom de fichier "scene" (points/underscores/crochets comme séparateurs, et
 * suffixe -GROUPE fréquent sur le dernier tag) — utilisé par l'upload
 * intelligent pour préremplir les métadonnées depuis le contenu du .torrent.
 */
export function detectFromReleaseName(text: string): ParsedQuery {
  const result: ParsedQuery = { name: '' };
  const rawTokens = text.replace(/\.torrent$/i, '').split(/[.\_\[\]()\s]+/).filter(Boolean);

  for (const raw of rawTokens) {
    const yearMatch = raw.match(/^(19|20)\d{2}$/);
    if (yearMatch) { result.year = Number(raw); continue; }

    for (const candidate of [raw, ...raw.split('-')]) {
      const match = ALIASES[candidate.toLowerCase()];
      if (match) { (result as any)[match.field] = match.value; break; }
    }
  }
  return result;
}

// Étiquettes techniques ou de sortie qui ne font pas partie du titre d'une oeuvre.
const NON_TITLE_TOKEN = /^(s\d{1,2}(e\d{1,3})?|saison\d*|complete|complet|integrale|intégrale|discographie|repack|proper|extended|unrated|remastered|multi|truefrench|french|vff|vfq|vostfr|subforced|dvdrip|bdrip|brrip|webrip|web-dl|webdl|hdlight|4klight|hdr10?|dv|x26[45]|h26[45]|hevc|aac|ac3|dts|flac|mp3|\d{3,4}p|\d+kbps|\d+k)$/i;

/**
 * Nettoie un nom de release ("Dune.Part.Two.2024.MULTI.1080p.WEB-DL.x264-GRP")
 * pour en tirer un titre lisible ("Dune Part Two") et l'année, afin de lancer
 * la recherche de métadonnées de façon tolérante — le nom exact du fichier
 * torrent est presque toujours trop "sale" pour une recherche telle quelle.
 */
export function cleanTitleForSearch(raw: string): { title: string; year?: string } {
  const noExt = raw.replace(/\.torrent$/i, '');
  const year = noExt.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/)?.[1];

  const tokens = noExt
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== '-');

  const kept: string[] = [];
  for (const token of tokens) {
    const isYear = /^(19|20)\d{2}$/.test(token);
    const isTag = NON_TITLE_TOKEN.test(token) || !!ALIASES[token.toLowerCase()] || token.split('-').some((p) => !!ALIASES[p.toLowerCase()] && token.includes('-'));
    if ((isYear || isTag) && kept.length > 0) break;
    if (!isYear && !isTag) kept.push(token);
  }

  const title = (kept.length > 0 ? kept : tokens.filter((t) => !NON_TITLE_TOKEN.test(t))).join(' ').trim();
  return { title: title || noExt.replace(/[._]+/g, ' ').trim(), year };
}
