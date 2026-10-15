/**
 * Machines à sous : règles pures (sans base de données), partagées par toutes les machines (les thèmes ne changent que l'habillage).
 *
 * Trois rouleaux de 24 arrêts, trois rangées visibles, cinq lignes de paiement (3 horizontales + 2 diagonales). La mise totale est
 * répartie sur les cinq lignes : un gain vaut « multiple × mise ÷ 5 ». Symboles : 0 à 5 (0 = le plus rare et le plus payant), 6 = joker
 * (remplace 0 à 5), 7 = bonus (trois ou plus visibles n'importe où = 5 tours gratuits, sans nouveau déclenchement).
 *
 * Le retour théorique au joueur (RTP) se calcule EXACTEMENT en énumérant les 13 824 combinaisons (voir `exactRtp`), et un test vérifie qu'il reste
 * autour de 90 % : le site garde donc environ 10 % de tout ce qui est misé, à long terme. À court terme, les gains sont aléatoires : certains
 * joueurs gagnent gros, d'autres moins.
 */
import { randomInt } from 'crypto';

export const WILD = 6;
export const SCATTER = 7;
export const FREE_SPINS = 5;
export const REELS = 3;
export const ROWS = 3;

/** Le contenu de chaque rouleau (24 arrêts). Public : le navigateur s'en sert pour l'animation, le tirage reste sur le serveur. */
export const STRIPS: number[][] = [
  [5, 4, 3, 2, 5, 7, 4, 5, 3, 5, 0, 1, 2, 4, 5, 3, 5, 4, 7, 5, 2, 3, 4, 5],
  [5, 3, 4, 2, 5, 7, 5, 3, 4, 5, 0, 1, 2, 6, 5, 3, 4, 5, 7, 5, 2, 3, 4, 5],
  [5, 3, 4, 2, 5, 7, 5, 3, 4, 5, 0, 1, 2, 6, 5, 3, 4, 5, 7, 5, 2, 3, 4, 5],
];

/** Lignes de paiement : la rangée (0 = haut) lue sur chacun des trois rouleaux. */
export const PAYLINES: number[][] = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];

/** Trois symboles identiques sur une ligne : multiple de la mise d'une ligne (mise ÷ 5), du symbole 0 au symbole 5. */
export const PAY_THREE: number[] = [400, 100, 40, 18, 8, 4];
/** Deux cerises (symbole 5) à gauche, sans un troisième symbole 5 : petit gain. */
export const PAY_TWO = 1;

export const STAKE_STEP = 5;

export type Grid = number[][]; // grid[rouleau][rangée]

export interface LineWin { line: number; mult: number }
export interface SpinResult {
  stops: number[];
  grid: Grid;
  lines: LineWin[];
  /** Somme des multiples des lignes gagnantes. */
  mult: number;
  scatters: number;
}

/** Ce qui est visible pour un arrêt donné d'un rouleau : le symbole d'au-dessus, le symbole de l'arrêt, celui du dessous. */
export function column(strip: number[], stop: number): number[] {
  const n = strip.length;
  return [strip[(stop - 1 + n) % n], strip[stop], strip[(stop + 1) % n]];
}

export function gridAt(stops: number[]): Grid {
  return STRIPS.map((strip, r) => column(strip, stops[r]));
}

/** Gain (multiple de la mise d'une ligne) d'une ligne de trois symboles lus de gauche à droite. */
export function linePay(syms: number[]): number {
  if (syms.includes(SCATTER)) return 0;
  const base = syms.filter((s) => s !== WILD);
  if (base.length === 0) return PAY_THREE[0];
  if (base.every((s) => s === base[0])) return PAY_THREE[base[0]];
  const first = [syms[0], syms[1]].filter((s) => s !== WILD);
  if ((first.length === 0 || first[0] === 5) && syms[2] !== 5 && syms[2] !== WILD) return PAY_TWO;
  return 0;
}

export function evaluateGrid(grid: Grid): { lines: LineWin[]; mult: number; scatters: number } {
  const lines: LineWin[] = [];
  PAYLINES.forEach((rows, line) => {
    const mult = linePay([grid[0][rows[0]], grid[1][rows[1]], grid[2][rows[2]]]);
    if (mult > 0) lines.push({ line, mult });
  });
  const scatters = grid.reduce((n, col) => n + col.filter((s) => s === SCATTER).length, 0);
  return { lines, mult: lines.reduce((s, l) => s + l.mult, 0), scatters };
}

export function resultAt(stops: number[]): SpinResult {
  const grid = gridAt(stops);
  return { stops, grid, ...evaluateGrid(grid) };
}

/** Gain en points d'un tirage pour une mise totale (multiple de 5 : toujours un entier). */
export const winOf = (mult: number, stake: number): number => (mult * stake) / STAKE_STEP;

export type Rng = (max: number) => number;
export const secureRng: Rng = (max) => randomInt(max);

