/**
 * Mise-O-jeu : règles pures (sans base de données) des paris et pronostics sur les matchs du Canadien.
 *
 * Caisse commune : les gagnants d'un pari se partagent les mises de tous les participants à ce pari. Le site ne crée aucun point
 * pour les mises ; seuls les pronostics gratuits rapportent une petite récompense fixe, avec un plafond par semaine.
 */

export type Market = 'WIN' | 'MODE' | 'SCORE';
export const MARKETS: Market[] = ['WIN', 'MODE', 'SCORE'];

export const MARKET_LABELS: Record<Market, string> = { WIN: 'Vainqueur', MODE: 'Fin du match', SCORE: 'Score exact' };
export const MODE_LABELS: Record<string, string> = { REG: 'Temps réglementaire', OT: 'Prolongation', SO: 'Tirs de barrage' };

export interface MojConfig {
  enabled: boolean;
  /** Mise minimale et maximale par pari (points). */
  minStake: number;
  maxStake: number;
  /** Total qu'un membre peut miser sur 24 heures (0 = sans limite). */
  dailyStakeMax: number;
  /** Nombre minimal de joueurs différents sur un pari : en dessous, les mises sont remboursées. */
  minPlayers: number;
  /** Ancienneté minimale du compte pour jouer (jours). */
  minAccountDays: number;
  /** Les paris ouvrent ce nombre de jours avant le match. */
  openDaysBefore: number;
  /** Récompense d'un pronostic gratuit réussi, par type de pari. */
  freePrize: Record<Market, number>;
  /** Total de récompenses gratuites qu'un membre peut gagner sur 7 jours. */
  freeWeeklyCap: number;
  /** Types de paris proposés. */
  markets: Record<Market, boolean>;
  /** Matchs de pré-saison ouverts aux paris. */
  preseason: boolean;
}

export const DEFAULT_MOJ: MojConfig = {
  enabled: true, minStake: 10, maxStake: 500, dailyStakeMax: 1500, minPlayers: 2, minAccountDays: 7, openDaysBefore: 7,
  freePrize: { WIN: 10, MODE: 15, SCORE: 40 }, freeWeeklyCap: 100,
  markets: { WIN: true, MODE: true, SCORE: true }, preseason: false,
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Réglages valides ; une valeur absente ou hors limites garde l'ancienne (ou celle par défaut). */
export function normalizeMojConfig(raw: any, previous: MojConfig = DEFAULT_MOJ): MojConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const minStake = int(r.minStake, 1, 100_000, previous.minStake);
  const maxStake = Math.max(minStake, int(r.maxStake, 1, 1_000_000, previous.maxStake));
  const prize = (m: Market) => int(r.freePrize?.[m], 0, 10_000, previous.freePrize[m]);
  const on = (m: Market) => (typeof r.markets?.[m] === 'boolean' ? (r.markets[m] as boolean) : previous.markets[m]);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    minStake, maxStake,
    dailyStakeMax: int(r.dailyStakeMax, 0, 10_000_000, previous.dailyStakeMax),
    minPlayers: int(r.minPlayers, 2, 100, previous.minPlayers),
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
    openDaysBefore: int(r.openDaysBefore, 1, 30, previous.openDaysBefore),
    freePrize: { WIN: prize('WIN'), MODE: prize('MODE'), SCORE: prize('SCORE') },
    freeWeeklyCap: int(r.freeWeeklyCap, 0, 1_000_000, previous.freeWeeklyCap),
    markets: { WIN: on('WIN'), MODE: on('MODE'), SCORE: on('SCORE') },
    preseason: typeof r.preseason === 'boolean' ? r.preseason : previous.preseason,
  };
}

/** Un choix est-il valable pour ce type de pari ? (WIN : W ou L ; MODE : REG, OT ou SO ; SCORE : « nous-eux », de 0 à 15 buts.) */
export function validPick(market: Market, pick: unknown): pick is string {
  if (typeof pick !== 'string') return false;
  if (market === 'WIN') return pick === 'W' || pick === 'L';
  if (market === 'MODE') return pick === 'REG' || pick === 'OT' || pick === 'SO';
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(pick);
  return !!m && Number(m[1]) <= 15 && Number(m[2]) <= 15;
}

/** Mode de fin de match à partir du libellé donné par la LNH (« Final (prolongation) »...). */
export function modeOf(outcome: string | null | undefined): 'REG' | 'OT' | 'SO' {
  const o = (outcome ?? '').toLowerCase();
  if (o.includes('tirs')) return 'SO';
  if (o.includes('prolong')) return 'OT';
  return 'REG';
}

export interface FinalResult { mine: number; theirs: number; mode: 'REG' | 'OT' | 'SO' }

/** Le choix gagnant de chaque type de pari, d'après le résultat final. */
export function winningPicks(r: FinalResult): Record<Market, string> {
  return { WIN: r.mine > r.theirs ? 'W' : 'L', MODE: r.mode, SCORE: `${r.mine}-${r.theirs}` };
}

export interface PaidBet { id: string; userId: string; stake: number; pick: string }
export interface Settlement {
  /** Points rendus à chaque pari (pari perdu : absent). */
  payouts: Map<string, number>;
  /** Pourquoi les mises sont remboursées, ou null si la caisse a été partagée. */
  refund: null | 'players' | 'no-winner' | 'no-loser';
}

/**
 * Partage la caisse d'un type de pari. Les gagnants reçoivent la caisse entière au prorata de leur mise (méthode du plus fort reste :
 * pas un point perdu ni créé). Les mises sont remboursées si trop peu de joueurs ont participé, si personne n'a gagné, ou si tout le monde a gagné.
 */
export function settleMarket(paid: PaidBet[], winningPick: string, minPlayers: number): Settlement {
  const payouts = new Map<string, number>();
  const refundAll = (refund: Settlement['refund']): Settlement => {
    for (const b of paid) payouts.set(b.id, b.stake);
    return { payouts, refund };
  };
  if (paid.length === 0) return { payouts, refund: null };
  if (new Set(paid.map((b) => b.userId)).size < minPlayers) return refundAll('players');
  const winners = paid.filter((b) => b.pick === winningPick);
  if (winners.length === 0) return refundAll('no-winner');
  if (winners.length === paid.length) return refundAll('no-loser');

  const pool = paid.reduce((s, b) => s + b.stake, 0);
  const winStake = winners.reduce((s, b) => s + b.stake, 0);
  const shares = winners.map((b) => { const exact = (pool * b.stake) / winStake; return { b, base: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = pool - shares.reduce((s, x) => s + x.base, 0);
  const byRest = [...shares].sort((a, b) => b.rest - a.rest || b.b.stake - a.b.stake || a.b.id.localeCompare(b.b.id));
  for (const x of byRest) { if (left <= 0) break; x.base += 1; left -= 1; }
  for (const x of shares) payouts.set(x.b.id, x.base);
  return { payouts, refund: null };
}

/** Estimation de ce qu'un nouveau pari gagnerait si ce choix l'emporte, d'après la caisse actuelle (affichée aux membres avant de miser). */
export function estimatePayout(pool: number, pickTotal: number, stake: number): number {
  if (stake <= 0) return 0;
  return Math.floor(((pool + stake) * stake) / (pickTotal + stake));
}

/** Récompense d'un pronostic gratuit réussi, limitée par ce que le membre peut encore gagner cette semaine. */
export function freePrize(config: MojConfig, market: Market, wonThisWeek: number): number {
  return Math.max(0, Math.min(config.freePrize[market], config.freeWeeklyCap - wonThisWeek));
}
