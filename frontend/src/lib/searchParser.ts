// Vocabulaire partagé entre le formulaire d'upload (menus déroulants) et le
// parseur de recherche en langage naturel, pour que les valeurs se
// correspondent toujours exactement des deux côtés.
export const RESOLUTIONS = ['4K/2160p', '1080p', '720p', '480p'];
export const LANGUAGES = ['VF', 'VFF', 'VOSTFR', 'VO', 'MULTI'];
export const SOURCES = ['BluRay', 'WEB-DL', 'WEBRip', 'HDTV', 'DVDRip', 'CAM'];
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
alias(['vf'], 'language', 'VF');
alias(['vff'], 'language', 'VFF');
alias(['vo'], 'language', 'VO');
alias(['multi'], 'language', 'MULTI');
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
