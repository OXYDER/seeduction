/**
 * « Seeduction TV » (catalogue vidéo à la demande de l'application Android) : logique pure, testée.
 *
 * Accès réservé : donateurs (don actif), membres fondateurs et uploaders (plus l'équipe). Le spectateur n'a pas de ratio à gérer :
 * ce qu'il télécharge pendant la lecture n'est pas compté (le tracker traite l'annonce marquée `vod=1` comme du freeleech) ; seul
 * l'envoi de ceux qui seedent compte, comme d'habitude. La disponibilité d'un titre ne repose que sur son nombre de seeders.
 */

export type VodReason = 'staff' | 'uploader' | 'founder' | 'donor';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

export const VOD_RULE_TEXT = 'Réservé aux donateurs, aux membres fondateurs et aux uploaders.';

export const VOD_REASON_LABELS: Record<VodReason, string> = {
  staff: "Équipe du site",
  uploader: 'Uploader',
  founder: 'Membre fondateur',
  donor: 'Donateur',
};

/** Pourquoi ce compte a accès au catalogue, ou null s'il n'y a pas accès. Se juge sur le COMPTE (pas sur un profil famille). */
export function vodAccess(u: { role?: string | null; founderAt?: Date | null; donorUntil?: Date | null } | null | undefined, now: Date = new Date()): VodReason | null {
  if (!u) return null;
  if (u.role && STAFF.includes(u.role)) return 'staff';
  if (u.role === 'UPLOADER') return 'uploader';
  if (u.founderAt) return 'founder';
  if (u.donorUntil && u.donorUntil.getTime() > now.getTime()) return 'donor';
  return null;
}

export type VodHealth = 'instant' | 'ok' | 'slow' | 'none';

/** Ce qu'on peut attendre du démarrage, d'après le seul nombre de seeders. */
export function vodHealth(seeders: number): VodHealth {
  if (seeders >= 5) return 'instant';
  if (seeders >= 2) return 'ok';
  if (seeders >= 1) return 'slow';
  return 'none';
}

export const VIDEO_FILE = /\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|flv|mpg|mpeg)$/i;
/** En dessous, un fichier vidéo est un « sample » ou une bande-annonce, pas un épisode. */
export const MIN_VIDEO_BYTES = 30 * 1024 * 1024;

/** Saison et épisode lus dans un nom de fichier (« Show.S02E05.mkv », « Show 2x05 »), ou null. */
export function parseEpisode(path: string): { season: number; episode: number } | null {
  const m = /[Ss](\d{1,3})[ ._-]?[Ee](\d{1,4})/.exec(path) ?? /(?:^|[^0-9])(\d{1,2})x(\d{2,3})(?:[^0-9]|$)/.exec(path);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

export const episodeLabel = (season: number | null, episode: number | null) =>
  season != null && episode != null ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : '';

export interface FileEntry { path: string; size: number }

/** Fichiers vidéo lisibles d'un torrent (avec leur index dans le torrent), sans les « samples ». */
export function videoFiles(fileList: unknown): { index: number; path: string; size: number }[] {
  if (!Array.isArray(fileList)) return [];
  const out: { index: number; path: string; size: number }[] = [];
  fileList.forEach((f: any, index) => {
    const path = String(f?.path ?? f?.name ?? '');
    const size = Number(f?.size ?? f?.length ?? 0);
    if (path && VIDEO_FILE.test(path) && size >= MIN_VIDEO_BYTES && !/(^|[\\/._ -])sample([\\/._ -]|$)/i.test(path)) out.push({ index, path, size });
  });
  return out;
}

export interface EpisodeSource {
  torrentId: string;
  fileIndex: number;
  season: number | null;
  episode: number | null;
  size: number;
  seeders: number;
  resolution: string | null;
  language: string | null;
  label: string;
}

/**
 * Un seul choix par épisode : parmi toutes les releases qui le contiennent (épisode isolé ou fichier d'un pack de saison), celle qui a le plus de seeders
 * (à égalité, la plus petite). Trié par saison puis épisode ; ce qui n'a ni saison ni épisode reconnus passe à la fin dans l'ordre d'arrivée.
 */
export function bestPerEpisode(sources: EpisodeSource[]): EpisodeSource[] {
  const best = new Map<string, EpisodeSource>();
  const loose: EpisodeSource[] = [];
  for (const s of sources) {
    if (s.season == null || s.episode == null) { loose.push(s); continue; }
    const key = `${s.season}:${s.episode}`;
    const cur = best.get(key);
    if (!cur || s.seeders > cur.seeders || (s.seeders === cur.seeders && s.size < cur.size)) best.set(key, s);
  }
  const sorted = [...best.values()].sort((a, b) => (a.season! - b.season!) || (a.episode! - b.episode!));
  return [...sorted, ...loose];
}

export interface EpRef { season: number; episode: number }
export interface NextEpisode {
  /** next : le bon épisode suivant existe ; gap : un épisode manque mais un plus tard existe ; missing : l'épisode attendu manque et rien après ; end : fin de la série connue. */
  status: 'next' | 'gap' | 'missing' | 'end';
  next?: EpRef;
  missing: EpRef[];
}

/**
 * L'épisode à lire après `cur`, sans jamais en sauter un en silence. `available` : les épisodes disponibles sur le site ; `seasonSizes` : le nombre d'épisodes par saison
 * d'après la fiche (inconnu : on se fie aux épisodes disponibles).
 */
export function nextEpisode(available: EpRef[], cur: EpRef, seasonSizes: Record<number, number> = {}): NextEpisode {
  const has = (s: number, e: number) => available.some((a) => a.season === s && a.episode === e);
  const size = seasonSizes[cur.season] ?? null;
  const seasonOver = size !== null && cur.episode >= size;
  if (!seasonOver) {
    if (has(cur.season, cur.episode + 1)) return { status: 'next', next: { season: cur.season, episode: cur.episode + 1 }, missing: [] };
    const later = available.filter((a) => a.season === cur.season && a.episode > cur.episode + 1).sort((a, b) => a.episode - b.episode)[0];
    if (later) return { status: 'gap', next: later, missing: Array.from({ length: later.episode - cur.episode - 1 }, (_, i) => ({ season: cur.season, episode: cur.episode + 1 + i })).slice(0, 12) };
    if (size !== null) return { status: 'missing', missing: [{ season: cur.season, episode: cur.episode + 1 }] };
  }
  // fin de saison (ou de ce qu'on connaît) : le premier épisode de la saison suivante
  const nextSeason = Math.min(...available.filter((a) => a.season > cur.season).map((a) => a.season), Infinity);
  if (Number.isFinite(nextSeason)) {
    if (has(nextSeason, 1) && nextSeason === cur.season + 1) return { status: 'next', next: { season: nextSeason, episode: 1 }, missing: [] };
    const first = available.filter((a) => a.season === nextSeason).sort((a, b) => a.episode - b.episode)[0];
    const missing: EpRef[] = [];
    if (nextSeason === cur.season + 1) for (let e = 1; e < first.episode && e <= 12; e++) missing.push({ season: nextSeason, episode: e });
    return { status: 'gap', next: first, missing: missing.length ? missing : [{ season: cur.season + 1, episode: 1 }] };
  }
  return { status: 'end', missing: [] };
}
