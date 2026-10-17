/**
 * Remise de fidélité des jeux contre la maison : chaque matin, une part des pertes nettes de la veille (tous les jeux confondus : machines à sous, Plus haut ou
 * plus bas...) est rendue au membre, au-delà d'un seuil et avec un maximum. Les membres se sentent ainsi soutenus quand la chance tourne mal.
 */
export interface CashbackConfig {
  enabled: boolean;
  /** Part des pertes nettes rendue (0,1 = 10 %). */
  rate: number;
  /** Pertes nettes minimales de la veille pour avoir droit à la remise. */
  minLoss: number;
  /** Remise maximale par membre et par jour. */
  maxPerDay: number;
}

export const DEFAULT_CASHBACK: CashbackConfig = { enabled: true, rate: 0.1, minLoss: 50, maxPerDay: 200 };

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeCashback(raw: any, previous: CashbackConfig = DEFAULT_CASHBACK): CashbackConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rate = Number(r.rate);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    rate: Number.isFinite(rate) && rate >= 0 && rate <= 0.5 ? Math.round(rate * 1000) / 1000 : previous.rate,
    minLoss: int(r.minLoss, 0, 1_000_000, previous.minLoss),
    maxPerDay: int(r.maxPerDay, 0, 1_000_000, previous.maxPerDay),
  };
}

/** Remise due pour des pertes nettes (0 si le seuil n'est pas atteint). */
export function cashbackFor(lost: number, cfg: CashbackConfig): number {
  if (!cfg.enabled || cfg.rate <= 0 || lost < Math.max(1, cfg.minLoss)) return 0;
  return Math.min(cfg.maxPerDay, Math.floor(lost * cfg.rate));
}
