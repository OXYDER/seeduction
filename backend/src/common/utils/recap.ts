/**
 * Récapitulatif mensuel personnel : bornes du mois à l'heure de Montréal, gains par jour d'après les relevés de nuit, position parmi les autres membres.
 * Logique pure (testée) ; la lecture de la base est dans RecapService.
 */
import { dayKey } from './ledger';
import { numOf, seriesTitleOf } from './watch-progress';

export const RECAP_TZ = 'America/Toronto';

/** Décalage (minutes, UTC → heure locale) d'un fuseau à un instant donné. */
export function tzOffsetMinutes(at: Date, tz = RECAP_TZ): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(part);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export interface MonthRange { key: string; start: Date; end: Date; days: number; label: string; year: number; month: number }

/** Bornes d'un mois civil (AAAA-MM) à l'heure de Montréal ; null si la clé est invalide. */
export function monthRange(key: string, tz = RECAP_TZ): MonthRange | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const localStart = (y: number, mo: number) => { const guess = new Date(Date.UTC(y, mo - 1, 1)); return new Date(guess.getTime() - tzOffsetMinutes(guess, tz) * 60_000); };
  const start = localStart(year, month);
  const end = month === 12 ? localStart(year + 1, 1) : localStart(year, month + 1);
  return { key, start, end, days: new Date(Date.UTC(year, month, 0)).getUTCDate(), label: `${MONTHS[month - 1]} ${year}`, year, month };
}

/** Clé du mois (AAAA-MM) d'un instant, à l'heure de Montréal. */
export const monthKeyOf = (at: Date, tz = RECAP_TZ) => dayKey(at, tz).slice(0, 7);

/** Mois précédent d'une clé AAAA-MM. */
export function previousMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface Snap { takenAt: Date; uploaded: number; downloaded: number }
export interface DayGain { day: string; up: number; down: number }

/**
 * Gain par jour d'après les relevés de nuit (un par nuit, vers 3 h) : l'écart entre deux relevés consécutifs est ce qui s'est passé pendant la journée qui précède le deuxième.
 * `base` est le dernier relevé d'avant le mois (sans lui, le premier écart est inconnu). Les jours sans relevé valent 0 ; un écart négatif (compteur remis à zéro) est ignoré.
 */
export function dailyGains(snaps: Snap[], base: Snap | null, range: MonthRange, tz = RECAP_TZ): DayGain[] {
  const sorted = [...snaps].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const gains = new Map<string, DayGain>();
  const label = (d: Date) => dayKey(new Date(d.getTime() - 12 * 3_600_000), tz); // relevé de 3 h : il décrit la journée d'avant
  let prev = base;
  for (const s of sorted) {
    if (prev) {
      const day = label(s.takenAt);
      const cur = gains.get(day) ?? { day, up: 0, down: 0 };
      cur.up += Math.max(0, s.uploaded - prev.uploaded);
      cur.down += Math.max(0, s.downloaded - prev.downloaded);
      gains.set(day, cur);
    }
    prev = s;
  }
  const out: DayGain[] = [];
  for (let d = 1; d <= range.days; d++) {
    const day = `${range.key}-${String(d).padStart(2, '0')}`;
    out.push(gains.get(day) ?? { day, up: 0, down: 0 });
  }
  return out;
}

/** Le meilleur jour de partage (plus gros upload), null s'il n'y a rien. */
export function bestDay(days: DayGain[]): DayGain | null {
  const best = days.reduce<DayGain | null>((b, d) => (!b || d.up > b.up ? d : b), null);
  return best && best.up > 0 ? best : null;
}

/** Part des autres membres que `mine` dépasse (0 à 100), médiane et moyenne : sans jamais nommer personne. */
export function compare(mine: number, others: number[]): { beatsPercent: number; median: number; average: number; members: number } | null {
  if (others.length === 0) return null;
  const sorted = [...others].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < mine).length;
  const mid = Math.floor(sorted.length / 2);
  return {
    beatsPercent: Math.round((below / sorted.length) * 100),
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    average: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    members: sorted.length,
  };
}

export interface WatchRow { torrentId: string; fileIndex: number; positionSeconds: number; durationSeconds: number | null; name: string; season: string | null; episode: string | null; metaSource: string | null; metaExternalId: string | null; coverImage: string | null }

/** Ce qui a été regardé dans le mois : séries (épisodes distincts par série) et films / autres fichiers. Le temps est celui du point atteint dans chaque fichier (ou sa durée si terminé) : un ordre de grandeur. */
export function summarizeWatching(rows: WatchRow[]) {
  const series = new Map<string, { title: string; cover: string | null; episodes: Set<string>; seconds: number }>();
  const other = new Map<string, { title: string; cover: string | null; seconds: number }>();
  let totalSeconds = 0;
  for (const r of rows) {
    const seconds = r.durationSeconds ? Math.min(r.positionSeconds, r.durationSeconds) : r.positionSeconds;
    if (seconds < 60) continue; // un coup d'œil de moins d'une minute ne compte pas
    totalSeconds += seconds;
    const isEpisode = r.metaSource && r.metaExternalId && numOf(r.season) !== null && numOf(r.episode) !== null;
    if (isEpisode) {
      const key = `${r.metaSource}:${r.metaExternalId}`;
      const cur = series.get(key) ?? { title: seriesTitleOf(r.name), cover: r.coverImage, episodes: new Set<string>(), seconds: 0 };
      cur.episodes.add(`${numOf(r.season)}x${numOf(r.episode)}`);
      cur.seconds += seconds;
      if (!cur.cover) cur.cover = r.coverImage;
      series.set(key, cur);
    } else {
      const cur = other.get(r.torrentId) ?? { title: r.name, cover: r.coverImage, seconds: 0 };
      cur.seconds += seconds;
      other.set(r.torrentId, cur);
    }
  }
  return {
    totalSeconds,
    series: [...series.values()].map((s) => ({ title: s.title, cover: s.cover, episodes: s.episodes.size, seconds: s.seconds })).sort((a, b) => b.episodes - a.episodes || b.seconds - a.seconds).slice(0, 8),
    other: [...other.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 8),
    seriesCount: series.size, otherCount: other.size,
  };
}
