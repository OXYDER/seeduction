/** Réglages des dons (modifiables dans Admin > Dons) : liens de don, objectif mensuel, textes et paliers d'avantages. */

export interface DonationLink { label: string; url: string }
export interface DonationTier {
  /** Montant minimum (dans la devise du site) pour ce palier. */
  minAmount: number;
  label: string;
  /** Durée du statut « donateur » actif. */
  days: number;
  /** Freeleech personnel : les téléchargements du membre ne comptent pas dans son ratio. */
  freeleechDays: number;
  /** Hit & run désactivé : aucun torrent n'est compté comme abandonné pendant cette période. */
  hnrDays: number;
  bonusPoints: number;
  /** Invitations ouvertes en plus de celles de son rang, tant que le statut est actif. */
  invites: number;
}
export interface DonationConfig {
  enabled: boolean;
  currency: string;
  headline: string;
  text: string;
  howTo: string;
  links: DonationLink[];
  goalMonthly: number;
  tiers: DonationTier[];
}

export const DEFAULT_DONATION_CONFIG: DonationConfig = {
  enabled: true,
  currency: 'CAD',
  headline: 'Soutenir Seeduction',
  text: "Seeduction fonctionne grâce à la communauté : le serveur, le stockage et la bande passante ont un coût chaque mois. Un don, même petit, aide à garder le site rapide, stable et sans publicité. C'est entièrement facultatif : tout le site reste accessible à tous.",
  howTo: "1. Fais ton don avec un des liens ci-dessous. 2. Écris ton pseudo Seeduction dans le message du don. 3. L'équipe crédite ton don (en général dans la journée) : tes avantages s'activent tout seuls et tu reçois une notification.",
  links: [],
  goalMonthly: 60,
  tiers: [
    { minAmount: 5, label: 'Supporter', days: 30, freeleechDays: 7, hnrDays: 30, bonusPoints: 250, invites: 1 },
    { minAmount: 10, label: 'Soutien', days: 60, freeleechDays: 21, hnrDays: 60, bonusPoints: 600, invites: 2 },
    { minAmount: 25, label: 'Mécène', days: 180, freeleechDays: 60, hnrDays: 180, bonusPoints: 2000, invites: 3 },
    { minAmount: 50, label: 'Grand mécène', days: 365, freeleechDays: 120, hnrDays: 365, bonusPoints: 5000, invites: 5 },
  ],
};

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (v: unknown, max: number, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);

/** Nettoie une configuration reçue (ou lue en base) : valeurs bornées, liens http(s) seulement, paliers triés par montant. */
export function sanitizeDonationConfig(raw: any): DonationConfig {
  const d = DEFAULT_DONATION_CONFIG;
  const links: DonationLink[] = (Array.isArray(raw?.links) ? raw.links : d.links)
    .map((l: any) => ({ label: text(l?.label, 40), url: text(l?.url, 400) }))
    .filter((l: DonationLink) => l.label && /^https?:\/\/\S+$/i.test(l.url))
    .slice(0, 6);
  const tiers: DonationTier[] = (Array.isArray(raw?.tiers) ? raw.tiers : d.tiers)
    .map((t: any): DonationTier => ({
      minAmount: Math.round(num(t?.minAmount, 0.01, 100_000, 5) * 100) / 100,
      label: text(t?.label, 40, 'Donateur') || 'Donateur',
      days: Math.round(num(t?.days, 0, 3650, 30)),
      freeleechDays: Math.round(num(t?.freeleechDays, 0, 3650, 0)),
      hnrDays: Math.round(num(t?.hnrDays, 0, 3650, 0)),
      bonusPoints: Math.round(num(t?.bonusPoints, 0, 1_000_000, 0)),
      invites: Math.round(num(t?.invites, 0, 50, 0)),
    }))
    .sort((a: DonationTier, b: DonationTier) => a.minAmount - b.minAmount)
    .slice(0, 8);
  return {
    enabled: raw?.enabled === undefined ? d.enabled : raw.enabled !== false,
    currency: text(raw?.currency, 6, d.currency).toUpperCase() || d.currency,
    headline: text(raw?.headline, 80, d.headline) || d.headline,
    text: text(raw?.text, 2000, d.text),
    howTo: text(raw?.howTo, 1200, d.howTo),
    links,
    goalMonthly: Math.round(num(raw?.goalMonthly, 0, 1_000_000, d.goalMonthly) * 100) / 100,
    tiers,
  };
}

/** Le palier le plus haut dont le montant minimum est atteint (aucun si le don est sous le premier palier). */
export function tierFor(tiers: DonationTier[], amount: number): DonationTier | null {
  let best: DonationTier | null = null;
  for (const t of tiers) if (amount >= t.minAmount && (!best || t.minAmount >= best.minAmount)) best = t;
  return best;
}

/** Prolonge une date : à partir de la fin actuelle si elle est dans le futur, sinon à partir de maintenant. Sans jours, la date est inchangée. */
export function extendFrom(current: Date | null | undefined, now: Date, days: number): Date | null {
  if (days <= 0) return current ?? null;
  const start = current && current.getTime() > now.getTime() ? current : now;
  return new Date(start.getTime() + days * 86_400_000);
}
