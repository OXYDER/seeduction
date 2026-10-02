import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

/**
 * Ne sert plus qu'aux demandes d'amis en direct (la page Amis et la pastille se rafraîchissent quand quelqu'un
 * t'ajoute ou accepte) : les discussions elles-mêmes passent par le Messenger (store/messenger.ts).
 */
interface FriendEventsState {
  socket: Socket | null;
  /** Incrémenté à chaque demande d'ami reçue / acceptée, pour que la page Amis se rafraîchisse. */
  friendRequestBump: number;
  connect: (token: string) => void;
  disconnect: () => void;
}

export const useDmStore = create<FriendEventsState>((set, get) => ({
  socket: null,
  friendRequestBump: 0,

  connect(token) {
    if (get().socket) return;
    const socket = io('/dm', { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('dm:friend-request', () => set((s) => ({ friendRequestBump: s.friendRequestBump + 1 })));
    socket.on('dm:friend-accepted', () => set((s) => ({ friendRequestBump: s.friendRequestBump + 1 })));
    set({ socket });
  },

  disconnect() {
    get().socket?.disconnect();
    set({ socket: null });
  },
}));
