/**
 * Mise en page de l'accueil d'un membre (« Tableau de bord ») : ce qui s'affiche, dans quel ordre, et ce qui est réduit. Mémorisée sur son compte pour la retrouver
 * sur chaque appareil. Les sections sont désignées par leur identifiant (lettres minuscules, chiffres et tirets) ; un identifiant inconnu est simplement ignoré à l'affichage.
 * NB : une copie de ces valeurs existe côté navigateur (frontend/src/lib/homeLayout.ts) ; garder les deux alignés.
 */
export interface HomeLayout {
  /** Ordre voulu des sections ; celles qui n'y sont pas suivent dans l'ordre d'origine. */
  order: string[];
  /** Sections cachées. */
  hidden: string[];
  /** Sections réduites (une fine barre avec leur nom). */
  collapsed: string[];
  /** Petites cartes des nouvelles précédentes, sous la dernière nouvelle. */
  prevNews: boolean;
}

export const DEFAULT_HOME_LAYOUT: HomeLayout = { order: [], hidden: [], collapsed: [], prevNews: true };

const ID = /^[a-z0-9-]{1,40}$/;
const ids = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && ID.test(x) && !out.includes(x)) out.push(x);
    if (out.length >= 60) break;
  }
  return out;
};

/** Réglages reçus (formulaire ou stockage) → valeurs sûres ; ce qui manque ou n'est pas valide prend la valeur par défaut. */
export function normalizeHomeLayout(raw: unknown): HomeLayout {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { order: ids(r.order), hidden: ids(r.hidden), collapsed: ids(r.collapsed), prevNews: r.prevNews !== false };
}
