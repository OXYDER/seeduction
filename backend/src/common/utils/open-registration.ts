/**
 * Inscriptions ouvertes sans code d'invitation (Admin > Invitations) : désactivées par défaut. Quand elles sont ouvertes, on peut quand même saisir un code
 * (le membre est alors compté comme invité par son auteur) ; sans code, des limites protègent le site contre les inscriptions en masse.
 */
export interface OpenRegistration {
  enabled: boolean;
  /** Inscriptions sans code permises par adresse IP et par 24 h (0 = aucune limite). */
  perIpPerDay: number;
  /** Inscriptions sans code permises au total par 24 h (0 = aucune limite). */
  maxPerDay: number;
}

export const OPEN_REGISTRATION_KEY = 'openRegistration';
export const DEFAULT_OPEN_REGISTRATION: OpenRegistration = { enabled: false, perIpPerDay: 3, maxPerDay: 200 };

const count = (v: unknown, fallback: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : fallback;
};

/** Réglages reçus (formulaire ou stockage) → valeurs sûres ; ce qui manque garde la valeur précédente. */
export function normalizeOpenRegistration(raw: unknown, previous: OpenRegistration = DEFAULT_OPEN_REGISTRATION): OpenRegistration {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    perIpPerDay: count(r.perIpPerDay, previous.perIpPerDay, 100),
    maxPerDay: count(r.maxPerDay, previous.maxPerDay, 10_000),
  };
}
