import { useCallback, useSyncExternalStore } from 'react';

/**
 * Façons d'afficher une liste de torrents, partout sur le site (Parcourir, favoris, collections, fiches membres...).
 * Chaque membre choisit un affichage par défaut dans son compte (stocké côté serveur, voir User.defaultView) ; sur
 * chaque page il peut ensuite changer ponctuellement — ce choix-là est retenu par page, dans ce navigateur seulement.
 */
export type ViewMode = 'list' | 'details' | 'grid' | 'posters' | 'compact';

export const VIEW_MODES: { id: ViewMode; icon: string; label: string; hint: string }[] = [
  { id: 'list', icon: '☰', label: 'Liste', hint: 'Tableau complet, colonnes triables' },
  { id: 'details', icon: '▤', label: 'Détails', hint: 'Une grande ligne par torrent : affiche, synopsis et infos' },
  { id: 'grid', icon: '▦', label: 'Grille', hint: 'Cartes avec titre, qualité et statistiques' },
  { id: 'posters', icon: '▩', label: 'Affiches', hint: 'Grandes affiches seules, infos au survol' },
  { id: 'compact', icon: '≣', label: 'Compact', hint: 'Une ligne fine par torrent, un maximum à l\'écran' },
];

const STORAGE_PREFIX = 'seeduction:view:';
const FALLBACK: ViewMode = 'grid';

const isView = (v: unknown): v is ViewMode => typeof v === 'string' && VIEW_MODES.some((m) => m.id === v);

let defaultView: ViewMode = FALLBACK;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Affichage par défaut du membre (chargé avec son profil) ; `clearOverrides` efface aussi ses choix ponctuels par page. */
export function applyDefaultView(view: string | null | undefined, opts?: { clearOverrides?: boolean }) {
  if (opts?.clearOverrides) {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX)).forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem('browseView'); // ancien réglage de Parcourir (liste / grille)
    } catch { /* stockage indisponible */ }
  }
  if (isView(view)) defaultView = view;
  emit();
}

function readOverride(pageKey: string): ViewMode | '' {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + pageKey);
    if (isView(saved)) return saved;
    // Ancien réglage de Parcourir, avant les 5 affichages : on le respecte jusqu'au prochain choix.
    if (pageKey === 'browse') {
      const legacy = localStorage.getItem('browseView');
      if (legacy === 'grid' || legacy === 'list') return legacy;
    }
  } catch { /* stockage indisponible */ }
  return '';
}

/** [affichage courant, changer] pour une page — `pageKey` distingue les pages entre elles (ex. 'browse', 'favorites'). */
export function useViewMode(pageKey: string): [ViewMode, (v: ViewMode) => void] {
  const snapshot = useSyncExternalStore(subscribe, () => `${defaultView}|${readOverride(pageKey)}`);
  const [def, override] = snapshot.split('|');
  const view = (override || def) as ViewMode;
  const setView = useCallback((v: ViewMode) => {
    try { localStorage.setItem(STORAGE_PREFIX + pageKey, v); } catch { /* le choix vaut pour cette visite */ }
    emit();
  }, [pageKey]);
  return [view, setView];
}
