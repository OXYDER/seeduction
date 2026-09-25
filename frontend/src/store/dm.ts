import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';

export interface DmUser { id: string; username: string; avatarUrl?: string | null }
export interface DmMessage { id: string; content: string; createdAt: string; fromMe: boolean; sender?: DmUser; pending?: boolean }
export interface ChatWindow { friend: DmUser; minimized: boolean }

interface DmState {
  socket: Socket | null;
  connected: boolean;
  onlineIds: Set<string>;
  windows: ChatWindow[];
  messages: Record<string, DmMessage[]>;
  unread: Record<string, number>;
  totalUnread: number;
  typingFrom: Record<string, number>; // friendId -> timestamp du dernier "en train d'écrire"
  friendRequestBump: number; // incrémenté à chaque demande d'ami reçue/acceptée, pour que la page Amis se rafraîchisse

  connect: (token: string) => void;
  disconnect: () => void;
  openChat: (friend: DmUser) => void;
  closeChat: (friendId: string) => void;
  toggleMinimize: (friendId: string) => void;
  loadHistory: (friendId: string) => Promise<void>;
  send: (friendId: string, content: string) => void;
  typing: (friendId: string) => void;
  markSeen: (friendId: string) => void;
  refreshUnread: () => void;
}

const MAX_WINDOWS = 3;

export const useDmStore = create<DmState>((set, get) => ({
  socket: null,
  connected: false,
  onlineIds: new Set(),
  windows: [],
  messages: {},
  unread: {},
  totalUnread: 0,
  typingFrom: {},
  friendRequestBump: 0,

  connect(token) {
    if (get().socket) return;
    const socket = io('/dm', { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('dm:online-friends', (ids: string[]) => set({ onlineIds: new Set(ids) }));
    socket.on('dm:presence', ({ userId, online }: { userId: string; online: boolean }) => {
      set((s) => {
        const next = new Set(s.onlineIds);
        if (online) next.add(userId); else next.delete(userId);
        return { onlineIds: next };
      });
    });

    socket.on('dm:message', (m: any) => {
      const friendId = m.otherId as string;
      set((s) => {
        const list = s.messages[friendId] ?? [];
        // Remplace un message optimiste équivalent (même contenu, encore "pending") plutôt que de le dupliquer.
        const pendingIdx = m.fromMe ? list.findIndex((x) => x.pending && x.content === m.content) : -1;
        const entry: DmMessage = { id: m.id, content: m.content, createdAt: m.createdAt, fromMe: m.fromMe, sender: m.sender };
        const nextList = pendingIdx >= 0 ? [...list.slice(0, pendingIdx), entry, ...list.slice(pendingIdx + 1)] : [...list, entry];
        const existingWindow = s.windows.find((w) => w.friend.id === friendId);
        const isOpenAndVisible = !!existingWindow && !existingWindow.minimized;
        const unreadDelta = !m.fromMe && !isOpenAndVisible ? 1 : 0;
        // Un message reçu d'un ami sans fenêtre ouverte fait apparaître sa bulle (réduite), sans l'ouvrir de force.
        const windows = !m.fromMe && !existingWindow && m.sender
          ? [...s.windows, { friend: m.sender, minimized: true }]
          : s.windows;
        return {
          messages: { ...s.messages, [friendId]: nextList },
          windows,
          unread: unreadDelta ? { ...s.unread, [friendId]: (s.unread[friendId] ?? 0) + 1 } : s.unread,
          totalUnread: s.totalUnread + unreadDelta,
        };
      });
    });

    socket.on('dm:typing', ({ fromUserId }: { fromUserId: string }) => {
      set((s) => ({ typingFrom: { ...s.typingFrom, [fromUserId]: Date.now() } }));
    });

    socket.on('dm:friend-request', () => set((s) => ({ friendRequestBump: s.friendRequestBump + 1 })));
    socket.on('dm:friend-accepted', () => set((s) => ({ friendRequestBump: s.friendRequestBump + 1 })));

    set({ socket });
    get().refreshUnread();
  },

  disconnect() {
    get().socket?.disconnect();
    set({ socket: null, connected: false, onlineIds: new Set(), windows: [], messages: {}, unread: {}, totalUnread: 0 });
  },

  openChat(friend) {
    set((s) => {
      if (s.windows.some((w) => w.friend.id === friend.id)) {
        return { windows: s.windows.map((w) => (w.friend.id === friend.id ? { ...w, minimized: false } : w)) };
      }
      const trimmed = s.windows.length >= MAX_WINDOWS ? s.windows.slice(1) : s.windows;
      return { windows: [...trimmed, { friend, minimized: false }] };
    });
    get().loadHistory(friend.id);
    get().markSeen(friend.id);
  },

  closeChat(friendId) {
    set((s) => ({ windows: s.windows.filter((w) => w.friend.id !== friendId) }));
  },

  toggleMinimize(friendId) {
    set((s) => ({ windows: s.windows.map((w) => (w.friend.id === friendId ? { ...w, minimized: !w.minimized } : w)) }));
    const win = get().windows.find((w) => w.friend.id === friendId);
    if (win && win.minimized) get().markSeen(friendId);
  },

  async loadHistory(friendId) {
    if (get().messages[friendId]) return;
    try {
      const { data } = await api.get(`/dm/thread/${friendId}`);
      set((s) => ({ messages: { ...s.messages, [friendId]: data } }));
    } catch {
      set((s) => ({ messages: { ...s.messages, [friendId]: [] } }));
    }
  },

  send(friendId, content) {
    const text = content.trim();
    if (!text) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((s) => ({
      messages: { ...s.messages, [friendId]: [...(s.messages[friendId] ?? []), { id: tempId, content: text, createdAt: new Date().toISOString(), fromMe: true, pending: true }] },
    }));
    const socket = get().socket;
    if (socket?.connected) {
      socket.emit('dm:send', { toUserId: friendId, content: text });
    } else {
      // Le socket n'est pas connecté : on passe par l'API pour ne pas perdre le message.
      api.post(`/dm/thread/${friendId}`, { content: text })
        .then(({ data }) => set((s) => ({
          messages: { ...s.messages, [friendId]: (s.messages[friendId] ?? []).map((m) => (m.id === tempId ? { ...data, fromMe: true } : m)) },
        })))
        .catch(() => set((s) => ({ messages: { ...s.messages, [friendId]: (s.messages[friendId] ?? []).filter((m) => m.id !== tempId) } })));
    }
  },

  typing(friendId) {
    get().socket?.emit('dm:typing', { toUserId: friendId });
  },

  markSeen(friendId) {
    get().socket?.emit('dm:read', { friendId });
    set((s) => {
      if (!s.unread[friendId]) return {};
      const { [friendId]: _, ...rest } = s.unread;
      return { unread: rest, totalUnread: Math.max(0, s.totalUnread - s.unread[friendId]) };
    });
  },

  refreshUnread() {
    api.get('/dm/unread-count').then((r) => set({ totalUnread: Number(r.data) || 0 })).catch(() => {});
  },
}));
