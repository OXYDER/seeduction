import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { useHomeLayout } from '../lib/homeLayout';

/** Liste des sections présentes à l'écran (pour « Tout réduire »). Ce qui est réduit, caché ou déplacé est dans la mise en page du membre (lib/homeLayout.ts). */
export const useHomeSections = create<{ known: string[]; register: (id: string) => void }>((set, get) => ({
  known: [],
  register(id) { if (!get().known.includes(id)) set({ known: [...get().known, id] }); },
}));

/**
 * Enveloppe une section de l'accueil d'une petite icône pour la réduire (− en haut à droite) : une fois réduite, il ne reste qu'une fine barre avec son nom
 * et un + pour la rouvrir. Le contenu reste monté (rien ne se recharge) ; une section vide (rien à afficher) disparaît tout entière.
 */
export default function HomeSection({ id, label, icon, children }: { id: string; label: string; icon: string; children: ReactNode }) {
  const collapsed = useHomeLayout((s) => s.layout.collapsed.includes(id));
  const toggle = useHomeLayout((s) => s.toggleCollapsed);
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

/**
 * Une section déplaçable de l'accueil : réductible, et en mode « organiser » une barre avec les flèches pour la monter ou la descendre et un bouton pour la cacher.
 * `order` : l'ordre actuel de toutes les sections déplaçables ; `visible` : celles qui sont à l'écran.
 */
let dragId: string | null = null; // la section qu'on est en train de déplacer (une seule à la fois)

export function HomeBlock({ id, label, icon, order, visible, collapsible = true, children }: { id: string; label: string; icon: string; order: string[]; visible: string[]; collapsible?: boolean; children: ReactNode }) {
  const editing = useHomeLayout((s) => s.editing);
  const move = useHomeLayout((s) => s.move);
  const moveTo = useHomeLayout((s) => s.moveTo);
  const toggleHidden = useHomeLayout((s) => s.toggleHidden);
  const i = visible.indexOf(id);
  const [over, setOver] = useState<'before' | 'after' | null>(null);
  const [dragging, setDragging] = useState(false);
  const onOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editing || !dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    setOver(e.clientY > r.top + r.height / 2 ? 'after' : 'before');
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editing || !dragId) return;
    e.preventDefault();
    const from = dragId, pos = over;
    dragId = null; setOver(null);
    if (from !== id) moveTo(from, id, pos === 'after', order);
  };
  return (
    <div
      className={`hblock${editing ? ' editing' : ''}${dragging ? ' dragging' : ''}${over ? ` drop-${over}` : ''}`}
      onDragOver={onOver}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
      onDrop={onDrop}
    >
      {editing && (
        <div className="hb-tools">
          <span
            className="hb-grip"
            draggable
            title="Glisse pour déplacer cette section"
            aria-hidden="true"
            onDragStart={(e) => {
              dragId = id; setDragging(true);
              e.dataTransfer.effectAllowed = 'move';
              try { e.dataTransfer.setData('text/plain', id); const bar = e.currentTarget.closest('.hb-tools'); if (bar) e.dataTransfer.setDragImage(bar, 16, 16); } catch { /* facultatif */ }
            }}
            onDragEnd={() => { dragId = null; setDragging(false); setOver(null); }}
          >⠿</span>
          <span className="hb-name"><span aria-hidden>{icon}</span> {label}</span>
          <button type="button" className="secondary" onClick={() => move(id, -1, order, visible)} disabled={i <= 0} aria-label={`Monter : ${label}`}>↑</button>
          <button type="button" className="secondary" onClick={() => move(id, 1, order, visible)} disabled={i < 0 || i >= visible.length - 1} aria-label={`Descendre : ${label}`}>↓</button>
          <button type="button" className="secondary" onClick={() => toggleHidden(id)} aria-label={`Cacher : ${label}`}>🙈 Cacher</button>
        </div>
      )}
      {collapsible ? <HomeSection id={id} label={label} icon={icon}>{children}</HomeSection> : children}
    </div>
  );
}

/** Petit bandeau au-dessus de l'accueil : tout réduire / tout afficher, et le mode « organiser ». */
export function HomeSectionsControls() {
  const collapsedCount = useHomeLayout((s) => s.layout.collapsed.length);
  const known = useHomeSections((s) => s.known);
  const collapseAll = useHomeLayout((s) => s.collapseAll);
  const expandAll = useHomeLayout((s) => s.expandAll);
  const editing = useHomeLayout((s) => s.editing);
  const setEditing = useHomeLayout((s) => s.setEditing);
  return (
    <div className="hs-controls">
      <button type="button" onClick={() => collapseAll(known)} title="Réduire toutes les sections de l'accueil">− Tout réduire</button>
      {collapsedCount > 0 && <button type="button" onClick={expandAll} title="Afficher toutes les sections">＋ Tout afficher ({collapsedCount})</button>}
      <button type="button" className={editing ? '' : 'secondary'} onClick={() => setEditing(!editing)} title="Monter, descendre ou cacher les sections directement sur l'accueil">{editing ? '✓ Terminer' : '↕ Organiser'}</button>
    </div>
  );
}
