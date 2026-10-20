import { create } from 'zustand';
import { api } from '../api/client';

/** Les comptes supprimés (identifiants seulement) : sert à afficher la petite icône 🗑️ à côté de leur pseudo partout, sans alourdir chaque réponse du serveur. */
interface DeletedState {
  ids: Record<string, true>;
  load: () => Promise<void>;
}

export const useDeleted = create<DeletedState>((set) => ({
  ids: {},
  async load() {
    try {
      const r = await api.get('/users/deleted-ids');
      set({ ids: Object.fromEntries((r.data as string[]).map((id) => [id, true as const])) });
    } catch { /* l'icône est facultative */ }
  },
}));
