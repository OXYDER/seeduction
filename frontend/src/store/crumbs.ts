import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';

export interface Crumb { label: string; to?: string }

interface CrumbState {
  path: string;
  title: string;
  parents: Crumb[];
  set: (path: string, title: string, parents: Crumb[]) => void;
  clear: (path: string) => void;
}

/** Titre (et éventuels niveaux intermédiaires) que la page ouverte donne au fil d'Ariane : nom du torrent, du membre, du sujet... */
export const useCrumbStore = create<CrumbState>((set, get) => ({
  path: '',
  title: '',
  parents: [],
  set: (path, title, parents) => set({ path, title, parents }),
  clear: (path) => { if (get().path === path) set({ path: '', title: '', parents: [] }); },
}));

/**
 * À appeler depuis une page de détail (torrent, membre, sujet...) pour que le fil d'Ariane affiche son vrai nom,
 * avec au besoin ses niveaux parents (catégorie, forum...). Sans appel, un libellé générique est affiché.
 */
export function useCrumbTitle(title?: string | null, parents: Crumb[] = []) {
  const { pathname } = useLocation();
  const set = useCrumbStore((s) => s.set);
  const clear = useCrumbStore((s) => s.clear);
  const key = JSON.stringify(parents);
  useEffect(() => {
    if (!title) return;
    set(pathname, title, JSON.parse(key));
    return () => clear(pathname);
  }, [pathname, title, key, set, clear]);
}
