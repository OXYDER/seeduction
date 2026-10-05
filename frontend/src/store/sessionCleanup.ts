import { useAuthStore } from './auth';
import { useMessenger } from './messenger';
import { useDmStore } from './dm';

/**
 * Quand la session change (déconnexion, session expirée, autre compte ou autre profil), les connexions temps réel ouvertes avec
 * l'ancien jeton sont fermées tout de suite. Sans ça, la page de connexion (hors du Layout) ne les fermait jamais, et le compte suivant
 * héritait du socket de l'ancien : ses messages partaient au nom de l'ancien compte.
 */
useAuthStore.subscribe((state, prev) => {
  if (state.accessToken !== prev.accessToken || state.user?.id !== prev.user?.id) {
    useMessenger.getState().disconnect();
    useDmStore.getState().disconnect();
  }
});
