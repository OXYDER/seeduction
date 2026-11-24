/**
 * Mise en page de l'accueil d'un membre (« Tableau de bord ») : ce qui s'affiche, dans quel ordre, et ce qui est réduit. Mémorisée sur son compte (Profil, toutes ses
 * connexions) et gardée ici pour un affichage immédiat. Un membre qui avait déjà réglé son accueil sur cet appareil le retrouve tel quel (anciens réglages repris).
 * NB : mêmes valeurs que backend/src/common/utils/home-layout.ts ; garder les deux alignés.
 */
import { create } from 'zustand';
import { api } from '../api/client';

export interface HomeLayout { order: string[]; hidden: string[]; collapsed: string[]; prevNews: boolean }
export const DEFAULT_HOME_LAYOUT: HomeLayout = { order: [], hidden: [], collapsed: [], prevNews: true };

/** Les sections de l'accueil, dans l'ordre d'origine. `fixed` : cachable mais pas déplaçable (en haut, ou colonne de droite). */
export const HOME_SECTIONS: { id: string; icon: string; label: string; fixed?: boolean }[] = [
  { id: 'composer', icon: '✍️', label: 'Publier : « Qu\'avez-vous en tête ? »', fixed: true },
  { id: 'actions', icon: '⚡', label: 'Actions rapides (Envoyer, Demander, Inviter, Mes seeds)' },
  { id: 'app', icon: '🎬', label: "Seeduction TV (ce qui joue, sur quel appareil)" },
  { id: 'featured', icon: '⭐', label: 'À la une (grande affiche en vedette)' },
  { id: 'foryou', icon: '🎯', label: 'Téléchargements en cours, complétés et épisode suivant' },
  { id: 'moderation', icon: '🛡️', label: 'Modération (équipe)' },
  { id: 'strip', icon: '🎉', label: 'Niveau, badges, pot commun et freeleech' },
  { id: 'stats', icon: '📊', label: 'Forum, top uploaders et communauté' },
  { id: 'news', icon: '📰', label: 'Nouvelles' },
  { id: 'continue', icon: '▶️', label: 'Reprendre la lecture' },
  { id: 'because', icon: '🧭', label: 'Parce que tu as aimé… (un titre que tu as aimé, et ce qui lui ressemble)' },
  { id: 'recommended', icon: '⭐', label: 'Recommandé pour toi (ou les plus populaires)' },
  { id: 'top5', icon: '🏆', label: 'Top 5' },
  { id: 'latest', icon: '🆕', label: 'Nouveautés (ajoutés récemment)' },
  { id: 'popular', icon: '🔥', label: 'Plus populaires' },
  { id: 'freeleech', icon: '🎁', label: 'Freeleech en ce moment' },
  { id: 'atrisk', icon: '⚠️', label: 'À seeder (torrents à 1-2 seeders)' },
  { id: 'rail', icon: '🏒', label: 'Colonne de droite (Canadiens, amis, chat, défi)', fixed: true },
];

const KEY = 'home-layout-v1';
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x)))].slice(0, 60) : []);

export function normalizeHomeLayout(raw: unknown): HomeLayout {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { order: ids(r.order), hidden: ids(r.hidden), collapsed: ids(r.collapsed), prevNews: r.prevNews !== false };
}

/** Anciens réglages de cet appareil (cases « Afficher sur mon accueil » et sections réduites) → mise en page actuelle. */
function fromOld(): HomeLayout {
  try {
    const old = JSON.parse(localStorage.getItem('home-prefs') ?? '{}') as Record<string, unknown>;
    const collapsed = JSON.parse(localStorage.getItem('home-collapsed') ?? '[]');
    const hidden: string[] = [];
    if (old.strip === false) hidden.push('strip');
    if (old.rail === false) hidden.push('rail');
    if (old.actions === false) hidden.push('actions', 'foryou');
    return normalizeHomeLayout({ hidden, collapsed, prevNews: old.prevNews !== false });
  } catch { return DEFAULT_HOME_LAYOUT; }
}

function read(): HomeLayout {
  try { const raw = localStorage.getItem(KEY); return raw ? normalizeHomeLayout(JSON.parse(raw)) : fromOld(); } catch { return DEFAULT_HOME_LAYOUT; }
}

let timer: number | undefined;

interface HomeLayoutState {
  layout: HomeLayout;
  /** Mode « organiser » : des flèches et un bouton pour cacher apparaissent sur chaque section de l'accueil. */
  editing: boolean;
  setEditing: (v: boolean) => void;
  /** Valeur venue du compte (au chargement) : elle l'emporte ; sans valeur, l'appareil garde ses choix et les envoie au compte. */
  hydrate: (raw: unknown) => void;
  update: (patch: Partial<HomeLayout>) => void;
  toggleHidden: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  collapseAll: (ids: string[]) => void;
  expandAll: () => void;
  /** Descend ou monte une section : elle échange sa place avec sa voisine visible (`order` : l'ordre actuel de toutes les sections déplaçables, cachées comprises ; `visible` : celles qu'on voit). */
  move: (id: string, dir: -1 | 1, order: string[], visible?: string[]) => void;
  /** Glisser-déposer : met la section `id` juste avant (ou juste après) la section `target`. */
  moveTo: (id: string, target: string, after: boolean, order: string[]) => void;
  reset: () => void;
}

export const useHomeLayout = create<HomeLayoutState>((set, get) => {
  const save = (layout: HomeLayout) => {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* préférence facultative */ }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void api.patch('/users/me/home-layout', layout).catch(() => undefined); }, 600);
  };
  const apply = (patch: Partial<HomeLayout>) => { const layout = normalizeHomeLayout({ ...get().layout, ...patch }); set({ layout }); save(layout); };
  return {
    layout: read(),
    editing: false,
    setEditing: (editing) => set({ editing }),
    hydrate: (raw) => {
      if (raw === null || raw === undefined) { save(get().layout); return; }
      const layout = normalizeHomeLayout(raw);
      try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* idem */ }
      set({ layout });
    },
    update: apply,
    toggleHidden: (id) => { const h = get().layout.hidden; apply({ hidden: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] }); },
    toggleCollapsed: (id) => { const c = get().layout.collapsed; apply({ collapsed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] }); },
    collapseAll: (all) => apply({ collapsed: [...new Set([...get().layout.collapsed, ...all])] }),
    expandAll: () => apply({ collapsed: [] }),
    move: (id, dir, order, visible = order) => {
      const nb = visible[visible.indexOf(id) + dir];
      const a = order.indexOf(id), b = nb ? order.indexOf(nb) : -1;
      if (visible.indexOf(id) < 0 || a < 0 || b < 0) return;
      const next = [...order];
      [next[a], next[b]] = [next[b], next[a]];
      apply({ order: next });
    },
    moveTo: (id, target, after, order) => {
      if (id === target || !order.includes(id) || !order.includes(target)) return;
      const next = order.filter((x) => x !== id);
      next.splice(next.indexOf(target) + (after ? 1 : 0), 0, id);
      apply({ order: next });
    },
    reset: () => { set({ layout: DEFAULT_HOME_LAYOUT }); save(DEFAULT_HOME_LAYOUT); },
  };
});

/** Les identifiants dans l'ordre voulu : ceux choisis par le membre d'abord ; une section nouvelle (absente de son ordre) se glisse à sa place d'origine, juste après la section qui la précède. */
export function orderIds(defaults: string[], order: string[]): string[] {
  const out = [...new Set(order.filter((id) => defaults.includes(id)))];
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(defaults[j]); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, id);
  });
  return out;
}
