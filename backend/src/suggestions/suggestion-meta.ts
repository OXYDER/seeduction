// Suggestions des membres : catégories, statuts et règles pures (testées à part).

export const SUGGESTION_CATEGORIES = [
  { id: 'SITE', icon: '🖥️', label: 'Site et interface' },
  { id: 'TORRENTS', icon: '🎬', label: 'Torrents et fiches' },
  { id: 'CHAT', icon: '💬', label: 'Messagerie et chat' },
  { id: 'PLAYER', icon: '▶️', label: 'Lecteur' },
  { id: 'COMMUNITY', icon: '👥', label: 'Forum et communauté' },
  { id: 'ECONOMY', icon: '🎁', label: 'Ratio, bonus et pot commun' },
  { id: 'OTHER', icon: '✨', label: 'Autre' },
] as const;

export const SUGGESTION_STATUSES = [
  { id: 'OPEN', icon: '💡', label: 'Proposée' },
  { id: 'REVIEW', icon: '🔎', label: "À l'étude" },
  { id: 'PLANNED', icon: '🗓️', label: 'Planifiée' },
  { id: 'PROGRESS', icon: '🛠️', label: 'En cours' },
  { id: 'DONE', icon: '✅', label: 'Réalisée' },
  { id: 'DECLINED', icon: '⛔', label: 'Refusée' },
  { id: 'DUPLICATE', icon: '🔁', label: 'Doublon' },
] as const;

export type SuggestionStatus = typeof SUGGESTION_STATUSES[number]['id'];

/** Suggestions encore « vivantes » : on peut voter. */
export const ACTIVE_STATUSES: SuggestionStatus[] = ['OPEN', 'REVIEW', 'PLANNED', 'PROGRESS'];
export const CLOSED_STATUSES: SuggestionStatus[] = ['DECLINED', 'DUPLICATE'];

export const isCategory = (v: unknown): v is typeof SUGGESTION_CATEGORIES[number]['id'] => SUGGESTION_CATEGORIES.some((c) => c.id === v);
export const isStatus = (v: unknown): v is SuggestionStatus => SUGGESTION_STATUSES.some((s) => s.id === v);
export const statusLabel = (id: string) => SUGGESTION_STATUSES.find((s) => s.id === id)?.label ?? id;

export const LIMITS = {
  titleMin: 8, titleMax: 120, bodyMin: 20, bodyMax: 4000, commentMin: 2, commentMax: 2000, noteMax: 600,
  perDay: 3, openPerMember: 15, commentsPerHour: 20,
  defaultThreshold: 10, thresholdMin: 2, thresholdMax: 500,
} as const;

/** Mots significatifs d'un texte (au moins 4 lettres, sans accents) : sert à retrouver les suggestions qui se ressemblent avant d'en créer une. */
export function keywordsOf(text: string, max = 6): string[] {
  const stop = new Set(['pour', 'dans', 'avec', 'plus', 'sans', 'sont', 'cette', 'comme', 'mais', 'tout', 'faire', 'avoir', 'etre', 'serait', 'pourrait', 'aussi', 'très', 'tres', 'site', 'ajouter', 'possibilite', 'possibilité']);
  const words = (text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set(words)].slice(0, max);
}

/** Note de ressemblance : nombre de mots significatifs de la recherche retrouvés dans la suggestion (le titre compte double). */
export function similarityScore(words: string[], s: { title: string; body: string }): number {
  const title = s.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const body = s.body.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return words.reduce((n, w) => n + (title.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0), 0);
}

/** Progression vers le seuil qui fait passer une suggestion « à l'étude » (0 à 100). */
export const progressToThreshold = (votes: number, threshold: number) => Math.max(0, Math.min(100, Math.round((votes / Math.max(1, threshold)) * 100)));
