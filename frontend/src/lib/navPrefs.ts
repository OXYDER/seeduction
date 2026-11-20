/**
 * Réglages du menu de gauche d'un membre : style (classique = la liste à plat de gros liens d'origine, ou groupes repliables), taille des liens,
 * icônes, liens supplémentaires, liens cachés et ordre. Mémorisés sur son compte (Profil > Compte > Menu de gauche) et gardés ici pour un affichage immédiat.
 * NB : mêmes valeurs que backend/src/common/utils/nav-prefs.ts ; garder les deux alignés.
 */
import { create } from 'zustand';
import { api } from '../api/client';

export interface NavPrefs {
  style: 'classic' | 'groups';
  size: 'normal' | 'large' | 'xl';
  icons: boolean;
  /** null = automatique : affichés avec le style Groupes, cachés avec le style Classique. */
  extras: boolean | null;
  categories: boolean | null;
  openAll: boolean;
  hidden: string[];
  order: string[];
}

export const DEFAULT_NAV_PREFS: NavPrefs = { style: 'classic', size: 'large', icons: true, extras: null, categories: null, openAll: false, hidden: [], order: [] };

const KEY = 'nav-prefs-v1';
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')).slice(0, 120) : []);

export function normalizeNavPrefs(raw: unknown): NavPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tri = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  return {
    style: r.style === 'groups' ? 'groups' : 'classic',
    size: r.size === 'normal' || r.size === 'xl' ? r.size : 'large',
    icons: r.icons !== false,
    extras: tri(r.extras),
    categories: tri(r.categories),
    openAll: r.openAll === true,
    hidden: list(r.hidden),
    order: list(r.order),
  };
}

function read(): NavPrefs {
  try { const raw = localStorage.getItem(KEY); return raw ? normalizeNavPrefs(JSON.parse(raw)) : DEFAULT_NAV_PREFS; } catch { return DEFAULT_NAV_PREFS; }
}

let timer: number | undefined;

interface NavPrefsState {
  prefs: NavPrefs;
  /** Valeur venue du serveur (au chargement du compte) : elle l'emporte sur ce qui était gardé dans le navigateur. */
  hydrate: (raw: unknown) => void;
  /** Un changement du membre : appliqué tout de suite, enregistré sur son compte une demi-seconde après le dernier clic. */
  update: (patch: Partial<NavPrefs>) => void;
  reset: () => void;
}

export const useNavPrefs = create<NavPrefsState>((set, get) => {
  const save = (prefs: NavPrefs) => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* préférence facultative */ }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void api.patch('/users/me/nav-prefs', prefs).catch(() => undefined); }, 500);
  };
  return {
    prefs: read(),
    hydrate: (raw) => {
      const prefs = normalizeNavPrefs(raw);
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* idem */ }
      set({ prefs });
    },
    update: (patch) => { const prefs = normalizeNavPrefs({ ...get().prefs, ...patch }); set({ prefs }); save(prefs); },
    reset: () => { set({ prefs: DEFAULT_NAV_PREFS }); save(DEFAULT_NAV_PREFS); },
  };
});

/** Ordre d'origine du menu (la liste à plat d'avant les groupes) ; les autres liens suivent dans l'ordre du code. */
export const NAV_CLASSIC_ORDER = ['/', '/browse', '/news', '/upload', '/requests', '/favorites', '/collections', '/friends', '/teams', '/chat', '/forum', '/suggestions', '/jeux', '/canadiens-en-direct', '/stats', '/dead', '/soutenir', '/wiki', '/support', '/staff-board', '/moderation', '/equipe', '/admin'];
/** Noms d'origine de quelques liens, repris avec le style Classique. */
export const NAV_CLASSIC_LABELS: Record<string, string> = { '/': 'Accueil', '/jeux': 'Jeux', '/stats': 'Stats' };

/** Les liens dans l'ordre d'origine du menu classique. */
export function classicSort<T extends { to: string }>(items: T[]): T[] {
  const idx = (to: string) => { const i = NAV_CLASSIC_ORDER.indexOf(to); return i < 0 ? 1000 : i; };
  return items.map((it, n) => ({ it, n })).sort((a, b) => idx(a.it.to) - idx(b.it.to) || a.n - b.n).map((x) => x.it);
}

/** L'ordre choisi par le membre : ses liens classés d'abord, les autres à la suite dans leur ordre. */
export function applyOrder<T extends { to: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((p, i) => [p, i]));
  return items.map((it, n) => ({ it, n })).sort((a, b) => (rank.get(a.it.to) ?? 100_000 + a.n) - (rank.get(b.it.to) ?? 100_000 + b.n)).map((x) => x.it);
}
