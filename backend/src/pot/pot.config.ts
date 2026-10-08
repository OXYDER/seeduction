/**
 * Réglages du pot commun (« Le Pot du Plaisir »), modifiables par les administrateurs (Admin > Pot commun) et rangés dans les réglages du site.
 * Chaque valeur est bornée : une saisie absurde est ramenée dans des limites raisonnables au lieu d'être refusée.
 */
/** Palier : récompense intermédiaire débloquée quand le pot atteint ce pourcentage de son objectif (la récompense finale, elle, se déclenche à 100 %). */
export interface PotTier {
  atPct: number;
  freeleechHours: number;
  doubleUploadHours: number;
  /** Jetons freeleech pour chaque donateur du cycle jusque-là. */
  tokens: number;
  /** Points offerts à chaque membre actif. */
  rainPoints: number;
}

export interface PotConfig {
  enabled: boolean;
  name: string;
  icon: string;

  // ---- objectif et dons
  /** Points bonus nécessaires pour remplir le pot. */
  goal: number;
  /** Si > 0 : l'objectif des pots suivants = ce montant × le nombre de membres actifs (30 jours), jamais moins que « goal ». */
  goalPerMember: number;
  /** Pourcentage d'augmentation de l'objectif à chaque remplissage (ignoré si « goalPerMember » est utilisé). */
  goalGrowthPct: number;
  minDonation: number;
  /** Plafond par don (0 = aucun). */
  maxDonation: number;
  /** Plafond par membre sur 24 h glissantes (0 = aucun). */
  dailyLimit: number;
  /** Ancienneté minimale du compte pour donner (0 = aucune) : évite les comptes jetables. */
  minAccountDays: number;
  /** L'excédent du dernier don reste dans le pot suivant ; sinon le dernier don est limité à ce qui manque. */
  carryOver: boolean;

  // ---- récompenses (chacune a sa propre durée)
  /** Freeleech global quand le pot est plein. */
  freeleechEnabled: boolean;
  /** Durée du freeleech global, en heures (jusqu'à 30 jours). */
  rewardHours: number;
  /** Double upload global en plus du freeleech. */
  doubleUpload: boolean;
  /** Durée du double upload, en heures (0 = la même que le freeleech). */
  doubleUploadHours: number;
  /** Remplissage rapide : si le pot est plein en moins de X heures (0 = désactivé)… */
  fastFillHours: number;
  /** …les récompenses durent ce nombre d'heures de plus. */
  fastFillBonusHours: number;
  /** Jetons freeleech offerts à chaque donateur du cycle. */
  rewardTokens: number;
  /** Pluie de points : points offerts à chaque membre actif (vu ces 7 derniers jours) quand le pot est plein. */
  rainPoints: number;
  /** Pourcentage des dons rendu en points bonus à chaque donateur quand le pot se remplit. */
  donorRefundPct: number;
  /** Points offerts au meilleur donateur du cycle (le 2e reçoit 60 %, le 3e 30 %). */
  topDonorBonus: number;

  /** Paliers intermédiaires (jusqu'à 6), en plus de la récompense finale à 100 %. */
  tiers: PotTier[];

  // ---- départ de la récompense
  /** Lancer tout seul au remplissage ; sinon un administrateur valide le lancement. */
  autoStart: boolean;
  /** Délai entre le remplissage et le début de la récompense (le temps de prévenir tout le monde). */
  startDelayHours: number;
  /** Heure fixe de départ (0-23, heure de Montréal/Toronto) ; -1 = dès que possible. */
  startAtHour: number;
  /** Délai minimum entre la fin d'une récompense du pot et le début de la suivante. */
  cooldownHours: number;

