/**
 * Membres fondateurs : les membres de la bêta qui ont aidé à bâtir le site. Statut « Fondateur » (pseudo en or brillant, badge, mur des fondateurs) et avantages
 * qui restent surtout symboliques ou pratiques, sans casser l'économie du site. Le staff valide chaque fondateur (Admin > Fondateurs) : le site propose les candidats.
 */
export const FOUNDER = {
  /** Points bonus gagnés en seedant : un petit plus permanent (+5 %). */
  bonusMultiplier: 1.05,
  /** Invitations ouvertes en plus de celles de son rang. */
  extraInvites: 3,
  /** Jetons freeleech offerts chaque année (et à l'arrivée du statut). */
  yearlyTokens: 3,
};

/** Les cinq critères d'activité, dans l'ordre d'affichage. */
export const FOUNDER_CRITERIA = ['loginDays', 'posts', 'uploads', 'feedback', 'seedHours'] as const;
export type FounderCriterion = (typeof FOUNDER_CRITERIA)[number];

export const CRITERIA_LABELS: Record<FounderCriterion, { label: string; unit: string }> = {
  loginDays: { label: 'Jours de connexion différents', unit: 'jours' },
  posts: { label: 'Messages au forum et commentaires', unit: 'messages' },
  uploads: { label: 'Torrents envoyés (approuvés)', unit: 'torrents' },
  feedback: { label: 'Suggestions et billets de support (retours de bêta)', unit: 'retours' },
  seedHours: { label: 'Temps de seed cumulé', unit: 'heures' },
};

export interface FoundersConfig {
  /** Fin de la bêta : seuls les comptes créés avant cet instant (ISO) peuvent être fondateurs. */
  cutoff: string;
  /** Nombre de critères d'activité à remplir parmi les cinq. */
  minCriteria: number;
  /** Le membre doit avoir été vu dans les N derniers jours (0 = ne pas vérifier). */
  activeDays: number;
  loginDays: number;
  posts: number;
  uploads: number;
  feedback: number;
  seedHours: number;
}

export const FOUNDERS_KEY = 'founders';
/** La bêta se termine le 22 novembre 2026 (minuit, heure de Montréal, ce soir-là) : tout compte créé avant est de la bêta. */
export const DEFAULT_FOUNDERS_CONFIG: FoundersConfig = { cutoff: '2026-11-23T05:00:00.000Z', minCriteria: 2, activeDays: 60, loginDays: 5, posts: 5, uploads: 1, feedback: 1, seedHours: 24 };

const num = (v: unknown, fallback: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : fallback;
};

export function normalizeFoundersConfig(raw: unknown, previous: FoundersConfig = DEFAULT_FOUNDERS_CONFIG): FoundersConfig {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cutoff = typeof r.cutoff === 'string' && !Number.isNaN(new Date(r.cutoff).getTime()) ? new Date(r.cutoff).toISOString() : previous.cutoff;
  return {
    cutoff,
    minCriteria: Math.max(1, Math.min(5, num(r.minCriteria, previous.minCriteria, 5))),
    activeDays: num(r.activeDays, previous.activeDays, 3650),
    loginDays: num(r.loginDays, previous.loginDays, 10_000),
    posts: num(r.posts, previous.posts, 100_000),
    uploads: num(r.uploads, previous.uploads, 100_000),
    feedback: num(r.feedback, previous.feedback, 100_000),
    seedHours: num(r.seedHours, previous.seedHours, 1_000_000),
  };
}

export interface FounderMetrics { loginDays: number; posts: number; uploads: number; feedback: number; seedHours: number; lastSeenAt: Date | null }

export interface FounderVerdict {
  /** Critères remplis. */
  met: FounderCriterion[];
  /** Vu récemment (ou vérification désactivée). */
  recent: boolean;
  /** Remplit assez de critères ET a été vu récemment. */
  eligible: boolean;
}

/** Ce membre mérite-t-il le statut ? Un critère à 0 dans les réglages est toujours rempli ; il faut `minCriteria` critères sur cinq et une présence récente. */
export function evaluateFounder(m: FounderMetrics, cfg: FoundersConfig, now: Date = new Date()): FounderVerdict {
  const met = FOUNDER_CRITERIA.filter((c) => cfg[c] > 0 && m[c] >= cfg[c]);
  const recent = cfg.activeDays <= 0 || (!!m.lastSeenAt && now.getTime() - m.lastSeenAt.getTime() <= cfg.activeDays * 86_400_000);
  return { met, recent, eligible: met.length >= cfg.minCriteria && recent };
}

/** Un fondateur ne descend jamais de rang à cause d'une inactivité (rangs numérotés du plus bas au plus haut). */
export const keepFounderRank = (isFounder: boolean, currentRank: number, nextRank: number): boolean => isFounder && nextRank < currentRank;

/** Nouveau pseudo (un changement gratuit pour les fondateurs) : renvoie le message d'erreur, ou null si le pseudo est acceptable. */
export function usernameProblem(name: string): string | null {
  const n = String(name ?? '').trim();
  if (n.length < 3 || n.length > 24) return 'Le pseudo doit faire entre 3 et 24 caractères';
  if (!/^[\p{L}\p{N}_.-]+$/u.test(n)) return 'Le pseudo ne peut contenir que des lettres, des chiffres, « _ », « . » et « - »';
  if (/^(admin|staff|support|seeduction|system|systeme|moderat)/i.test(n)) return 'Ce pseudo est réservé';
  return null;
}
