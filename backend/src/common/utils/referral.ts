/**
 * Parrainage : le membre qui invite quelqu'un reçoit une prime en points bonus quand cette personne devient un vrai membre (assez d'ancienneté et un rang suffisant), pas dès l'inscription :
 * inviter une coquille vide ne rapporte rien. Logique pure (réglages et conditions), testée.
 */
export interface ReferralConfig {
  enabled: boolean;
  /** Points bonus versés à celui qui a invité. */
  rewardPoints: number;
  /** Jours d'ancienneté du nouveau membre avant la prime. */
  minDays: number;
  /** Rang minimum du nouveau membre. */
  minClass: 'MEMBRE' | 'POWER_USER' | 'ELITE' | 'VETERAN';
  /** Primes versées au plus par membre et par mois (freine les comptes multiples). */
  maxPerMonth: number;
}

export const DEFAULT_REFERRAL: ReferralConfig = { enabled: true, rewardPoints: 500, minDays: 14, minClass: 'MEMBRE', maxPerMonth: 5 };

export const CLASS_ORDER = ['NOUVEAU', 'MEMBRE', 'POWER_USER', 'ELITE', 'VETERAN'] as const;
export const classAtLeast = (cls: string, min: string): boolean => CLASS_ORDER.indexOf(cls as any) >= CLASS_ORDER.indexOf(min as any) && CLASS_ORDER.indexOf(cls as any) >= 0;

const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

export function normalizeReferral(raw: any): ReferralConfig {
  const d = DEFAULT_REFERRAL;
  return {
    enabled: raw?.enabled === undefined ? d.enabled : raw.enabled === true,
    rewardPoints: int(raw?.rewardPoints, d.rewardPoints, 0, 100_000),
    minDays: int(raw?.minDays, d.minDays, 0, 365),
    minClass: (['MEMBRE', 'POWER_USER', 'ELITE', 'VETERAN'] as const).includes(raw?.minClass) ? raw.minClass : d.minClass,
    maxPerMonth: int(raw?.maxPerMonth, d.maxPerMonth, 1, 100),
  };
}

export interface InviteeState { createdAt: Date; memberClass: string; status: string }

/** Où en est un invité : prime obtenue, conditions remplies, ou ce qu'il lui manque (jours et rang). */
export function inviteeProgress(u: InviteeState & { rewarded: boolean }, cfg: ReferralConfig, now = new Date()): { state: 'rewarded' | 'ready' | 'waiting' | 'inactive'; daysLeft: number; classOk: boolean } {
  const age = Math.floor((now.getTime() - u.createdAt.getTime()) / 86_400_000);
  const daysLeft = Math.max(0, cfg.minDays - age);
  const classOk = classAtLeast(u.memberClass, cfg.minClass);
  if (u.rewarded) return { state: 'rewarded', daysLeft: 0, classOk };
  if (u.status !== 'ACTIVE') return { state: 'inactive', daysLeft, classOk };
  return { state: daysLeft === 0 && classOk ? 'ready' : 'waiting', daysLeft, classOk };
}

/** Début du mois courant (UTC), pour le plafond mensuel de primes. */
export const monthStart = (now = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
