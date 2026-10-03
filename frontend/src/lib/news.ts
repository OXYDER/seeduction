import { create } from 'zustand';
import { api } from '../api/client';

export const NEWS_KINDS: Record<string, { label: string; icon: string }> = {
  NEWS: { label: 'Nouveauté', icon: '📯' },
  UPDATE: { label: 'Mise à jour', icon: '🆕' },
  EVENT: { label: 'Événement', icon: '🎉' },
  MAINTENANCE: { label: 'Maintenance', icon: '🛠️' },
  IMPORTANT: { label: 'Important', icon: '⚠️' },
};

export const kindOf = (k?: string) => NEWS_KINDS[k ?? 'NEWS'] ?? NEWS_KINDS.NEWS;

const SEEN_KEY = 'news-seen';
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const writeSeen = (iso: string) => { try { localStorage.setItem(SEEN_KEY, iso); } catch { /* navigation privée : on s'en passe */ } };

interface NewsState {
  unseen: number;
  refresh: () => Promise<void>;
  /** À appeler quand la page Nouvelles est ouverte : tout est considéré comme lu. */
  markSeen: () => void;
}

/** Nombre de nouvelles publiées depuis la dernière visite de la page Nouvelles (pastille du menu). */
export const useNewsUnseen = create<NewsState>((set) => ({
  unseen: 0,
  async refresh() {
    try {
      const { data } = await api.get('/announcements/latest', { params: { limit: 10 } });
      const seen = readSeen();
      if (!seen) { writeSeen(new Date().toISOString()); set({ unseen: 0 }); return; } // première visite : on ne signale pas tout l'historique
      set({ unseen: (data as any[]).filter((n) => new Date(n.createdAt) > new Date(seen)).length });
    } catch { /* hors ligne */ }
  },
  markSeen() {
    writeSeen(new Date().toISOString());
    set({ unseen: 0 });
  },
}));

/** Cette nouvelle est-elle arrivée depuis la dernière visite de la page Nouvelles ? */
export const isUnseenNews = (createdAt: string) => {
  const seen = readSeen();
  return !!seen && new Date(createdAt) > new Date(seen);
};
