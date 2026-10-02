import { create } from 'zustand';
import { api } from '../api/client';

interface QueueState {
  pendingTorrents: number;
  openReports: number;
  total: number;
  /** Recompte la file de modération (réservé au staff : les autres reçoivent une erreur, ignorée). */
  refresh: () => Promise<void>;
  reset: () => void;
}

/** Compteurs de la file de modération, partagés par la pastille du menu, la page Modération et le tableau de bord. */
export const useQueue = create<QueueState>((set) => ({
  pendingTorrents: 0,
  openReports: 0,
  total: 0,
  async refresh() {
    try {
      const { data } = await api.get('/admin/queue');
      set({ pendingTorrents: data.pendingTorrents ?? 0, openReports: data.openReports ?? 0, total: data.total ?? 0 });
    } catch { /* hors ligne ou pas staff */ }
  },
  reset: () => set({ pendingTorrents: 0, openReports: 0, total: 0 }),
}));
