import { create } from 'zustand';
import { api } from '../api/client';

/** Rang coloré de chaque membre (identifiant → rang) : sert à colorer les pseudos partout, sans alourdir chaque réponse du serveur. « Nouveau » et « Membre » n'y figurent pas. */
interface RanksState {
  ranks: Record<string, string>;
  /** Rang par pseudo en minuscules, pour les classements qui ne donnent que le pseudo. */
  byName: Record<string, string>;
  load: () => Promise<void>;
}

export const useRanks = create<RanksState>((set) => ({
  ranks: {},
  byName: {},
  async load() {
    try {
      const r = await api.get('/users/rank-colors');
      const ranks: Record<string, string> = {}, byName: Record<string, string> = {};
      for (const [rank, ids] of Object.entries((r.data.byId ?? {}) as Record<string, string[]>)) for (const id of ids) ranks[id] = rank;
      for (const [rank, names] of Object.entries((r.data.byName ?? {}) as Record<string, string[]>)) for (const n of names) byName[n] = rank;
      set({ ranks, byName });
    } catch { /* la couleur est facultative */ }
  },
}));

/** Classe CSS d'un pseudo selon le rang (rien pour un membre ordinaire). */
export const rankClass = (rank?: string) => (rank ? ` rank-${rank}` : '');

/** Rang coloré d'après un profil complet (rôle du staff, Uploadeur, puis classe automatique). */
export function rankKeyOf(u: { role?: string; memberClass?: string } | null | undefined): string | undefined {
  if (!u) return undefined;
  if (u.role && ['OWNER', 'ADMIN', 'SUPER_MODERATOR', 'MODERATOR', 'UPLOADER'].includes(u.role)) return u.role;
  return u.memberClass && ['POWER_USER', 'ELITE', 'VETERAN'].includes(u.memberClass) ? u.memberClass : undefined;
}
