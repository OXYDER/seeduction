/**
 * Fiches d'épisodes (image d'aperçu, titre, résumé, durée, date) lues chez les fournisseurs : TMDB d'abord, puis TVmaze (sans clé), puis TheTVDB (si une clé est configurée)
 * quand TMDB n'a rien ou pas d'image pour l'épisode. Fonctions pures, testées : le réseau et la base sont dans EpisodeInfoService.
 */
export interface EpisodeData {
  season: number;
  episode: number;
  title: string | null;
  overview: string | null;
  /** Adresse EXTERNE de l'image (le service la copie sur Seeduction, jamais d'affichage direct). */
  imageUrl: string | null;
  airDate: string | null;
  runtime: number | null;
}

const text = (v: unknown, max = 1200): string | null => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
const date = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : null);
const https = (u: unknown): string | null => (typeof u === 'string' && /^https?:\/\//.test(u) ? u.replace(/^http:\/\//, 'https://') : null);

/** Page « saison » de TMDB (`/tv/{id}/season/{n}`) : image `still_path` en 500 px de large. */
export function parseTmdbSeason(json: any, season: number, imageBase: string): EpisodeData[] {
  const base = imageBase.replace(/\/$/, '');
  return (Array.isArray(json?.episodes) ? json.episodes : []).filter((e: any) => Number(e?.episode_number) > 0).map((e: any) => ({
    season, episode: Number(e.episode_number), title: text(e.name, 200),
    overview: text(e.overview), imageUrl: typeof e.still_path === 'string' && e.still_path.startsWith('/') ? `${base}/w500${e.still_path}` : null,
    airDate: date(e.air_date), runtime: num(e.runtime),
  }));
}

/** Liste d'épisodes de TVmaze (`/shows/{id}/episodes`) : toutes les saisons en un seul appel. `strip` retire le HTML des résumés. */
export function parseTvmazeEpisodes(rows: any, strip: (html: unknown) => string = (h) => String(h ?? '').replace(/<[^>]*>/g, '')): EpisodeData[] {
  return (Array.isArray(rows) ? rows : []).filter((e: any) => Number(e?.season) >= 0 && Number(e?.number) > 0).map((e: any) => ({
    season: Number(e.season), episode: Number(e.number), title: text(e.name, 200),
    overview: text(strip(e.summary)), imageUrl: https(e.image?.original) ?? https(e.image?.medium),
    airDate: date(e.airdate), runtime: num(e.runtime),
  }));
}

/** Épisodes d'une saison chez TheTVDB (`/series/{id}/episodes/default`, champ `data.episodes`). */
export function parseTvdbEpisodes(json: any, season: number): EpisodeData[] {
  return (Array.isArray(json?.data?.episodes) ? json.data.episodes : []).filter((e: any) => Number(e?.seasonNumber) === season && Number(e?.number) > 0).map((e: any) => ({
    season, episode: Number(e.number), title: text(e.name, 200), overview: text(e.overview), imageUrl: https(e.image), airDate: date(e.aired), runtime: num(e.runtime),
  }));
}

/** Réunit deux listes : pour un même épisode, les champs de la première, complétés par ceux de la seconde quand ils manquent ; les épisodes que seule la seconde connaît s'ajoutent. */
export function mergeEpisodes(primary: EpisodeData[], fallback: EpisodeData[]): EpisodeData[] {
  const key = (e: EpisodeData) => `${e.season}:${e.episode}`;
  const out = new Map<string, EpisodeData>(primary.map((e) => [key(e), { ...e }]));
  for (const f of fallback) {
    const cur = out.get(key(f));
    if (!cur) { out.set(key(f), { ...f }); continue; }
    out.set(key(f), {
      ...cur, title: cur.title ?? f.title, overview: cur.overview ?? f.overview, imageUrl: cur.imageUrl ?? f.imageUrl, airDate: cur.airDate ?? f.airDate, runtime: cur.runtime ?? f.runtime,
    });
  }
  return [...out.values()].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

/** Reste-t-il des épisodes sans image : faut-il interroger le fournisseur suivant ? */
export const missingImages = (eps: EpisodeData[]): boolean => eps.length === 0 || eps.some((e) => !e.imageUrl);
