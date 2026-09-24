/** Origines de production proposées à l'envoi et en filtre (qualité, langue et source ont déjà leurs propres champs). */
export const ORIGINS = ['Québec', 'France', 'Canada anglais', 'International'] as const;

export const normalizeOrigin = (value?: string | null): string | undefined => {
  const found = ORIGINS.find((o) => o.toLowerCase() === String(value ?? '').trim().toLowerCase());
  return found;
};
