/**
 * Fournisseurs de fiches supplémentaires, en arrière-plan : le membre ne voit jamais d'où vient une fiche, il a simplement plus de chances d'en trouver une. Tous sont
 * gratuits et sans clé : TVmaze (séries), Jikan / MyAnimeList (animés), Steam (jeux), iTunes et MusicBrainz (musique), iTunes, Flathub et Wikipédia (applications et
 * logiciels ; Wikipédia aussi en dernier recours pour les jeux et les livres). Leurs identifiants sont préfixés (« tvm: », « mal: », « steam: »...) : un identifiant
 * sans préfixe reste celui du fournisseur principal du type de contenu (TMDB, Deezer, Google Books, RAWG, ThePornDB), donc les fiches déjà enregistrées ne changent pas.
 */
export type ExtraKind = 'FILM' | 'SERIE' | 'MUSIQUE' | 'LIVRE' | 'JEU' | 'LOGICIEL';
export interface ExtraSearchResult { id: string; title: string; subtitle: string; thumbnail: string | null }
/** Même forme que la fiche riche du fournisseur principal (voir MetadataService). */
export interface ExtraRich {
  source: string;
  variables: Record<string, string>;
  info: Record<string, any>;
  entities: { type: 'PERSON' | 'COMPANY' | 'GENRE' | 'PLATFORM'; role: string; name: string; source: string; externalId: string; imageUrl?: string | null; detail?: string; position: number }[];
  coverUrl: string | null;
  backdropUrl: string | null;
  /** Autres images de la fiche (captures d'écran, fonds, jaquette arrière...) : une galerie sur la page du torrent. */
  gallery?: string[];
  overviewOk?: boolean;
}
export type FetchJson = (url: string, name: string, headers?: Record<string, string>, body?: unknown) => Promise<any>;

