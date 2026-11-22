/**
 * Réglages du menu de gauche d'un membre (Profil > Compte > Menu de gauche), mémorisés sur son compte pour le retrouver sur chaque appareil.
 * `extras` et `categories` valent `null` tant que le membre n'a pas choisi : « automatique » = affichés avec le style Groupes, cachés avec le style Classique.
 * NB : une copie du type et des valeurs par défaut existe côté navigateur (frontend/src/lib/navPrefs.ts) ; garder les deux alignés.
 */
export const NAV_STYLES = ['classic', 'groups', 'pinned', 'rail', 'top'] as const;
export const NAV_SIDES = ['left', 'right'] as const;
export const NAV_SIZES = ['normal', 'large', 'xl'] as const;
export const NAV_SPACINGS = ['normal', 'lines', 'airy'] as const;
/** Largeur du menu latéral en pixels (0 = automatique : celle du style). */
export const NAV_WIDTH_MIN = 200;
export const NAV_WIDTH_MAX = 420;

export interface NavPrefs {
  /**
   * Classique : la liste à plat de gros liens d'origine. Groupes : sections colorées repliables. Épinglés : seulement les liens choisis, le reste sous « Tout ».
   * Deux niveaux : une colonne d'icônes de sections et la liste des liens de la section choisie. Barre du haut : menus déroulants en haut de l'écran.
   */
  style: (typeof NAV_STYLES)[number];
  /** Côté de l'écran du menu (sauf la barre du haut). */
  side: (typeof NAV_SIDES)[number];
  /** Style Épinglés : les liens épinglés (adresses), dans l'ordre voulu ; vide = une sélection de départ. */
  pinned: string[];
  /** Largeur du menu latéral (px) ; 0 = automatique. */
  width: number;
  /** Entre les liens : normal, séparés par une fine ligne, ou aérés. */
  spacing: (typeof NAV_SPACINGS)[number];
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

export const DEFAULT_NAV_PREFS: NavPrefs = { style: 'classic', side: 'left', pinned: [], width: 0, spacing: 'normal', size: 'large', icons: true, extras: null, categories: null, openAll: false, hidden: [], order: [] };

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
    side: (NAV_SIDES as readonly unknown[]).includes(r.side) ? (r.side as NavPrefs['side']) : DEFAULT_NAV_PREFS.side,
    pinned: cleanList(r.pinned),
    width: typeof r.width === 'number' && Number.isFinite(r.width) && r.width > 0 ? Math.min(NAV_WIDTH_MAX, Math.max(NAV_WIDTH_MIN, Math.round(r.width))) : 0,
    spacing: (NAV_SPACINGS as readonly unknown[]).includes(r.spacing) ? (r.spacing as NavPrefs['spacing']) : DEFAULT_NAV_PREFS.spacing,
    size: (NAV_SIZES as readonly unknown[]).includes(r.size) ? (r.size as NavPrefs['size']) : DEFAULT_NAV_PREFS.size,
    icons: r.icons !== false,
    extras: tri(r.extras),
    categories: tri(r.categories),
    openAll: r.openAll === true,
    hidden: cleanList(r.hidden),
    order: cleanList(r.order),
  };
}
