import { create } from 'zustand';

/** Cible de la fenêtre « Envoyer un message » (demande de message) : ouverte depuis la fiche d'un membre ou quand le serveur exige une demande avant d'écrire. */
interface MsgRequestState {
  target: { id: string; username: string } | null;
  /** Compteur qui monte quand une demande vient d'être envoyée (les boutons « Demander à écrire » se rafraîchissent). */
  sentTick: number;
  open: (user: { id: string; username: string }) => void;
  close: () => void;
  markSent: () => void;
}

export const useMsgRequest = create<MsgRequestState>((set) => ({
  target: null,
  sentTick: 0,
  open: (user) => set({ target: { id: user.id, username: user.username } }),
  close: () => set({ target: null }),
  markSent: () => set((s) => ({ sentTick: s.sentTick + 1 })),
}));
