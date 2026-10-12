import { create } from 'zustand';
import { api } from '../api/client';

/** Les donateurs du site (identifiant → statut actif ou passé) : sert à afficher le ❤️ à côté de leur pseudo partout, sans alourdir chaque réponse du serveur. */
interface DonorsState {
  donors: Record<string, boolean>;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useDonors = create<DonorsState>((set) => ({
  donors: {},
  loaded: false,
  async load() {
    try {
      const r = await api.get('/donations/donors');
      set({ donors: Object.fromEntries((r.data as { id: string; active: boolean }[]).map((d) => [d.id, d.active])), loaded: true });
    } catch { /* l'affichage du ❤️ est facultatif */ }
  },
}));
