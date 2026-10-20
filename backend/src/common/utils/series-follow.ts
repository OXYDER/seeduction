/**
 * Suivi de séries : « prévenez-moi dès que le prochain épisode sort ». Logique pure (testée) : identification d'une série d'après la fiche d'un torrent, numéros d'épisodes,
 * compte à rebours, et décision de notifier (la veille, le jour de la sortie, à l'arrivée du torrent sur Seeduction). La lecture de la base et de TMDB est dans SeriesFollowService.
 */
import { numOf } from './watch-progress';

/** Numéro d'épisode : saison puis épisode. */
export interface Ep { season: number; episode: number }

export const epLabel = (e: Ep | null | undefined) => (e ? `S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}` : '');
export const epKey = (e: Ep) => `${e.season}x${e.episode}`;

/** Le numéro d'épisode d'un torrent (saison / épisode stockés en texte), ou null s'il n'en a pas. */
export function torrentEp(t: { season?: string | null; episode?: string | null }): Ep | null {
  const season = numOf(t.season), episode = numOf(t.episode);
  return season !== null && episode !== null ? { season, episode } : null;
}

/** Négatif si a < b, 0 si égaux, positif si a > b. */
export const compareEp = (a: Ep, b: Ep) => a.season - b.season || a.episode - b.episode;

/** Une fiche de série TMDB (« tv ») : seul ce type de fiche permet de suivre une série. */
export function seriesKeyOf(t: { metaSource?: string | null; metaExternalId?: string | null; metadata?: unknown }): { source: string; id: string } | null {
  if (t.metaSource !== 'tmdb' || !t.metaExternalId) return null;
  const kind = (t.metadata as { kind?: string } | null | undefined)?.kind;
  return kind === 'tv' ? { source: 'tmdb', id: String(t.metaExternalId) } : null;
}

/** Jour (AAAA-MM-JJ) d'un instant à l'heure de Montréal. */
export const localDay = (at: Date | number = Date.now(), tz = 'America/Toronto') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** Nombre de jours entre aujourd'hui et une date de sortie (AAAA-MM-JJ), à l'heure de Montréal : 0 = aujourd'hui, 1 = demain, négatif = déjà sortie. */
export function daysUntil(airDate: string | Date | null | undefined, now: Date | number = Date.now()): number | null {
  if (!airDate) return null;
  const day = typeof airDate === 'string' ? airDate.slice(0, 10) : airDate.toISOString().slice(0, 10);
  const a = Date.parse(day + 'T00:00:00Z'), b = Date.parse(localDay(now) + 'T00:00:00Z');
  return Number.isFinite(a) ? Math.round((a - b) / 86_400_000) : null;
}

/** Compte à rebours lisible : « aujourd'hui », « demain », « dans 5 jours », « dans 3 semaines ». */
export function countdownLabel(days: number | null): string {
  if (days === null) return 'date inconnue';
  if (days < 0) return days === -1 ? 'sorti hier' : `sorti il y a ${-days} jours`;
  if (days === 0) return 'aujourd\'hui';
  if (days === 1) return 'demain';
  if (days < 14) return `dans ${days} jours`;
  if (days < 60) return `dans ${Math.round(days / 7)} semaines`;
  return `dans ${Math.round(days / 30)} mois`;
}

export interface FollowState {
  nextAirDate: string | null; next: Ep | null;
  lastAirDate: string | null; last: Ep | null;
  notifiedSoon: string | null; notifiedAired: string | null;
}

export type SeriesNotice = { kind: 'soon' | 'aired'; ep: Ep };

/**
 * Quelles notifications envoyer après une mise à jour TMDB : la veille de la sortie du prochain épisode (une fois), et quand un épisode vient de sortir
 * (sorti aujourd'hui ou hier, une fois). Un épisode sorti il y a plus longtemps n'est jamais annoncé : on ne réveille personne pour du vieux.
 */
export function noticesFor(s: FollowState, now: Date | number = Date.now()): SeriesNotice[] {
  const out: SeriesNotice[] = [];
  const dNext = daysUntil(s.nextAirDate, now);
  if (s.next && dNext === 1 && s.notifiedSoon !== epKey(s.next)) out.push({ kind: 'soon', ep: s.next });
  const dLast = daysUntil(s.lastAirDate, now);
  if (s.last && dLast !== null && dLast <= 0 && dLast >= -1 && s.notifiedAired !== epKey(s.last)) out.push({ kind: 'aired', ep: s.last });
  return out;
}

/** Un torrent qui arrive sur Seeduction concerne-t-il ce suivi ? Seulement un épisode du jour de la mise en suivi ou plus récent (pas tout l'ancien catalogue d'une série). */
export function isNewForFollow(torrent: Ep | null, baseline: Ep | null): boolean {
  if (!torrent) return false;
  return !baseline || compareEp(torrent, baseline) >= 0;
}
