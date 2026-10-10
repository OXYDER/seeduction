/**
 * Torznab : l'interface que Prowlarr, Jackett, Sonarr, Radarr, Lidarr et Readarr utilisent pour chercher et surveiller les nouveautés d'un tracker.
 * C'est du RSS 2.0 enrichi (attributs « torznab: »), donc le même flux sert aussi de flux RSS pour un client torrent (qBittorrent, ruTorrent...).
 * Ce fichier ne contient que de la logique pure (catégories, lecture de la requête, XML) : testable sans base de données.
 */

// ------------------------------------------------------------------ catégories standard (Newznab / Torznab)

export const TORZNAB_TREE: { id: number; name: string; subs: { id: number; name: string }[] }[] = [
  { id: 1000, name: 'Console', subs: [{ id: 1010, name: 'Console/NDS' }, { id: 1020, name: 'Console/PSP' }, { id: 1030, name: 'Console/Wii' }, { id: 1040, name: 'Console/Xbox' }, { id: 1050, name: 'Console/Xbox 360' }, { id: 1080, name: 'Console/PS3' }, { id: 1090, name: 'Console/Other' }] },
  { id: 2000, name: 'Movies', subs: [{ id: 2010, name: 'Movies/Foreign' }, { id: 2020, name: 'Movies/Other' }, { id: 2030, name: 'Movies/SD' }, { id: 2040, name: 'Movies/HD' }, { id: 2045, name: 'Movies/UHD' }, { id: 2050, name: 'Movies/BluRay' }, { id: 2060, name: 'Movies/3D' }, { id: 2070, name: 'Movies/DVD' }, { id: 2080, name: 'Movies/WEB-DL' }] },
  { id: 3000, name: 'Audio', subs: [{ id: 3010, name: 'Audio/MP3' }, { id: 3020, name: 'Audio/Video' }, { id: 3030, name: 'Audio/Audiobook' }, { id: 3040, name: 'Audio/Lossless' }, { id: 3050, name: 'Audio/Other' }] },
  { id: 4000, name: 'PC', subs: [{ id: 4010, name: 'PC/0day' }, { id: 4020, name: 'PC/ISO' }, { id: 4030, name: 'PC/Mac' }, { id: 4040, name: 'PC/Mobile-Other' }, { id: 4050, name: 'PC/Games' }, { id: 4060, name: 'PC/Mobile-iOS' }, { id: 4070, name: 'PC/Mobile-Android' }] },
  { id: 5000, name: 'TV', subs: [{ id: 5010, name: 'TV/WEB-DL' }, { id: 5020, name: 'TV/Foreign' }, { id: 5030, name: 'TV/SD' }, { id: 5040, name: 'TV/HD' }, { id: 5045, name: 'TV/UHD' }, { id: 5050, name: 'TV/Other' }, { id: 5060, name: 'TV/Sport' }, { id: 5070, name: 'TV/Anime' }, { id: 5080, name: 'TV/Documentary' }] },
  { id: 6000, name: 'XXX', subs: [{ id: 6010, name: 'XXX/DVD' }, { id: 6020, name: 'XXX/WMV' }, { id: 6030, name: 'XXX/XviD' }, { id: 6040, name: 'XXX/x264' }, { id: 6045, name: 'XXX/UHD' }, { id: 6050, name: 'XXX/Pack' }, { id: 6060, name: 'XXX/ImageSet' }, { id: 6070, name: 'XXX/Other' }, { id: 6080, name: 'XXX/SD' }, { id: 6090, name: 'XXX/WEB-DL' }] },
  { id: 7000, name: 'Books', subs: [{ id: 7010, name: 'Books/Mags' }, { id: 7020, name: 'Books/EBook' }, { id: 7030, name: 'Books/Comics' }, { id: 7040, name: 'Books/Technical' }, { id: 7050, name: 'Books/Other' }, { id: 7060, name: 'Books/Foreign' }] },
  { id: 8000, name: 'Other', subs: [{ id: 8010, name: 'Other/Misc' }, { id: 8020, name: 'Other/Hashed' }] },
];

const flat = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface CategoryInfo {
  /** Noms de la catégorie du torrent, du parent vers la sous-catégorie (« Films & Vidéos », « Films »). */
  path: string[];
  resolution?: string | null;
  season?: string | null;
  episode?: string | null;
  audio?: string | null;
  source?: string | null;
  containerFormat?: string | null;
}

