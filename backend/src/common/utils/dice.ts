/**
 * Dés : règles pures (sans base de données).
 *
 * Deux dés à six faces sont lancés (36 combinaisons également probables). Le joueur parie sur le total : moins que N, plus que N, exactement N, ou sur des « doubles »
 * (les deux dés identiques). Chaque pari paie « (1 − marge) ÷ probabilité » : la cote est calculée sur les 36 combinaisons, donc exacte, et arrondie vers le BAS
 * (la maison ne perd jamais un arrondi). Les paris trop probables, dont la cote tomberait sous ×1,10, ne sont pas proposés.
 */
export type Kind = 'UNDER' | 'OVER' | 'EXACT' | 'DOUBLES';
export const KINDS: Kind[] = ['UNDER', 'OVER', 'EXACT', 'DOUBLES'];
export interface Bet { kind: Kind; /** Total visé (0 pour les doubles). */ n: number }

export const COMBOS = 36;
/** Cote minimale proposée, en centièmes (110 = ×1,10). */
export const MIN_MULT_H = 110;

export interface DiceConfig {
  enabled: boolean;
  minStake: number;
  maxStake: number;
  /** Marge de la maison sur chaque pari (0,05 = la cote paie 95 % de la cote équitable). */
  edge: number;
  maxWin: number;
  dailyLossMax: number;
  minAccountDays: number;
  /** Lancer gratuit quotidien : mise fictive et gain maximal (aucun point n'est débité). */
  dailyFree: { enabled: boolean; stake: number; maxWin: number };
}

export const DEFAULT_DICE: DiceConfig = {
  enabled: true, minStake: 5, maxStake: 100, edge: 0.05, maxWin: 5000, dailyLossMax: 1000, minAccountDays: 7,
  dailyFree: { enabled: true, stake: 10, maxWin: 100 },
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Réglages valides ; une valeur absente ou hors limites garde l'ancienne. La marge est de 1 % à 30 % : la maison reste toujours gagnante. */
export function normalizeDice(raw: any, previous: DiceConfig = DEFAULT_DICE): DiceConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const step = (v: unknown, fallback: number) => { const n = int(v, 5, 100_000, fallback); return n - (n % 5) || fallback; };
  const minStake = step(r.minStake, previous.minStake);
  const edge = Number(r.edge);
  const free = r.dailyFree && typeof r.dailyFree === 'object' ? r.dailyFree : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minStake, maxStake: Math.max(minStake, step(r.maxStake, previous.maxStake)),
    edge: Number.isFinite(edge) && edge >= 0.01 && edge <= 0.3 ? Math.round(edge * 1000) / 1000 : previous.edge,
    maxWin: int(r.maxWin, 0, 100_000_000, previous.maxWin),
    dailyLossMax: int(r.dailyLossMax, 0, 10_000_000, previous.dailyLossMax),
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    dailyFree: {
      enabled: typeof free.enabled === 'boolean' ? free.enabled : previous.dailyFree.enabled,
      stake: step(free.stake, previous.dailyFree.stake),
      maxWin: int(free.maxWin, 0, 1_000_000, previous.dailyFree.maxWin),
    },
  };
}

/** Un pari est-il bien formé ? (Sa cote est vérifiée à part.) */
export function wellFormed(bet: Bet): boolean {
  if (!KINDS.includes(bet.kind) || !Number.isInteger(bet.n)) return false;
  switch (bet.kind) {
    case 'UNDER': return bet.n >= 3 && bet.n <= 12;
    case 'OVER': return bet.n >= 2 && bet.n <= 11;
    case 'EXACT': return bet.n >= 2 && bet.n <= 12;
    case 'DOUBLES': return bet.n === 0;
  }
}

/** Le pari gagne-t-il avec ces deux dés ? */
export function wins(bet: Bet, d1: number, d2: number): boolean {
  const total = d1 + d2;
  switch (bet.kind) {
    case 'UNDER': return total < bet.n;
    case 'OVER': return total > bet.n;
    case 'EXACT': return total === bet.n;
    case 'DOUBLES': return d1 === d2;
  }
}

/** Nombre de combinaisons (sur 36) qui font gagner le pari. */
export function ways(bet: Bet): number {
  let n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (wins(bet, a, b)) n++;
  return n;
}

export const probability = (bet: Bet): number => ways(bet) / COMBOS;

/** Cote en centièmes (250 = ×2,50), arrondie vers le bas ; null si le pari est impossible, certain ou trop probable (cote sous ×1,10). */
export function multH(bet: Bet, edge: number): number | null {
  if (!wellFormed(bet)) return null;
  const w = ways(bet);
  if (w <= 0 || w >= COMBOS) return null;
  const h = Math.floor(((1 - edge) * COMBOS * 100) / w + 1e-9);
  return h >= MIN_MULT_H ? h : null;
}

/** Points rendus (mise comprise) pour une mise et une cote en centièmes, plafonnés ; arrondi vers le bas. */
export function payoutOf(stake: number, mult: number, maxWin = 0): number {
  const p = Math.floor((stake * mult) / 100);
  return maxWin > 0 ? Math.min(p, maxWin) : p;
}

/** Retour exact d'un pari (sans plafond) : probabilité × cote. Ne dépasse jamais 1 − marge. */
export const rtp = (bet: Bet, edge: number): number => { const m = multH(bet, edge); return m === null ? 0 : (ways(bet) / COMBOS) * (m / 100); };

/** Lance deux dés avec un générateur d'entiers `rng(n)` ∈ [0, n[. */
export function roll(rng: (max: number) => number): [number, number] { return [rng(6) + 1, rng(6) + 1]; }

export interface BetInfo { kind: Kind; n: number; ways: number; p: number; mult: number }

/** Tous les paris proposés avec leur probabilité et leur cote, pour l'écran. */
export function allBets(edge: number): BetInfo[] {
  const out: BetInfo[] = [];
  const push = (bet: Bet) => { const m = multH(bet, edge); if (m !== null) out.push({ kind: bet.kind, n: bet.n, ways: ways(bet), p: probability(bet), mult: m / 100 }); };
  for (let n = 3; n <= 12; n++) push({ kind: 'UNDER', n });
  for (let n = 2; n <= 11; n++) push({ kind: 'OVER', n });
  for (let n = 2; n <= 12; n++) push({ kind: 'EXACT', n });
  push({ kind: 'DOUBLES', n: 0 });
  return out;
}
