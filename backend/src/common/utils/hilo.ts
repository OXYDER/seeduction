/**
 * « Plus haut ou plus bas » : règles pures (sans base de données).
 *
 * Une carte est visible. Le joueur devine si la prochaine sera plus haute ou plus basse. Les cartes sont tirées au hasard avec remise (52 possibles) : chaque
 * tirage est indépendant. À égalité de valeur, le joueur perd. Une bonne réponse fait avancer la série et multiplie le gain ; il peut encaisser à tout moment
 * (après au moins une bonne réponse) ou continuer en risquant tout.
 *
 * Chaque réponse paie « (1 − marge) ÷ probabilité » : le retour ne dépasse jamais 100 % − marge à chaque étape, quel que soit le choix du joueur. Les valeurs
 * sont arrondies vers le BAS (la maison ne perd jamais un arrondi).
 */

export const MIN_RANK = 2;
export const MAX_RANK = 14; // l'as est la carte la plus haute
export const RANKS = MAX_RANK - MIN_RANK + 1; // 13 valeurs
export const DECK = RANKS * 4;
export const SUITS = ['spade', 'heart', 'diamond', 'club'] as const;
export type Suit = (typeof SUITS)[number];
export type Guess = 'H' | 'L';

export const rankOf = (card: number): number => (card % RANKS) + MIN_RANK;
export const suitOf = (card: number): Suit => SUITS[Math.floor(card / RANKS)];
export const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const labelOf = (rank: number): string => RANK_LABEL[rank] ?? String(rank);

/** Nombre de valeurs strictement plus hautes / plus basses que `rank` (sur 13). */
export const higherCount = (rank: number): number => MAX_RANK - rank;
export const lowerCount = (rank: number): number => rank - MIN_RANK;

/** Probabilité (sur 13 valeurs, au tirage suivant) de réussir cette réponse : 0 si la réponse est impossible (plus haut qu'un as, plus bas qu'un 2). */
export function probability(rank: number, guess: Guess): number {
  return (guess === 'H' ? higherCount(rank) : lowerCount(rank)) / RANKS;
}

export interface Config {
  enabled: boolean;
  minStake: number;
  maxStake: number;
  /** Marge de la maison à chaque réponse (0,05 = le multiplicateur paie 95 % de la cote équitable). */
  edge: number;
  /** Gain maximal d'une partie : la partie est encaissée d'office quand elle l'atteint. */
  maxWin: number;
  /** Pertes nettes maximales d'un membre sur 24 h (0 = sans limite). */
  dailyLossMax: number;
  minAccountDays: number;
  /** Partie gratuite quotidienne : mise fictive et gain maximal (aucun point n'est débité). */
  dailyFree: { enabled: boolean; stake: number; maxWin: number };
  /** Une partie sans activité depuis ce nombre de minutes est réglée d'office (remboursée si aucune réponse, sinon encaissée). */
  idleMinutes: number;
}

export const DEFAULT_HILO: Config = {
  enabled: true, minStake: 5, maxStake: 100, edge: 0.05, maxWin: 5000, dailyLossMax: 1000, minAccountDays: 7,
  dailyFree: { enabled: true, stake: 10, maxWin: 100 }, idleMinutes: 30,
};

/** Multiplicateur d'une réponse, en centièmes (103 = ×1,03), arrondi vers le bas ; null si la réponse est impossible. */
export function stepHundredths(rank: number, guess: Guess, edge: number): number | null {
  const p = probability(rank, guess);
  if (p <= 0) return null;
  return Math.max(101, Math.floor(((1 - edge) / p) * 100 + 1e-9));
}

/** Nouveau multiplicateur cumulé (en dix-millièmes, 10 000 = ×1), arrondi vers le bas. */
export const nextMultBp = (multBp: number, stepH: number): number => Math.floor((multBp * stepH) / 100);

/** Points rendus pour une mise et un multiplicateur cumulé, plafonnés. */
export const payoutOf = (stake: number, multBp: number, maxWin = 0): number => {
  const p = Math.floor((stake * multBp) / 10_000);
  return maxWin > 0 ? Math.min(p, maxWin) : p;
};

/** La réponse est-elle gagnante pour cette carte suivante ? Une égalité fait perdre. */
export function isWin(currentRank: number, nextRank: number, guess: Guess): boolean {
  return guess === 'H' ? nextRank > currentRank : nextRank < currentRank;
}

/** Les deux réponses possibles depuis une carte, avec leur probabilité et leur multiplicateur (null : impossible). */
export function odds(rank: number, edge: number): Record<Guess, { p: number; mult: number } | null> {
  const one = (g: Guess) => { const h = stepHundredths(rank, g, edge); return h === null ? null : { p: probability(rank, g), mult: h / 100 }; };
  return { H: one('H'), L: one('L') };
}

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Réglages valides ; une valeur absente ou hors limites garde l'ancienne. La marge est de 1 % à 30 % : la maison reste toujours gagnante. */
export function normalizeHiLo(raw: any, previous: Config = DEFAULT_HILO): Config {
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
    idleMinutes: int(r.idleMinutes, 5, 1440, previous.idleMinutes),
  };
}
