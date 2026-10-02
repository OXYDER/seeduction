import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Profil actif d'un compte famille (absent pour un compte ordinaire). */
export type PermKey = 'adult' | 'upload' | 'spend' | 'download' | 'messaging' | 'write';
export type Perms = Record<PermKey, boolean>;
export const PERM_LABELS: Record<PermKey, string> = {
  adult: 'Contenu adulte (XXX)',
  upload: 'Envoyer des torrents',
  spend: 'Dépenser les points (boutique, jetons freeleech, primes)',
  download: 'Télécharger et lire les torrents',
  messaging: 'Messagerie, chat et appels',
  write: 'Commentaires et forum',
};
export const PERM_KEYS = Object.keys(PERM_LABELS) as PermKey[];
export const DEFAULT_PERMS: Perms = { adult: false, upload: false, spend: false, download: true, messaging: true, write: true };
export interface ProfileInfo { name: string; perms: Perms; account: string; isMaster: boolean; familyId?: string }
export interface AuthUser { id: string; username: string; role: string; passkey: string; profile?: ProfileInfo }

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /** « account » : mot de passe saisi mais profil pas encore choisi (compte famille) — seul l'écran de choix de profil est accessible. */
  scope: 'account' | 'profile';
  login: (accessToken: string, user: AuthUser | null, scope?: 'account' | 'profile') => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      scope: 'profile',
      login: (accessToken, user, scope = 'profile') => set({ accessToken, user, scope }),
      logout: () => set({ accessToken: null, user: null, scope: 'profile' }),
    }),
    { name: 'tracker-auth' },
  ),
);
