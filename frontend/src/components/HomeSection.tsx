import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';

const KEY = 'home-collapsed';
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const write = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* préférence facultative : valable pour cette visite seulement */ } };

/** Sections de l'accueil réduites par le membre (mémorisées sur cet appareil) et liste des sections présentes (pour « Tout réduire »). */
interface SectionsState {
  collapsed: string[];
  known: string[];
  toggle: (id: string) => void;
  register: (id: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
}
export const useHomeSections = create<SectionsState>((set, get) => ({
  collapsed: read(),
  known: [],
  toggle(id) {
    const next = get().collapsed.includes(id) ? get().collapsed.filter((x) => x !== id) : [...get().collapsed, id];
    write(next); set({ collapsed: next });
  },
  register(id) { if (!get().known.includes(id)) set({ known: [...get().known, id] }); },
  collapseAll() { const next = [...new Set([...get().collapsed, ...get().known])]; write(next); set({ collapsed: next }); },
  expandAll() { write([]); set({ collapsed: [] }); },
}));

/**
 * Enveloppe une section de l'accueil d'une petite icône pour la réduire (− en haut à droite) : une fois réduite, il ne reste qu'une fine barre avec son nom
 * et un + pour la rouvrir. Le contenu reste monté (rien ne se recharge) ; une section vide (rien à afficher) disparaît tout entière.
 */
export default function HomeSection({ id, label, icon, children }: { id: string; label: string; icon: string; children: ReactNode }) {
  const collapsed = useHomeSections((s) => s.collapsed.includes(id));
  const toggle = useHomeSections((s) => s.toggle);
  const register = useHomeSections((s) => s.register);
  useEffect(() => { register(id); }, [id, register]);

  return (
    <div className={`hs${collapsed ? ' collapsed' : ''}`}>
      <button type="button" className="hs-bar" onClick={() => toggle(id)} aria-expanded={false} title={`Afficher : ${label}`}>
        <span aria-hidden>{icon}</span> <span className="hs-bar-label">{label}</span> <span className="hs-plus" aria-hidden>＋</span>
      </button>
      <button type="button" className="hs-min" onClick={() => toggle(id)} aria-expanded={!collapsed} aria-label={`Réduire : ${label}`} title="Réduire cette section">−</button>
      <div className="hs-body">{children}</div>
    </div>
  );
}

/** Petit bandeau au-dessus de l'accueil : tout réduire / tout afficher. */
export function HomeSectionsControls() {
  const collapsedCount = useHomeSections((s) => s.collapsed.length);
  const collapseAll = useHomeSections((s) => s.collapseAll);
  const expandAll = useHomeSections((s) => s.expandAll);
  return (
    <div className="hs-controls">
      <button type="button" onClick={collapseAll} title="Réduire toutes les sections de l'accueil">− Tout réduire</button>
      {collapsedCount > 0 && <button type="button" onClick={expandAll} title="Afficher toutes les sections">＋ Tout afficher ({collapsedCount})</button>}
    </div>
  );
}