export interface Round {
  /** Le tirage payant, puis les tours gratuits éventuels. */
  spins: (SpinResult & { win: number; free: boolean })[];
  win: number;
  freeSpins: number;
}

/**
 * Une partie complète : un tirage ; si trois bonus ou plus sont visibles, cinq tours gratuits à la même mise (sans nouveau déclenchement).
 * `maxWin` plafonne le total de la partie (0 = sans plafond).
 */
export function playRound(stake: number, rng: Rng = secureRng, maxWin = 0): Round {
  const roll = () => resultAt(STRIPS.map((s) => rng(s.length)));
  const first = roll();
  const spins: Round['spins'] = [{ ...first, win: winOf(first.mult, stake), free: false }];
  const freeSpins = first.scatters >= 3 ? FREE_SPINS : 0;
  for (let i = 0; i < freeSpins; i++) {
    const r = roll();
    spins.push({ ...r, win: winOf(r.mult, stake), free: true });
  }
  let win = spins.reduce((s, x) => s + x.win, 0);
  if (maxWin > 0 && win > maxWin) win = maxWin;
  return { spins, win, freeSpins };
}

/** Retour théorique exact au joueur (1 = 100 %), par énumération de toutes les combinaisons d'arrêts, tours gratuits compris. */
export function exactRtp(): { rtp: number; hitRate: number; bonusRate: number; maxMultiple: number } {
  const [a, b, c] = STRIPS.map((s) => s.length);
  let sumMult = 0, hits = 0, bonus = 0, max = 0;
  for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) for (let k = 0; k < c; k++) {
    const r = resultAt([i, j, k]);
    sumMult += r.mult;
    if (r.mult > 0) hits++;
    if (r.scatters >= 3) bonus++;
    max = Math.max(max, r.mult);
  }
  const total = a * b * c;
  const perSpin = sumMult / total / STAKE_STEP; // en multiples de la mise totale
  const pBonus = bonus / total;
  return { rtp: perSpin + pBonus * FREE_SPINS * perSpin, hitRate: hits / total, bonusRate: pBonus, maxMultiple: max / STAKE_STEP };
}

/** Nom d'un gain d'après son multiple de la mise (pour l'habillage : « Gros gain », « Méga gain »...). */
export function winTier(win: number, stake: number): 'none' | 'small' | 'big' | 'mega' {
  if (win <= 0) return 'none';
  const x = win / stake;
  return x >= 25 ? 'mega' : x >= 10 ? 'big' : 'small';
}

// ------------------------------------------------------------------ réglages

export const MACHINES = ['cinema', 'or', 'hockey', 'erable', 'saison', 'pirate'] as const;
export type MachineId = (typeof MACHINES)[number];

export interface SlotsConfig {
  enabled: boolean;
  minStake: number;
  maxStake: number;
  /** Pertes nettes maximales d'un membre sur 24 h (0 = sans limite). */
  dailyLossMax: number;
  /** Gain maximal d'une partie, tours gratuits compris (0 = sans plafond). */
  maxWin: number;
  minAccountDays: number;
  /** Tour gratuit quotidien : valeur de la mise fictive et gain maximal (aucun point n'est débité). */
  dailyFree: { enabled: boolean; stake: number; maxWin: number };
  machines: Record<MachineId, boolean>;
}

export const DEFAULT_SLOTS: SlotsConfig = {
  enabled: true, minStake: 5, maxStake: 100, dailyLossMax: 1000, maxWin: 10_000, minAccountDays: 7,
  dailyFree: { enabled: true, stake: 10, maxWin: 200 },
  machines: { cinema: true, or: true, hockey: true, erable: true, saison: true, pirate: true },
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Réglages valides : les mises sont des multiples de 5 ; une valeur absente ou hors limites garde l'ancienne. */
export function normalizeSlotsConfig(raw: any, previous: SlotsConfig = DEFAULT_SLOTS): SlotsConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const step = (v: unknown, fallback: number) => { const n = int(v, STAKE_STEP, 100_000, fallback); return n - (n % STAKE_STEP) || fallback; };
  const minStake = step(r.minStake, previous.minStake);
  const maxStake = Math.max(minStake, step(r.maxStake, previous.maxStake));
  const machines = { ...previous.machines };
  for (const m of MACHINES) if (typeof r.machines?.[m] === 'boolean') machines[m] = r.machines[m];
  const free = r.dailyFree && typeof r.dailyFree === 'object' ? r.dailyFree : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minStake, maxStake,
    dailyLossMax: int(r.dailyLossMax, 0, 10_000_000, previous.dailyLossMax),
    maxWin: int(r.maxWin, 0, 100_000_000, previous.maxWin),
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    dailyFree: {
      enabled: typeof free.enabled === 'boolean' ? free.enabled : previous.dailyFree.enabled,
      stake: step(free.stake, previous.dailyFree.stake),
      maxWin: int(free.maxWin, 0, 1_000_000, previous.dailyFree.maxWin),
    },
    machines,
  };
}