export const EXTRA_PREFIXES = ['tvm:', 'mal:', 'itu:', 'mb:', 'steam:', 'flat:', 'wp:'] as const;
export const isExtraId = (id: string): boolean => EXTRA_PREFIXES.some((p) => id.startsWith(p));

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();
export const stripHtml = (html: unknown): string => String(html ?? '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n\n').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const yearOf = (d: unknown): string => (/^\d{4}/.test(String(d ?? '')) ? String(d).slice(0, 4) : '');
const genreDrafts = (names: string[], source: string): ExtraRich['entities'] => names.filter(Boolean).slice(0, 8).map((name, position) => ({ type: 'GENRE', role: 'GENRE', name, source: 'seeduction', externalId: clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || source, position }));
/** Galerie : adresses d'images valides, sans doublon, au plus `max` (http est remonté en https). */
export const gal = (urls: unknown[], max = 10): string[] => [...new Set(urls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).map((u) => u.replace(/^http:\/\//, 'https://')))].slice(0, max);
const UA = { 'User-Agent': 'Seeduction/1.0 (fiches de torrents)', Accept: 'application/json' };

// ── TVmaze (séries) ───────────────────────────────────────────────────────────

export function mapTvmazeSearch(rows: any[]): ExtraSearchResult[] {
  return (Array.isArray(rows) ? rows : []).slice(0, 10).map((r) => r?.show).filter((s) => s?.id && s?.name).map((s) => ({
    id: `tvm:${s.id}`, title: clean(s.name), subtitle: [yearOf(s.premiered), clean(s.network?.name ?? s.webChannel?.name), (s.genres ?? []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
    thumbnail: s.image?.medium ?? null,
  }));
}

export function mapTvmazeShow(s: any): ExtraRich {
  const cast: any[] = (s._embedded?.cast ?? []).slice(0, 8);
  const genres: string[] = (s.genres ?? []).filter(Boolean);
  const network = clean(s.network?.name ?? s.webChannel?.name);
  return {
    source: 'tvmaze',
    variables: {
      titre: clean(s.name), titre_original: '', année: yearOf(s.premiered), description: stripHtml(s.summary), genre: genres.join(', '),
      durée: s.averageRuntime || s.runtime ? `${s.averageRuntime || s.runtime} min` : '', note: s.rating?.average ? `${String(s.rating.average).replace('.', ',')} / 10` : '',
      réalisateur: '', acteurs: cast.map((c) => clean(c.person?.name)).filter(Boolean).join(', '), studio: network,
    },
    info: { kind: 'tv', releaseDate: s.premiered ?? null, status: s.status ?? null, rating: s.rating?.average ?? null, languages: s.language ? [s.language] : [], imdbId: s.externals?.imdb ?? null, tvmazeId: s.id },
    entities: [
      ...cast.map((c, i): ExtraRich['entities'][number] => ({ type: 'PERSON', role: 'ACTOR', name: clean(c.person?.name), source: 'tvmaze', externalId: String(c.person?.id ?? ''), imageUrl: c.person?.image?.medium ?? null, detail: clean(c.character?.name), position: i })).filter((e) => e.name && e.externalId),
      ...genreDrafts(genres, 'tvmaze'),
    ],
    coverUrl: s.image?.original ?? s.image?.medium ?? null, backdropUrl: null,
  };
}

// ── Jikan / MyAnimeList (animés) ───────────────────────────────────────────────

export function mapJikanSearch(res: any, kind: 'FILM' | 'SERIE'): ExtraSearchResult[] {
  return (res?.data ?? []).filter((a: any) => a?.mal_id && (a.title || a.title_english)).filter((a: any) => (a.type === 'Movie') === (kind === 'FILM')).slice(0, 10).map((a: any) => ({
    id: `mal:${a.mal_id}`, title: clean(a.title_english || a.title), subtitle: [yearOf(a.aired?.from), clean(a.type), a.title && a.title_english && a.title !== a.title_english ? clean(a.title) : ''].filter(Boolean).join(' · '),
    thumbnail: a.images?.jpg?.image_url ?? null,
  }));
}

export function mapJikanAnime(res: any): ExtraRich {
  const a = res?.data ?? {};
  const genres: string[] = [...(a.genres ?? []), ...(a.themes ?? [])].map((g: any) => clean(g.name)).filter(Boolean);
  const studios: string[] = (a.studios ?? []).map((s: any) => clean(s.name)).filter(Boolean);
  const dur = /(\d+)\s*min/i.exec(String(a.duration ?? ''));
  return {
    source: 'jikan',
    variables: {
      titre: clean(a.title_english || a.title), titre_original: a.title && a.title_english && a.title !== a.title_english ? clean(a.title) : '', année: yearOf(a.aired?.from) || (a.year ? String(a.year) : ''),
      description: clean(String(a.synopsis ?? '').replace(/\[Written by MAL Rewrite\]/gi, '')), genre: genres.join(', '), durée: dur ? `${dur[1]} min` : '',
      note: a.score ? `${String(a.score).replace('.', ',')} / 10` : '', réalisateur: '', acteurs: '', studio: studios.join(', '),
    },
    info: { kind: a.type === 'Movie' ? 'movie' : 'tv', releaseDate: a.aired?.from ? String(a.aired.from).slice(0, 10) : null, status: a.status ?? null, rating: a.score ?? null, episodes: a.episodes ?? null, malId: a.mal_id },
    entities: [
      ...(a.studios ?? []).slice(0, 3).map((s: any, i: number): ExtraRich['entities'][number] => ({ type: 'COMPANY', role: 'STUDIO', name: clean(s.name), source: 'jikan', externalId: String(s.mal_id), position: i })),
      ...genreDrafts(genres, 'jikan'),
    ],
    coverUrl: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null, backdropUrl: null,
  };
}

// ── Steam (jeux) ──────────────────────────────────────────────────────────────

export function mapSteamSearch(res: any): ExtraSearchResult[] {
  return (res?.items ?? []).filter((i: any) => i?.id && i?.name && (!i.type || i.type === 'app')).slice(0, 10).map((i: any) => ({
    id: `steam:${i.id}`, title: clean(i.name), subtitle: [i.price?.final ? `${(i.price.final / 100).toFixed(2).replace('.', ',')} $` : i.price ? '' : 'Gratuit', (i.platforms?.windows ? 'Windows' : '')].filter(Boolean).join(' · '),
    thumbnail: i.tiny_image ?? null,
  }));
}

export function mapSteamApp(res: any, id: string): ExtraRich {
  const d = res?.[id]?.data ?? {};
  const genres: string[] = (d.genres ?? []).map((g: any) => clean(g.description)).filter(Boolean);
  const platforms = ['windows', 'mac', 'linux'].filter((p) => d.platforms?.[p]).map((p) => ({ windows: 'Windows', mac: 'macOS', linux: 'Linux' }[p] as string));
  return {
    source: 'steam',
    variables: {
      titre: clean(d.name), année: yearOf(d.release_date?.date) || (/\b(\d{4})\b/.exec(String(d.release_date?.date ?? ''))?.[1] ?? ''), genre: genres.join(', '),
      développeur: (d.developers ?? []).map(clean).join(', '), éditeur: (d.publishers ?? []).map(clean).join(', '), plateformes: platforms.join(', '),
      note: d.metacritic?.score ? `${d.metacritic.score} / 100 (Metacritic)` : '', description: stripHtml(d.short_description || d.about_the_game),
    },
    info: { released: d.release_date?.date ?? null, metacritic: d.metacritic?.score ?? null, website: d.website || null, steamId: Number(id) || null },
    entities: [
      ...(d.developers ?? []).slice(0, 3).map((n: string, i: number): ExtraRich['entities'][number] => ({ type: 'COMPANY', role: 'DEVELOPER', name: clean(n), source: 'seeduction', externalId: clean(n).toLowerCase().replace(/[^a-z0-9]+/g, '-'), position: i })),
      ...(d.publishers ?? []).slice(0, 3).map((n: string, i: number): ExtraRich['entities'][number] => ({ type: 'COMPANY', role: 'PUBLISHER', name: clean(n), source: 'seeduction', externalId: clean(n).toLowerCase().replace(/[^a-z0-9]+/g, '-'), position: i })),
      ...genreDrafts(genres, 'steam'),
      ...platforms.map((name, i): ExtraRich['entities'][number] => ({ type: 'PLATFORM', role: 'PLATFORM', name, source: 'seeduction', externalId: name.toLowerCase(), position: i })),
    ].filter((e) => e.name && e.externalId),
    coverUrl: d.header_image ?? null, backdropUrl: d.background_raw ?? d.background ?? null,
    gallery: gal((d.screenshots ?? []).map((x: any) => x?.path_full ?? x?.path_thumbnail)),
  };
}

// ── iTunes (musique et logiciels) ──────────────────────────────────────────────

export function mapItunesAlbums(res: any): ExtraSearchResult[] {
  return (res?.results ?? []).filter((a: any) => a?.collectionId && a?.collectionName).slice(0, 10).map((a: any) => ({
    id: `itu:${a.collectionId}`, title: clean(a.collectionName), subtitle: [clean(a.artistName), yearOf(a.releaseDate)].filter(Boolean).join(' · '), thumbnail: a.artworkUrl100 ?? null,
  }));
}

export function mapItunesAlbum(res: any): ExtraRich {
  const rows: any[] = res?.results ?? [];
  const a = rows.find((r) => r.wrapperType === 'collection') ?? rows[0] ?? {};
  const tracks = rows.filter((r) => r.wrapperType === 'track').sort((x, y) => (x.trackNumber ?? 0) - (y.trackNumber ?? 0));
  const total = tracks.reduce((s, t) => s + (t.trackTimeMillis ?? 0), 0);
  return {
    source: 'itunes',
    variables: {
      titre: clean(a.collectionName), artiste: clean(a.artistName), année: yearOf(a.releaseDate), genre: clean(a.primaryGenreName), label: clean(String(a.copyright ?? '').replace(/^[℗©]\s*\d{4}\s*/, '')),
      durée: total ? `${Math.round(total / 60000)} min` : '', fichiers: tracks.map((t) => clean(t.trackName)).filter(Boolean).join(', '), description: '',
    },
    info: { releaseDate: a.releaseDate ? String(a.releaseDate).slice(0, 10) : null, nbTracks: a.trackCount ?? tracks.length, itunesId: a.collectionId ?? null, tracks: tracks.slice(0, 80).map((t) => ({ title: clean(t.trackName), duration: Math.round((t.trackTimeMillis ?? 0) / 1000) })) },
    entities: genreDrafts([clean(a.primaryGenreName)], 'itunes'),
    coverUrl: a.artworkUrl100 ? String(a.artworkUrl100).replace(/\/\d+x\d+bb\./, '/1000x1000bb.') : null, backdropUrl: null,
  };
}

export function mapItunesSoftware(res: any): ExtraSearchResult[] {
  return (res?.results ?? []).filter((a: any) => a?.trackId && a?.trackName).slice(0, 10).map((a: any) => ({
    id: `itu:${a.trackId}`, title: clean(a.trackName), subtitle: [clean(a.sellerName ?? a.artistName), clean(a.primaryGenreName)].filter(Boolean).join(' · '), thumbnail: a.artworkUrl100 ?? null,
  }));
}

export function mapItunesApp(res: any): ExtraRich {
  const a = (res?.results ?? [])[0] ?? {};
  const genres: string[] = (a.genres ?? []).map(clean).filter(Boolean);
  const platforms = unique([...(a.supportedDevices ?? []).some((d: string) => /iPhone|iPad|iPod/i.test(d)) ? ['iOS'] : [], ...(String(a.kind ?? '').includes('mac') ? ['macOS'] : [])]);
  return {
    source: 'itunes',
    variables: { titre: clean(a.trackName), année: yearOf(a.releaseDate), genre: genres.join(', '), développeur: clean(a.sellerName ?? a.artistName), éditeur: clean(a.sellerName ?? a.artistName), plateformes: platforms.join(', '), note: a.averageUserRating ? `${String(Math.round(a.averageUserRating * 10) / 10).replace('.', ',')} / 5` : '', description: clean(String(a.description ?? '').slice(0, 1500)) },
    info: { released: a.releaseDate ? String(a.releaseDate).slice(0, 10) : null, version: a.version ?? null, website: a.sellerUrl ?? null, itunesId: a.trackId ?? null },
    entities: [...genreDrafts(genres, 'itunes'), ...platforms.map((name, i): ExtraRich['entities'][number] => ({ type: 'PLATFORM', role: 'PLATFORM', name, source: 'seeduction', externalId: name.toLowerCase(), position: i }))],
    coverUrl: a.artworkUrl512 ?? a.artworkUrl100 ?? null, backdropUrl: null,
    gallery: gal([...(a.screenshotUrls ?? []), ...(a.ipadScreenshotUrls ?? [])]),
  };
}

const unique = <T,>(a: T[]): T[] => [...new Set(a)];

// ── MusicBrainz (musique) ─────────────────────────────────────────────────────

export function mapMusicbrainzSearch(res: any): ExtraSearchResult[] {
  return (res?.['release-groups'] ?? []).filter((g: any) => g?.id && g?.title && (!g['primary-type'] || ['Album', 'EP', 'Single'].includes(g['primary-type']))).slice(0, 10).map((g: any) => ({
    id: `mb:${g.id}`, title: clean(g.title), subtitle: [clean((g['artist-credit'] ?? []).map((c: any) => c.name).join(', ')), yearOf(g['first-release-date']), clean(g['primary-type'])].filter(Boolean).join(' · '),
    thumbnail: `https://coverartarchive.org/release-group/${g.id}/front-250`,
  }));
}

export function mapMusicbrainzGroup(g: any): ExtraRich {
  const artists = (g['artist-credit'] ?? []).map((c: any) => clean(c.name)).filter(Boolean);
  const tags: string[] = (g.tags ?? []).sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 4).map((t: any) => clean(t.name));
  return {
    source: 'musicbrainz',
    variables: { titre: clean(g.title), artiste: artists.join(', '), année: yearOf(g['first-release-date']), genre: tags.join(', '), label: '', durée: '', fichiers: '', description: clean(g.disambiguation) },
    info: { releaseDate: g['first-release-date'] ?? null, recordType: g['primary-type'] ?? null, musicbrainzId: g.id },
    entities: [
      ...(g['artist-credit'] ?? []).slice(0, 3).map((c: any, i: number): ExtraRich['entities'][number] => ({ type: 'PERSON', role: 'ARTIST', name: clean(c.name), source: 'musicbrainz', externalId: String(c.artist?.id ?? ''), position: i })).filter((e: any) => e.name && e.externalId),
      ...genreDrafts(tags, 'musicbrainz'),
    ],
    coverUrl: `https://coverartarchive.org/release-group/${g.id}/front-500`, backdropUrl: null,
  };
}

// ── Flathub (applications Linux) ──────────────────────────────────────────────

export function mapFlathubSearch(res: any): ExtraSearchResult[] {
  return (res?.hits ?? []).filter((h: any) => h?.app_id && h?.name).slice(0, 10).map((h: any) => ({
    id: `flat:${h.app_id}`, title: clean(h.name), subtitle: clean(h.summary), thumbnail: h.icon ?? null,
  }));
}

export function mapFlathubApp(a: any, id: string): ExtraRich {
  const cats: string[] = (a.categories ?? []).map((c: any) => clean(typeof c === 'string' ? c : c?.name)).filter(Boolean);
  return {
    source: 'flathub',
    variables: { titre: clean(a.name), année: '', genre: cats.join(', '), développeur: clean(a.developer_name ?? a.project_group), éditeur: clean(a.developer_name), plateformes: 'Linux', note: '', description: stripHtml(a.description || a.summary) },
    info: { website: a.urls?.homepage ?? null, license: a.project_license ?? null, flathubId: id },
    entities: [...genreDrafts(cats, 'flathub'), { type: 'PLATFORM', role: 'PLATFORM', name: 'Linux', source: 'seeduction', externalId: 'linux', position: 0 }],
    coverUrl: a.icon ?? null, backdropUrl: a.screenshots?.[0]?.sizes?.[0]?.src ?? null,
    gallery: gal((a.screenshots ?? []).map((sh: any) => [...(sh?.sizes ?? [])].sort((x: any, y: any) => Number(y?.width ?? 0) - Number(x?.width ?? 0))[0]?.src)),
  };
}

// ── Wikipédia (applications, logiciels ; dernier recours pour jeux et livres) ──────

/** `only` : ne garde que les articles dont la description correspond (un jeu, un livre) : une recherche plein texte ramène sinon des pages sans rapport. */
export function mapWikipediaSearch(res: any, lang: string, only?: RegExp): ExtraSearchResult[] {
  return (res?.pages ?? []).filter((p: any) => p?.key && p?.title && (!only || only.test(String(p.description ?? '')))).slice(0, 8).map((p: any) => ({
    id: `wp:${lang}:${p.key}`, title: clean(p.title), subtitle: clean(p.description), thumbnail: p.thumbnail?.url ? (String(p.thumbnail.url).startsWith('//') ? `https:${p.thumbnail.url}` : String(p.thumbnail.url)) : null,
  }));
}

export function mapWikipediaSummary(s: any, kind: ExtraKind): ExtraRich {
  const description = clean(s.extract);
  const year = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(String(s.description ?? '') + ' ' + description.slice(0, 200))?.[1] ?? '';
  const common = { titre: clean(s.title), année: year, genre: clean(s.description), description };
  const variables: Record<string, string> =
    kind === 'JEU' ? { ...common, développeur: '', éditeur: '', plateformes: '', note: '' }
    : kind === 'LIVRE' ? { ...common, auteur: '', éditeur: '', pages: '' }
    : { ...common, développeur: '', éditeur: '', plateformes: '', note: '' };
  return {
    source: 'wikipedia', variables, info: { website: s.content_urls?.desktop?.page ?? null },
    entities: genreDrafts(s.description ? [clean(s.description)] : [], 'wikipedia'),
    coverUrl: s.originalimage?.source ?? s.thumbnail?.source ?? null, backdropUrl: null, overviewOk: /^fr/.test(String(s.lang ?? '')),
  };
}

// ── Galeries : images supplémentaires d'une fiche (une requête de plus par fournisseur) ──────

/** TVmaze : fonds, bannières, puis affiches secondaires. */
export function mapTvmazeImages(rows: any): string[] {
  const list: any[] = Array.isArray(rows) ? rows : [];
  const pick = (type: string, skipMain = false) => list.filter((r) => r?.type === type && !(skipMain && r.main)).map((r) => r?.resolutions?.original?.url ?? r?.resolutions?.medium?.url);
  return gal([...pick('background'), ...pick('banner'), ...pick('poster', true)]);
}

/** Jikan : les images de l'animé (la première est déjà la pochette). */
export function mapJikanPictures(res: any): string[] {
  return gal((res?.data ?? []).slice(1).map((p: any) => p?.jpg?.large_image_url ?? p?.jpg?.image_url));
}

/** Cover Art Archive : jaquette arrière, livret, disque... (la face avant est déjà la pochette). */
export function mapCoverArtImages(res: any): string[] {
  return gal((res?.images ?? []).filter((i: any) => !i?.front).map((i: any) => i?.thumbnails?.['1200'] ?? i?.thumbnails?.large ?? i?.image));
}

// ── Orchestration ──────────────────────────────────────────────────────────────

/** Les recherches de tous les fournisseurs supplémentaires du type de contenu, en parallèle ; un fournisseur en panne est simplement ignoré. */
export async function searchExtra(kind: string, query: string, fetchJson: FetchJson): Promise<ExtraSearchResult[]> {
  const q = encodeURIComponent(query.trim());
  const jobs: Promise<ExtraSearchResult[]>[] = [];
  const job = (fn: () => Promise<ExtraSearchResult[]>) => jobs.push(fn());
  switch (kind) {
    case 'SERIE':
      job(async () => mapTvmazeSearch(await fetchJson(`https://api.tvmaze.com/search/shows?q=${q}`, 'TVmaze')));
      job(async () => mapJikanSearch(await fetchJson(`https://api.jikan.moe/v4/anime?q=${q}&limit=10&sfw=false`, 'Jikan'), 'SERIE'));
      break;
    case 'FILM':
      job(async () => mapJikanSearch(await fetchJson(`https://api.jikan.moe/v4/anime?q=${q}&limit=10&type=movie&sfw=false`, 'Jikan'), 'FILM'));
      break;
    case 'JEU':
      job(async () => mapSteamSearch(await fetchJson(`https://store.steampowered.com/api/storesearch/?term=${q}&l=french&cc=CA`, 'Steam')));
      job(async () => mapWikipediaSearch(await fetchJson(`https://fr.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=8`, 'Wikipédia', UA), 'fr', /jeu vid|video game|jeu de|jeu d'/i));
      break;
    case 'MUSIQUE':
      job(async () => mapItunesAlbums(await fetchJson(`https://itunes.apple.com/search?term=${q}&entity=album&limit=10&country=CA`, 'iTunes')));
      job(async () => mapMusicbrainzSearch(await fetchJson(`https://musicbrainz.org/ws/2/release-group/?query=${q}&limit=8&fmt=json`, 'MusicBrainz', UA)));
      break;
    case 'LIVRE':
      job(async () => mapWikipediaSearch(await fetchJson(`https://fr.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=8`, 'Wikipédia', UA), 'fr', /roman|livre|nouvelle|essai|bande dessin|manga|album|conte|novel|book/i));
      break;
    case 'LOGICIEL':
      job(async () => mapItunesSoftware(await fetchJson(`https://itunes.apple.com/search?term=${q}&entity=software&limit=8&country=CA`, 'iTunes')));
      job(async () => mapItunesSoftware(await fetchJson(`https://itunes.apple.com/search?term=${q}&entity=macSoftware&limit=6&country=CA`, 'iTunes')));
      job(async () => mapFlathubSearch(await fetchJson('https://flathub.org/api/v2/search', 'Flathub', UA, { query: query.trim(), hits_per_page: 8 })));
      job(async () => mapWikipediaSearch(await fetchJson(`https://fr.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=6`, 'Wikipédia', UA), 'fr'));
      job(async () => mapWikipediaSearch(await fetchJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${q}%20software&limit=4`, 'Wikipedia', UA), 'en'));
      break;
    default:
      return [];
  }
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
}

/** La fiche complète d'un identifiant à préfixe d'un fournisseur supplémentaire. */
export async function richExtra(kind: string, id: string, fetchJson: FetchJson): Promise<ExtraRich> {
  const [prefix, ...rest] = id.split(':');
  const raw = rest.join(':');
  switch (prefix) {
    case 'tvm': {
      const rich = mapTvmazeShow(await fetchJson(`https://api.tvmaze.com/shows/${encodeURIComponent(raw)}?embed=cast`, 'TVmaze'));
      rich.gallery = mapTvmazeImages(await fetchJson(`https://api.tvmaze.com/shows/${encodeURIComponent(raw)}/images`, 'TVmaze').catch(() => []));
      return rich;
    }
    case 'mal': {
      const rich = mapJikanAnime(await fetchJson(`https://api.jikan.moe/v4/anime/${encodeURIComponent(raw)}/full`, 'Jikan'));
      rich.gallery = mapJikanPictures(await fetchJson(`https://api.jikan.moe/v4/anime/${encodeURIComponent(raw)}/pictures`, 'Jikan').catch(() => null));
      return rich;
    }
    case 'steam': return mapSteamApp(await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(raw)}&l=french&cc=ca`, 'Steam'), raw);
    case 'mb': {
      const rich = mapMusicbrainzGroup(await fetchJson(`https://musicbrainz.org/ws/2/release-group/${encodeURIComponent(raw)}?inc=artist-credits+tags&fmt=json`, 'MusicBrainz', UA));
      rich.gallery = mapCoverArtImages(await fetchJson(`https://coverartarchive.org/release-group/${encodeURIComponent(raw)}`, 'Cover Art Archive', UA).catch(() => null));
      return rich;
    }
    case 'flat': return mapFlathubApp(await fetchJson(`https://flathub.org/api/v2/appstream/${encodeURIComponent(raw)}`, 'Flathub', UA), raw);
    case 'itu':
      return kind === 'MUSIQUE'
        ? mapItunesAlbum(await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(raw)}&entity=song&country=CA`, 'iTunes'))
        : mapItunesApp(await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(raw)}&country=CA`, 'iTunes'));
    case 'wp': {
      const [lang, ...t] = raw.split(':');
      if (!/^(fr|en)$/.test(lang)) throw new Error('Langue Wikipédia invalide');
      return mapWikipediaSummary(await fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.join(':'))}`, 'Wikipédia', UA), kind as ExtraKind);
    }
    default: throw new Error('Fournisseur inconnu');
  }
}

/** Fusionne les résultats : le fournisseur principal d'abord, puis les autres ; un même titre (même année si connue) n'apparaît qu'une fois. */
export function mergeResults(primary: ExtraSearchResult[], extra: ExtraSearchResult[], limit = 24): ExtraSearchResult[] {
  const key = (r: ExtraSearchResult) => `${clean(r.title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()}|${/\b(19|20)\d{2}\b/.exec(r.subtitle ?? '')?.[0] ?? ''}`;
  const seen = new Set<string>();
  const out: ExtraSearchResult[] = [];
  for (const r of [...primary, ...extra]) {
    const k = key(r);
    const loose = k.split('|')[0];
    if (seen.has(k) || (!k.endsWith('|') && seen.has(`${loose}|`)) || (k.endsWith('|') && [...seen].some((s) => s.startsWith(`${loose}|`)))) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
