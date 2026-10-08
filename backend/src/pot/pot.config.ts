/**
 * Réglages du pot commun (« Le Pot du Plaisir »), modifiables par les administrateurs (Admin > Pot commun) et rangés dans les réglages du site.
 * Chaque valeur est bornée : une saisie absurde est ramenée dans des limites raisonnables au lieu d'être refusée.
 */
export interface PotConfig {
  enabled: boolean;
  name: string;
  icon: string;
  /** Points bonus nécessaires pour remplir le pot. */
  goal: number;
  minDonation: number;
  /** Plafond par don (0 = aucun). */
  maxDonation: number;
  /** Plafond par membre sur 24 h glissantes (0 = aucun). */
  dailyLimit: number;
  /** Durée du freeleech global déclenché quand le pot est plein. */
  rewardHours: number;
  /** Double upload global pendant la même période, en plus du freeleech. */
  doubleUpload: boolean;
  /** Délai entre le remplissage et le début de la récompense (le temps de prévenir tout le monde). */
  startDelayHours: number;
  /** Lancer tout seul au remplissage ; sinon un administrateur valide le lancement. */
  autoStart: boolean;
  /** L'excédent du dernier don reste dans le pot suivant ; sinon le dernier don est limité à ce qui manque. */
  carryOver: boolean;
  /** L'objectif du pot suivant augmente de ce pourcentage à chaque remplissage. */
  goalGrowthPct: number;
  /** Pourcentage des dons rendu en points bonus à chaque donateur quand le pot se remplit. */
  donorRefundPct: number;
  /** Points offerts au meilleur donateur du cycle (le 2e reçoit 60 %, le 3e 30 %). */
  topDonorBonus: number;
  /** Publier une annonce et prévenir tous les membres quand le pot est plein. */
  announce: boolean;
  /** Prévenir tous les membres aux paliers de 50 % et 90 %. */
  milestones: boolean;
  /** Message (BBCode) affiché pendant la récompense, dans le bandeau « freeleech ». */
  message: string;
}

export const DEFAULT_POT: PotConfig = {
  enabled: false,
  name: 'Le Pot du Plaisir',
  icon: '🍯',
  goal: 50_000,
  minDonation: 10,
  maxDonation: 0,
  dailyLimit: 0,
  rewardHours: 24,
  doubleUpload: false,
  startDelayHours: 0,
  autoStart: true,
  carryOver: true,
  goalGrowthPct: 0,
  donorRefundPct: 0,
  topDonorBonus: 0,
  announce: true,
  milestones: false,
  message: '',
};

const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const text = (v: unknown, max: number, d: string) => (typeof v === 'string' ? v.trim().slice(0, max) : d);

/** Fusionne une saisie (partielle ou non) avec les réglages actuels, en bornant chaque valeur. */
export function normalizePotConfig(raw: any, base: PotConfig = DEFAULT_POT): PotConfig {
  const goal = int(raw?.goal, 100, 100_000_000, base.goal);
  return {
    enabled: bool(raw?.enabled, base.enabled),
    name: text(raw?.name, 40, base.name) || DEFAULT_POT.name,
    icon: text(raw?.icon, 8, base.icon) || DEFAULT_POT.icon,
    goal,
    minDonation: int(raw?.minDonation, 1, goal, Math.min(base.minDonation, goal)),
    maxDonation: int(raw?.maxDonation, 0, goal, Math.min(base.maxDonation, goal)),
    dailyLimit: int(raw?.dailyLimit, 0, 10_000_000, base.dailyLimit),
    rewardHours: int(raw?.rewardHours, 1, 168, base.rewardHours),
    doubleUpload: bool(raw?.doubleUpload, base.doubleUpload),
    startDelayHours: int(raw?.startDelayHours, 0, 72, base.startDelayHours),
    autoStart: bool(raw?.autoStart, base.autoStart),
    carryOver: bool(raw?.carryOver, base.carryOver),
    goalGrowthPct: int(raw?.goalGrowthPct, 0, 100, base.goalGrowthPct),
    donorRefundPct: int(raw?.donorRefundPct, 0, 100, base.donorRefundPct),
    topDonorBonus: int(raw?.topDonorBonus, 0, 1_000_000, base.topDonorBonus),
    announce: bool(raw?.announce, base.announce),
    milestones: bool(raw?.milestones, base.milestones),
    message: text(raw?.message, 2000, base.message),
  };
}
