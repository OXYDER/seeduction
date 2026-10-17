/**
 * Pronostics de la LNH : règles pures (sans base de données ni réseau).
 *
 * Chaque jour, le membre choisit le vainqueur des matchs de la ligue avant leur début. Une bonne prédiction rapporte des points, avec un bonus de série
 * (bonnes prédictions de suite) ; une journée parfaite rapporte un bonus de plus. Rien n'est misé : ce sont des cadeaux du site, plafonnés par jour et par semaine.
 */
export type Side = 'H' | 'A';

export interface PicksConfig {
  enabled: boolean;
  minAccountDays: number;
  /** Points d'une bonne prédiction. */
  pointsPerWin: number;
  /** Points ajoutés par bonne prédiction de suite avant celle-ci, jusqu'à `comboMax` prédictions. */
  comboPerWin: number;
  comboMax: number;
  /** Bonus d'une journée parfaite : toutes les prédictions du jour sont bonnes, au moins `perfectMinGames`. */
  perfectBonus: number;
  perfectMinGames: number;
  /** Plafonds des points des prédictions (le bonus de journée parfaite n'en fait pas partie). */
  dailyCap: number;
  weeklyCap: number;
  /** Prix remis aux trois meilleurs de la semaine (1er, 2e, 3e) et nombre minimal de prédictions pour y avoir droit. */
  weeklyPrizes: [number, number, number];
  weeklyMinPicks: number;
  /** Nombre de jours à l'avance (aujourd'hui compris) où l'on peut pronostiquer. */
  daysAhead: number;
}

export const DEFAULT_PICKS: PicksConfig = {
  enabled: true, minAccountDays: 3, pointsPerWin: 5, comboPerWin: 1, comboMax: 5,
  perfectBonus: 20, perfectMinGames: 3, dailyCap: 60, weeklyCap: 250,
  weeklyPrizes: [100, 60, 40], weeklyMinPicks: 5, daysAhead: 3,
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizePicks(raw: any, previous: PicksConfig = DEFAULT_PICKS): PicksConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pr = Array.isArray(r.weeklyPrizes) ? r.weeklyPrizes : [];
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    pointsPerWin: int(r.pointsPerWin, 0, 1000, previous.pointsPerWin),
    comboPerWin: int(r.comboPerWin, 0, 100, previous.comboPerWin),
    comboMax: int(r.comboMax, 0, 50, previous.comboMax),
    perfectBonus: int(r.perfectBonus, 0, 10_000, previous.perfectBonus),
    perfectMinGames: int(r.perfectMinGames, 2, 20, previous.perfectMinGames),
    dailyCap: int(r.dailyCap, 0, 100_000, previous.dailyCap),
    weeklyCap: int(r.weeklyCap, 0, 1_000_000, previous.weeklyCap),
    weeklyPrizes: [0, 1, 2].map((i) => int(pr[i], 0, 100_000, previous.weeklyPrizes[i])) as [number, number, number],
    weeklyMinPicks: int(r.weeklyMinPicks, 1, 100, previous.weeklyMinPicks),
    daysAhead: int(r.daysAhead, 1, 6, previous.daysAhead),
  };
}

/** Côté gagnant d'un match terminé (jamais d'égalité au hockey) ; null si le score est inutilisable. */
export function winnerOf(home: number | null, away: number | null): Side | null {
  if (home === null || away === null || home === away) return null;
  return home > away ? 'H' : 'A';
}

/** Nombre de bonnes prédictions consécutives les plus récentes (statuts du plus récent au plus ancien ; les prédictions annulées ne comptent pas). */
export function streakOf(statusesNewestFirst: string[]): number {
  let n = 0;
  for (const s of statusesNewestFirst) {
    if (s === 'VOID') continue;
    if (s !== 'WON') break;
    n++;
  }
  return n;
}

/** Points d'une bonne prédiction selon la série de bonnes prédictions qui la précède. */
export function winPoints(cfg: PicksConfig, streakBefore: number): number {
  return cfg.pointsPerWin + Math.min(Math.max(0, streakBefore), cfg.comboMax) * cfg.comboPerWin;
}

/** Points réellement versés une fois les plafonds du jour et de la semaine appliqués. `dayEarned` et `weekEarned` sont les points déjà gagnés (bonus de journée parfaite exclu). */
export function capped(points: number, dayEarned: number, weekEarned: number, cfg: PicksConfig): number {
  const day = cfg.dailyCap > 0 ? cfg.dailyCap - dayEarned : points;
  const week = cfg.weeklyCap > 0 ? cfg.weeklyCap - weekEarned : points;
  return Math.max(0, Math.min(points, day, week));
}

/** Journée parfaite : toutes les prédictions du jour sont réglées et gagnées, et il y en a assez. */
export function isPerfectDay(statuses: string[], cfg: PicksConfig): boolean {
  const live = statuses.filter((s) => s !== 'VOID');
  return live.length >= cfg.perfectMinGames && live.every((s) => s === 'WON');
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

/** Ajoute des jours à une date AAAA-MM-JJ (calcul sur le calendrier, sans effet de l'heure d'été). */
export function addDays(day: string, n: number): string {
  const t = parse(day);
  t.setUTCDate(t.getUTCDate() + n);
  return fmt(t);
}

/** Lundi de la semaine qui contient ce jour (la semaine va du lundi au dimanche). */
export function weekStart(day: string): string {
  const t = parse(day);
  const dow = (t.getUTCDay() + 6) % 7; // lundi = 0
  return addDays(day, -dow);
}

export interface TeamRecord { wins: number; losses: number; otLosses: number; points: number; gamesPlayed: number; last10: string; streak: string }

/** Fiche d'une équipe d'après le classement de la LNH (null si les données sont inutilisables). */
export function recordOf(raw: any): TeamRecord | null {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const wins = n(raw?.wins), losses = n(raw?.losses), ot = n(raw?.otLosses);
  if (wins === null || losses === null || ot === null) return null;
  const l10 = [n(raw.l10Wins), n(raw.l10Losses), n(raw.l10OtLosses)];
  return {
    wins, losses, otLosses: ot, points: n(raw.points) ?? 0, gamesPlayed: n(raw.gamesPlayed) ?? wins + losses + ot,
    last10: l10.every((v) => v !== null) ? l10.join('-') : '',
    streak: typeof raw.streakCode === 'string' && n(raw.streakCount) ? `${raw.streakCode}${raw.streakCount}` : '',
  };
}