/** Catégorie principale Torznab (1000, 2000, 3000...) d'une catégorie Seeduction : d'après son nom et celui de ses parents. */
export function torznabTopOf(path: string[], hasSeason = false): number {
  const all = flat(path.join(' / '));
  if (/\bxxx\b|adult|porn|hentai/.test(all)) return 6000;
  if (/serie|emission|\btv\b|televis|anime/.test(all) || hasSeason) return 5000;
  if (/film|movie|cinema|animation|documentaire|concert|spectacle/.test(all)) return 2000;
  if (/musique|audio|album|music|discograph|vinyle|\bflac\b|\bmp3\b/.test(all)) return 3000;
  if (/livre|ebook|e-book|\bbd\b|bande|comic|manga|magazine|journal|revue|\bpdf\b/.test(all)) return 7000;
  if (/console|emulation|switch|playstation|\bps[2345]\b|xbox|nintendo|wii/.test(all) && !/pc/.test(all)) return 1000;
  if (/jeu|game|logiciel|application|software|nulled|\bgps\b|imprimante|windows|macos|linux|android|\bios\b/.test(all)) return 4000;
  return 8000;
}

function resolutionClass(res?: string | null): 'SD' | 'HD' | 'UHD' | null {
  const r = flat(res ?? '');
  if (!r) return null;
  if (/2160|4k|uhd/.test(r)) return 'UHD';
  if (/1080|720|1440/.test(r)) return 'HD';
  return 'SD';
}

/** Catégories Torznab d'un torrent : la sous-catégorie précise d'abord, puis la catégorie principale (ex. [5040, 5000]). */
export function torznabCategoriesFor(info: CategoryInfo): number[] {
  const hasSeason = !!(info.season && String(info.season).trim());
  const top = torznabTopOf(info.path, hasSeason);
  const all = flat(info.path.join(' / '));
  const cls = resolutionClass(info.resolution);
  let sub: number | null = null;
  if (top === 2000) sub = cls === 'UHD' ? 2045 : cls === 'HD' ? 2040 : cls === 'SD' ? 2030 : 2000;
  else if (top === 5000) {
    if (/anime|animation|manga/.test(all)) sub = 5070;
    else if (/documentaire|documentary/.test(all)) sub = 5080;
    else if (/sport/.test(all)) sub = 5060;
    else sub = cls === 'UHD' ? 5045 : cls === 'HD' ? 5040 : cls === 'SD' ? 5030 : 5000;
  } else if (top === 3000) {
    const a = flat(`${info.audio ?? ''} ${info.containerFormat ?? ''}`);
    sub = /flac|alac|lossless|wav|ape|dsd/.test(a) ? 3040 : /mp3|aac|ogg|opus/.test(a) ? 3010 : /audiolivre|audiobook/.test(all) ? 3030 : 3050;
  } else if (top === 7000) {
    sub = /comic|\bbd\b|bande|manga/.test(all) ? 7030 : /magazine|revue|journal/.test(all) ? 7010 : /ebook|e-book|livre|epub/.test(all) ? 7020 : 7050;
  } else if (top === 4000) {
    sub = /jeu|game/.test(all) ? 4050 : /mac/.test(all) ? 4030 : /android/.test(all) ? 4070 : /\bios\b/.test(all) ? 4060 : /iso/.test(all) ? 4020 : 4000;
  } else if (top === 6000) {
    sub = cls === 'UHD' ? 6045 : /pack/.test(all) ? 6050 : cls === 'SD' ? 6080 : 6040;
  }
  return sub && sub !== top ? [sub, top] : [top];
}

/** Catégories principales demandées (« 5000,5040,2000 » -> [5000, 2000]). */
export function requestedTops(cat: string | undefined): number[] {
  const ids = String(cat ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1000 && n < 9000);
  return [...new Set(ids.map((n) => Math.floor(n / 1000) * 1000))];
}

// ------------------------------------------------------------------ lecture de la requête

export type TorznabFunction = 'caps' | 'search' | 'tvsearch' | 'movie' | 'music' | 'book';

export interface TorznabQuery {
  t: TorznabFunction | string;
  q: string;
  tokens: string[];
  cat?: string;
  tops: number[];
  season?: number;
  ep?: number;
  year?: number;
  tmdbid?: string;
  limit: number;
  offset: number;
  // Filtres propres à Seeduction (utiles pour un flux RSS précis)
  language?: string; resolution?: string; source?: string; codec?: string; audio?: string; freeleech?: boolean; minseeders?: number; sort?: 'date' | 'seeders' | 'size';
}

export const TORZNAB_MAX_LIMIT = 100;
export const TORZNAB_DEFAULT_LIMIT = 50;

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : Array.isArray(v) && typeof v[0] === 'string' ? v[0].trim().slice(0, max) : '');
const int = (v: unknown) => { const s = str(v, 10); if (!/^\d+$/.test(s)) return undefined; const n = Number(s); return Number.isInteger(n) ? n : undefined; };

/** Mots de la recherche : ni ponctuation ni accents, au moins 2 caractères (« Show Name » -> show, name). */
export function searchTokens(q: string): string[] {
  return flat(q).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 2).slice(0, 8);
}