  // ---- communication
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
  goalPerMember: 0,
  goalGrowthPct: 0,
  minDonation: 10,
  maxDonation: 0,
  dailyLimit: 0,
  minAccountDays: 0,
  carryOver: true,
  freeleechEnabled: true,
  rewardHours: 24,
  doubleUpload: false,
  doubleUploadHours: 0,
  fastFillHours: 0,
  fastFillBonusHours: 0,
  rewardTokens: 0,
  rainPoints: 0,
  donorRefundPct: 0,
  topDonorBonus: 0,
  tiers: [],
  autoStart: true,
  startDelayHours: 0,
  startAtHour: -1,
  cooldownHours: 0,
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

function normalizeTiers(v: unknown, d: PotTier[]): PotTier[] {
  if (!Array.isArray(v)) return d;
  const seen = new Set<number>();
  const out: PotTier[] = [];
  for (const t of v.slice(0, 6)) {
    const n = Math.floor(Number(t?.atPct));
    if (!(n >= 1 && n <= 99)) continue; // un pourcentage hors de 1 à 99 est ignoré (pas ramené à 99)
    const atPct = n;
    if (seen.has(atPct)) continue;
    const tier: PotTier = { atPct, freeleechHours: int(t?.freeleechHours, 0, 720, 0), doubleUploadHours: int(t?.doubleUploadHours, 0, 720, 0), tokens: int(t?.tokens, 0, 50, 0), rainPoints: int(t?.rainPoints, 0, 100_000, 0) };
    if (tier.freeleechHours + tier.doubleUploadHours + tier.tokens + tier.rainPoints === 0) continue; // un palier sans récompense n'a pas d'intérêt
    seen.add(atPct);
    out.push(tier);
  }
  return out.sort((a, b) => a.atPct - b.atPct);
}

/** Durée maximale d'une récompense : 30 jours. */
export const MAX_REWARD_HOURS = 720;

/** Fusionne une saisie (partielle ou non) avec les réglages actuels, en bornant chaque valeur. */
export function normalizePotConfig(raw: any, base: PotConfig = DEFAULT_POT): PotConfig {
  const goal = int(raw?.goal, 100, 100_000_000, base.goal);
  return {
    enabled: bool(raw?.enabled, base.enabled),
    name: text(raw?.name, 40, base.name) || DEFAULT_POT.name,
    icon: text(raw?.icon, 8, base.icon) || DEFAULT_POT.icon,
    goal,
    goalPerMember: int(raw?.goalPerMember, 0, 1_000_000, base.goalPerMember),
    goalGrowthPct: int(raw?.goalGrowthPct, 0, 100, base.goalGrowthPct),
    minDonation: int(raw?.minDonation, 1, goal, Math.min(base.minDonation, goal)),
    maxDonation: int(raw?.maxDonation, 0, goal, Math.min(base.maxDonation, goal)),
    dailyLimit: int(raw?.dailyLimit, 0, 10_000_000, base.dailyLimit),
    minAccountDays: int(raw?.minAccountDays, 0, 365, base.minAccountDays),
    carryOver: bool(raw?.carryOver, base.carryOver),
    freeleechEnabled: bool(raw?.freeleechEnabled, base.freeleechEnabled),
    rewardHours: int(raw?.rewardHours, 1, MAX_REWARD_HOURS, base.rewardHours),
    doubleUpload: bool(raw?.doubleUpload, base.doubleUpload),
    doubleUploadHours: int(raw?.doubleUploadHours, 0, MAX_REWARD_HOURS, base.doubleUploadHours),
    fastFillHours: int(raw?.fastFillHours, 0, MAX_REWARD_HOURS, base.fastFillHours),
    fastFillBonusHours: int(raw?.fastFillBonusHours, 0, MAX_REWARD_HOURS, base.fastFillBonusHours),
    rewardTokens: int(raw?.rewardTokens, 0, 50, base.rewardTokens),
    rainPoints: int(raw?.rainPoints, 0, 100_000, base.rainPoints),
    donorRefundPct: int(raw?.donorRefundPct, 0, 100, base.donorRefundPct),
    topDonorBonus: int(raw?.topDonorBonus, 0, 1_000_000, base.topDonorBonus),
    tiers: normalizeTiers(raw?.tiers, base.tiers),
    autoStart: bool(raw?.autoStart, base.autoStart),
    startDelayHours: int(raw?.startDelayHours, 0, 72, base.startDelayHours),
    startAtHour: int(raw?.startAtHour, -1, 23, base.startAtHour),
    cooldownHours: int(raw?.cooldownHours, 0, MAX_REWARD_HOURS, base.cooldownHours),
    announce: bool(raw?.announce, base.announce),
    milestones: bool(raw?.milestones, base.milestones),
    message: text(raw?.message, 2000, base.message),
  };
}

/** Prochaine heure pleine (à partir de `from`, incluse si déjà pile) dont l'heure à Montréal/Toronto vaut `hour`. */
export function nextAtHour(from: Date, hour: number): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', { hour: '2-digit', hour12: false, timeZone: 'America/Toronto' });
  const t = new Date(Math.ceil(from.getTime() / 3600_000) * 3600_000);
  for (let i = 0; i < 26; i++) {
    const h = Number(fmt.format(t)) % 24;
    if (h === hour) return t;
    t.setTime(t.getTime() + 3600_000);
  }
  return from;
}
