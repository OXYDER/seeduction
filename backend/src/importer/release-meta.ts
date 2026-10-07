/**
 * Métadonnées d'une release (langue, résolution, source, codec...) devinées à partir de son NOM et de son NFO / MediaInfo, comme le fait le
 * formulaire d'envoi du site côté navigateur. L'import automatique n'a pas de formulaire : sans ça, aucun filtre (langue, résolution...) ne serait rempli.
 *
 * Langue : la priorité est de repérer le **VFQ** (doublage français du Québec) :
 *   - dans le nom : VFQ, VQ, QUEBEC, CANADIEN, et VF2 (= deux versions françaises : France + Québec) ;
 *   - dans le MediaInfo : une piste audio « French (CA) » / fr-CA, ou un titre de piste qui parle de VFQ / Québec / Canada.
 * Une release qui contient une piste VFQ (même dans un MULTi) est classée « VFQ » : c'est ce qu'on cherche à retrouver dans le filtre Langue.
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

const tokensOf = (name: string): string[] => name.replace(/\.torrent$/i, '').split(/[.\_\[\]()\s]+/).filter(Boolean);

function languageFromName(tokens: string[]): { language?: string; vfq: boolean } {
  const all = tokens.flatMap((t) => [t.toLowerCase(), ...t.toLowerCase().split('-')]);
  const has = (...w: string[]) => w.some((x) => all.includes(x));
  const vfq = has('vfq', 'vq', 'vfqc', 'quebec', 'québec', 'canadien', 'vf2');
  if (vfq) return { language: 'VFQ', vfq: true };
  if (has('multi', 'multi2', 'multi3')) return { language: 'MULTI', vfq: false };
  if (has('vostfr', 'vost', 'subfrench')) return { language: 'VOSTFR', vfq: false };
  if (has('vff', 'truefrench')) return { language: 'VFF', vfq: false };
  if (has('vf', 'vfi', 'french', 'francais', 'français')) return { language: 'VF', vfq: false };
  if (has('vo')) return { language: 'VO', vfq: false };
  return { vfq: false };
}

const LANG_CODE: Record<string, string> = { french: 'fr', francais: 'fr', 'français': 'fr', fr: 'fr', fre: 'fr', fra: 'fr', english: 'en', anglais: 'en', en: 'en', eng: 'en' };
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Ce que dit un NFO (texte libre ou rapport MediaInfo) sur la langue : pistes audio, sous-titres, mention explicite de VFQ / Québec. */
function languageFromNfo(nfo: string): { language?: string; vfq: boolean } {
  const audio = new Set<string>();
  const subs = new Set<string>();
  let vfq = false;
  let section = '';
  for (const line of nfo.split(/\r?\n/)) {
    const head = line.match(/^\s*(General|Video|Audio|Text|Menu|Other)(?:\s*#\d+)?\s*$/i);
    if (head) { section = head[1].toLowerCase(); continue; }
    const lang = line.match(/^\s*Language\s*:\s*(.+)$/i)?.[1]?.trim();
    if (lang) {
      const code = LANG_CODE[strip(lang.split(/[\s/(]/)[0])] ?? strip(lang).slice(0, 2);
      if (section === 'audio') { audio.add(code); if (code === 'fr' && /\((?:ca|can)\)|canad|qu[eé]b|fr-?ca/i.test(lang)) vfq = true; }
      if (section === 'text') subs.add(code);
    }
    if (section === 'audio' && /^\s*Title\s*:/i.test(line) && /\bvfq\b|\bvq\b|qu[eé]b|canad/i.test(line)) vfq = true;
    if (/^\s*(release|nom|name|titre|langue|language|audio)\b.*[:.]/i.test(line) && /\bvfq\b|\bvf2\b|qu[eé]b/i.test(line)) vfq = true;
  }
  if (vfq) return { language: 'VFQ', vfq: true };
  if (audio.size > 1 && audio.has('fr')) return { language: 'MULTI', vfq: false };
  if (audio.size === 1 && audio.has('fr')) return { language: 'VF', vfq: false };
  if (audio.size >= 1 && subs.has('fr')) return { language: 'VOSTFR', vfq: false };
  if (audio.size === 1) return { language: 'VO', vfq: false };
  return { vfq: false };
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

  if (has('atmos')) out.audio = 'Atmos';
  else if (has('truehd')) out.audio = 'TrueHD';
  else if (has('dts', 'dts-hd', 'dts-hdma', 'dtshd')) out.audio = 'DTS';
  else if (has('flac')) out.audio = 'FLAC';
  else if (has('aac')) out.audio = 'AAC';
  else if (has('mp3')) out.audio = 'MP3';

  const container = nfo.match(/^\s*Format\s*:\s*(Matroska|MPEG-4|AVI)/im)?.[1];
  if (container) out.containerFormat = /matroska/i.test(container) ? 'MKV' : /mpeg-4/i.test(container) ? 'MP4' : 'AVI';
  else if (has('mkv')) out.containerFormat = 'MKV';

  // Langue : le VFQ trouvé dans le nom OU dans le MediaInfo l'emporte ; sinon la mention du nom, sinon ce que montrent les pistes du MediaInfo.
  const fromName = languageFromName(tokens);
  const fromNfo = languageFromNfo(nfo);
  out.language = fromName.vfq || fromNfo.vfq ? 'VFQ' : (fromName.language ?? fromNfo.language);

  Object.assign(out, episodeOf(name));
  return out;
}