export function parseTorznabQuery(raw: Record<string, unknown>): TorznabQuery {
  const t = str(raw.t, 20).toLowerCase() || 'search';
  // music : « artist » + « album » ; book : « author » + « title » : ils s'ajoutent au texte cherché.
  const parts = [str(raw.q), str(raw.artist), str(raw.album), str(raw.author), str(raw.title)].filter(Boolean);
  const q = parts.join(' ');
  const limit = Math.min(TORZNAB_MAX_LIMIT, Math.max(1, int(raw.limit) ?? TORZNAB_DEFAULT_LIMIT));
  const sortRaw = str(raw.sort, 10).toLowerCase();
  return {
    t, q, tokens: searchTokens(q), cat: str(raw.cat, 200) || undefined, tops: requestedTops(str(raw.cat, 200)),
    season: int(raw.season), ep: int(raw.ep), year: int(raw.year), tmdbid: /^\d{1,10}$/.test(str(raw.tmdbid, 12)) ? str(raw.tmdbid, 12) : undefined,
    limit, offset: int(raw.offset) ?? 0,
    language: str(raw.language, 30) || undefined, resolution: str(raw.resolution, 20) || undefined, source: str(raw.source, 30) || undefined,
    codec: str(raw.codec, 30) || undefined, audio: str(raw.audio, 30) || undefined,
    freeleech: ['1', 'true', 'yes', 'oui'].includes(str(raw.freeleech, 6).toLowerCase()), minseeders: int(raw.minseeders),
    sort: sortRaw === 'seeders' || sortRaw === 'size' ? (sortRaw as 'seeders' | 'size') : 'date',
  };
}

// ------------------------------------------------------------------ XML

export const xmlEscape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function errorXml(code: number, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<error code="${code}" description="${xmlEscape(description)}"/>`;
}

/** Capacités du site : fonctions de recherche prises en charge et catégories. Ne demande pas de clé. */
export function capsXml(site: string): string {
  const cats = TORZNAB_TREE.map((c) => `    <category id="${c.id}" name="${xmlEscape(c.name)}">\n${c.subs.map((s) => `      <subcat id="${s.id}" name="${xmlEscape(s.name)}"/>`).join('\n')}\n    </category>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server version="1.0" title="Seeduction" strapline="Tracker privé" email="" url="${xmlEscape(site)}" image="${xmlEscape(site)}/favicon.ico"/>
  <limits max="${TORZNAB_MAX_LIMIT}" default="${TORZNAB_DEFAULT_LIMIT}"/>
  <registration available="no" open="no"/>
  <searching>
    <search available="yes" supportedParams="q"/>
    <tv-search available="yes" supportedParams="q,season,ep,tmdbid"/>
    <movie-search available="yes" supportedParams="q,year,tmdbid"/>
    <music-search available="yes" supportedParams="q,album,artist,year"/>
    <book-search available="yes" supportedParams="q,title,author"/>
  </searching>
  <categories>
${cats}
  </categories>
</caps>`;
}

export interface FeedItem {
  id: string; name: string; createdAt: Date; size: number; seeders: number; leechers: number; completed: number; infoHash: string;
  categories: number[]; downloadUrl: string; detailUrl: string; coverUrl?: string | null; tmdbId?: string | null;
  freeleech: boolean; doubleUpload: boolean; description?: string;
}

export function feedXml(site: string, items: FeedItem[], opts: { total: number; offset: number; minSeedSeconds: number; minRatio: number }): string {
  const rows = items.map((i) => {
    const attrs: [string, string | number][] = [
      ...i.categories.map((c) => ['category', c] as [string, number]),
      ['size', i.size], ['seeders', i.seeders], ['peers', i.seeders + i.leechers], ['grabs', i.completed], ['infohash', i.infoHash],
      ['downloadvolumefactor', i.freeleech ? 0 : 1], ['uploadvolumefactor', i.doubleUpload ? 2 : 1],
      ['minimumratio', opts.minRatio], ['minimumseedtime', opts.minSeedSeconds],
      ...(i.tmdbId ? [['tmdbid', i.tmdbId] as [string, string]] : []),
      ...(i.coverUrl ? [['coverurl', i.coverUrl] as [string, string]] : []),
    ];
    return `    <item>
      <title>${xmlEscape(i.name)}</title>
      <guid isPermaLink="true">${xmlEscape(i.detailUrl)}</guid>
      <link>${xmlEscape(i.downloadUrl)}</link>
      <comments>${xmlEscape(i.detailUrl)}</comments>
      <pubDate>${i.createdAt.toUTCString()}</pubDate>
      <size>${i.size}</size>
      <description>${xmlEscape(i.description ?? '')}</description>
      <enclosure url="${xmlEscape(i.downloadUrl)}" length="${i.size}" type="application/x-bittorrent"/>
${attrs.map(([n, v]) => `      <torznab:attr name="${n}" value="${xmlEscape(v)}"/>`).join('\n')}
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <atom:link rel="self" type="application/rss+xml"/>
    <title>Seeduction</title>
    <description>Seeduction — flux de torrents</description>
    <link>${xmlEscape(site)}</link>
    <language>fr-fr</language>
    <torznab:response offset="${opts.offset}" total="${opts.total}"/>
${rows}
  </channel>
</rss>`;
}
