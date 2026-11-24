/**
 * Une release qui vient d'être approuvée comble-t-elle une demande restée ouverte ? Logique pure (testée), volontairement prudente : le titre doit être le même (pas « contenu dedans »),
 * et l'épisode, l'année, la langue et la qualité demandés doivent correspondre quand la demande les précise. Dans le doute, la demande reste ouverte.
 */

const NOISE = new Set([
  'vff', 'vfq', 'vfi', 'vf', 'vostfr', 'vost', 'multi', 'truefrench', 'french', 'english', 'vo', 'subfrench', 'bluray', 'blu', 'ray', 'bdrip', 'brrip', 'web', 'webdl', 'webrip', 'hdtv', 'dvdrip', 'remux',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'aac', 'ac3', 'dts', 'hdr', 'sdr', 'uhd', '4k', 'hd', 'fhd', 'complete', 'complet', 'integrale', 'saison', 'season', 'episode', 'ep',
]);

/** Titre comparable : sans accents, ponctuation, année, numéro d'épisode ni mots de qualité ou de langue. */
export function normalizeTitle(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bs\d{1,2}\s?e\d{1,3}\b/g, ' ').replace(/\b\d{1,2}x\d{2,3}\b/g, ' ').replace(/\bs\d{1,2}\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\b(480|576|720|1080|2160)[pi]\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !NOISE.has(w)).join(' ').trim();
}

export interface EpisodeToken { season: number; episode: number | null }

/** « Titre S01E06 » → saison 1 épisode 6 ; « Titre S02 » → saison 2 entière ; aucun → null. */
export function episodeToken(title: string): EpisodeToken | null {
  const t = String(title ?? '');
  let m = /\bs(\d{1,2})\s?e(\d{1,3})\b/i.exec(t) ?? /\b(\d{1,2})x(\d{2,3})\b/.exec(t);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  m = /\bs(\d{1,2})\b/i.exec(t) ?? /\bsaison\s*(\d{1,2})\b/i.exec(t);
  return m ? { season: Number(m[1]), episode: null } : null;
}

const quality = (r: string | null | undefined) => {
  const v = String(r ?? '').toLowerCase();
  if (!v) return '';
  if (/2160|4k|uhd/.test(v)) return '2160p';
  const m = /(480|576|720|1080)/.exec(v);
  return m ? `${m[1]}p` : v.trim();
};

export interface MatchRequest { title: string; year: number | null; language: string | null; resolution: string | null; declinedTorrentIds?: string[] }
export interface MatchTorrent { id: string; titles: string[]; year: number | null; language: string | null; resolution: string | null; episodes: { season: number; episode: number }[] }

export function requestMatches(req: MatchRequest, t: MatchTorrent): boolean {
  if (req.declinedTorrentIds?.includes(t.id)) return false;
  const wanted = normalizeTitle(req.title);
  if (wanted.length < 2) return false;
  if (!t.titles.some((x) => normalizeTitle(x) === wanted)) return false;

  const tok = episodeToken(req.title);
  if (tok) {
    if (tok.episode != null) { if (!t.episodes.some((e) => e.season === tok.season && e.episode === tok.episode)) return false; }
    else if (t.episodes.filter((e) => e.season === tok.season).length < 3) return false; // une saison entière : au moins trois épisodes de cette saison
  } else if (t.episodes.length > 0) return false; // « la série » demandée : un épisode isolé ne suffit pas
  // Année : seulement pour une demande de film (un épisode porte souvent l'année de la série, ou aucune).
  if (!tok && req.year && t.year && req.year !== t.year) return false;
  if (!tok && req.year && !t.year) return false;
  if (req.language && t.language && req.language.trim().toLowerCase() !== t.language.trim().toLowerCase()) return false;
  if (req.resolution && quality(req.resolution) && quality(t.resolution) && quality(req.resolution) !== quality(t.resolution)) return false;
  return true;
}
