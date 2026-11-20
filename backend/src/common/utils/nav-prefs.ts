/**
 * Réglages du menu de gauche d'un membre (Profil > Compte > Menu de gauche), mémorisés sur son compte pour le retrouver sur chaque appareil.
 * `extras` et `categories` valent `null` tant que le membre n'a pas choisi : « automatique » = affichés avec le style Groupes, cachés avec le style Classique.
 * NB : une copie du type et des valeurs par défaut existe côté navigateur (frontend/src/lib/navPrefs.ts) ; garder les deux alignés.
 */
export const NAV_STYLES = ['classic', 'groups'] as const;
export const NAV_SIZES = ['normal', 'large', 'xl'] as const;

export interface NavPrefs {
  /** Classique : la liste à plat de gros liens d'origine. Groupes : sections colorées repliables. */
  style: (typeof NAV_STYLES)[number];
  /** Taille des liens du menu. */
  size: (typeof NAV_SIZES)[number];
  /** Petites icônes devant chaque lien. */
  icons: boolean;
  /** Liens supplémentaires (Mes séries, Téléchargements en cours, Mon profil, chaque jeu...). null = automatique. */
  extras: boolean | null;
  /** Une entrée par catégorie principale (Films, Séries...) sous « Parcourir ». null = automatique. */
  categories: boolean | null;
  /** Style Groupes : toutes les sections ouvertes au départ. */
  openAll: boolean;
  /** Liens cachés (adresse de la page). */
  hidden: string[];
  /** Ordre voulu des liens (adresses) ; ceux qui n'y sont pas suivent dans l'ordre d'origine. */
  order: string[];
}

export const DEFAULT_NAV_PREFS: NavPrefs = { style: 'classic', size: 'large', icons: true, extras: null, categories: null, openAll: false, hidden: [], order: [] };

const cleanList = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.startsWith('/') && x.length <= 160 && !out.includes(x)) out.push(x);
    if (out.length >= 120) break;
  }
  return out;
};

/** Réglages reçus (formulaire ou stockage) → valeurs sûres ; ce qui manque ou n'est pas valide prend la valeur par défaut. */
export function normalizeNavPrefs(raw: unknown): NavPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tri = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  return {
    style: (NAV_STYLES as readonly unknown[]).includes(r.style) ? (r.style as NavPrefs['style']) : DEFAULT_NAV_PREFS.style,
    size: (NAV_SIZES as readonly unknown[]).includes(r.size) ? (r.size as NavPrefs['size']) : DEFAULT_NAV_PREFS.size,
    icons: r.icons !== false,
    extras: tri(r.extras),
    categories: tri(r.categories),
    openAll: r.openAll === true,
    hidden: cleanList(r.hidden),
    order: cleanList(r.order),
  };
}
