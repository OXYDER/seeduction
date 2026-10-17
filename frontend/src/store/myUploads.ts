import { create } from 'zustand';
import { api } from '../api/client';

interface MyUploadsState {
  /** Nombre de torrents envoyés par ce membre (l'icône « Mes envois » n'apparaît que s'il en a). */
  total: number;
  /** Torrents mis en suspens par l'équipe : une correction est demandée au membre. */
  hold: number;
  rejected: number;
  pending: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

/** Compteurs de « Mes envois », partagés par l'icône de l'en-tête, la pastille du menu « Envoyer » et les pages concernées. */
export const useMyUploads = create<MyUploadsState>((set) => ({
  total: 0, hold: 0, rejected: 0, pending: 0, loaded: false,
  async refresh() {
    try {
      const { data } = await api.get('/my-torrents/summary');
      set({ total: data.total ?? 0, hold: data.hold ?? 0, rejected: data.rejected ?? 0, pending: data.pending ?? 0, loaded: true });
    } catch { /* hors ligne : on garde les derniers chiffres */ }
  },
  reset: () => set({ total: 0, hold: 0, rejected: 0, pending: 0, loaded: false }),
}));
