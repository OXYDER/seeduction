import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Profil actif d'un compte famille (absent pour un compte ordinaire). */
export interface ProfileInfo { name: string; type: string; account: string; isMaster: boolean; familyId?: string }
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
