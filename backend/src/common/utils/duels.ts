/**
 * Duels entre membres : règles pures (sans base de données).
 *
 * Deux membres se lancent un défi sur une activité GRATUITE (quiz, pronostics, défis) pendant quelques jours ; celui qui fait le meilleur score gagne. Rien n'est misé :
 * le site offre une petite récompense (le gagnant gagne plus, le perdant reçoit un lot de consolation s'il a joué). Pour qu'on ne puisse pas fabriquer des points à deux,
 * il y a un plafond de duels récompensés par jour et un délai entre deux récompenses pour la même paire de membres.
 */
export type DuelKind = 'quiz' | 'picks' | 'challenges';
export interface DuelKindDef { id: DuelKind; icon: string; title: string; unit: string; desc: string }

export const DUEL_KINDS: DuelKindDef[] = [
  { id: 'quiz', icon: '🧠', title: 'Quiz', unit: 'bonnes réponses', desc: 'Qui répond juste au plus de questions du quiz quotidien ? (égalité : celui qui a le plus de points)' },
  { id: 'picks', icon: '🎯', title: 'Pronostics LNH', unit: 'pronostics gagnés', desc: 'Qui réussit le plus de pronostics sur les matchs de la LNH ?' },
  { id: 'challenges', icon: '🏅', title: 'Défis du jour et de la semaine', unit: 'défis réussis', desc: 'Qui réussit le plus de défis quotidiens et hebdomadaires ?' },
];
export const DURATIONS = [3, 7] as const;
export type Duration = (typeof DURATIONS)[number];

export const isKind = (v: unknown): v is DuelKind => DUEL_KINDS.some((k) => k.id === v);
export const kindDef = (k: string): DuelKindDef => DUEL_KINDS.find((x) => x.id === k) ?? DUEL_KINDS[0];

export interface DuelsConfig {
  enabled: boolean;
  winPoints: number;
  consolationPoints: number;
  tiePoints: number;
  maxActive: number; // duels en cours (acceptés) en même temps, par membre
  maxPendingOut: number; // invitations envoyées en attente de réponse, par membre
  minAccountDays: number;
  expireHours: number; // une invitation sans réponse expire
  maxRewardedPerDay: number; // duels récompensés par membre et par jour
  pairCooldownDays: number; // délai avant que la même paire soit de nouveau récompensée
}

export const DEFAULT_DUELS: DuelsConfig = {
  enabled: true, winPoints: 20, consolationPoints: 5, tiePoints: 10, maxActive: 5, maxPendingOut: 3, minAccountDays: 3, expireHours: 48, maxRewardedPerDay: 3, pairCooldownDays: 7,
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeDuels(raw: any, previous: DuelsConfig = DEFAULT_DUELS): DuelsConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    winPoints: int(r.winPoints, 0, 1000, previous.winPoints),
    consolationPoints: int(r.consolationPoints, 0, 1000, previous.consolationPoints),
    tiePoints: int(r.tiePoints, 0, 1000, previous.tiePoints),
    maxActive: int(r.maxActive, 1, 50, previous.maxActive),
    maxPendingOut: int(r.maxPendingOut, 1, 50, previous.maxPendingOut),
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    expireHours: int(r.expireHours, 1, 24 * 30, previous.expireHours),
    maxRewardedPerDay: int(r.maxRewardedPerDay, 0, 50, previous.maxRewardedPerDay),
    pairCooldownDays: int(r.pairCooldownDays, 0, 365, previous.pairCooldownDays),
  };
}

export const addDaysTo = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};

/** Période d'un duel accepté le jour `acceptDay` : elle commence le lendemain (personne n'a de longueur d'avance) et dure `days` jours. */
export function periodFor(acceptDay: string, days: number): { startDay: string; endDay: string } {
  const startDay = addDaysTo(acceptDay, 1);
  return { startDay, endDay: addDaysTo(startDay, Math.max(1, days) - 1) };
}

export interface Score { main: number; tie: number }
export type Side = 'A' | 'B';

/** Le gagnant (`null` : égalité parfaite). */
export function winnerOf(a: Score, b: Score): Side | null {
  if (a.main !== b.main) return a.main > b.main ? 'A' : 'B';
  if (a.tie !== b.tie) return a.tie > b.tie ? 'A' : 'B';
  return null;
}

export interface Plan { winner: Side | null; pointsA: number; pointsB: number; note: string }

/**
 * Qui gagne quoi. `allowA` / `allowB` : le membre peut encore recevoir une récompense aujourd'hui ; `pairOk` : la paire n'a pas été récompensée trop récemment.
 * Il faut avoir joué (score > 0) pour recevoir quelque chose.
 */
export function plan(a: Score, b: Score, cfg: DuelsConfig, allowA: boolean, allowB: boolean, pairOk: boolean): Plan {
  if (a.main <= 0 && b.main <= 0) return { winner: null, pointsA: 0, pointsB: 0, note: 'Personne n\'a joué pendant le duel' };
  const winner = winnerOf(a, b);
  const raw = winner === null
    ? { A: a.main > 0 ? cfg.tiePoints : 0, B: b.main > 0 ? cfg.tiePoints : 0 }
    : { A: a.main > 0 ? (winner === 'A' ? cfg.winPoints : cfg.consolationPoints) : 0, B: b.main > 0 ? (winner === 'B' ? cfg.winPoints : cfg.consolationPoints) : 0 };
  if (!pairOk) return { winner, pointsA: 0, pointsB: 0, note: 'Pas de récompense : vous avez déjà été récompensés pour un duel récemment' };
  const pointsA = allowA ? raw.A : 0, pointsB = allowB ? raw.B : 0;
  const capped = (!allowA && raw.A > 0) || (!allowB && raw.B > 0);
  return { winner, pointsA, pointsB, note: capped ? 'Plafond de duels récompensés atteint aujourd\'hui pour au moins un des deux' : '' };
}
