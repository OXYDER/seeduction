import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';
import { PublicStatus } from '../lib/presence';

export interface ChatUser { id: string; username: string; role: string; avatarUrl?: string | null }
export interface ChatReaction { emoji: string; userIds: string[] }
export interface ChatMsg {
  id: string;
  content: string;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  createdAt: string;
  user: ChatUser;
  reactions: ChatReaction[];
}
export interface OnlineMember { id: string; username: string; status: PublicStatus }

interface PublicChatState {
  socket: Socket | null;
  connected: boolean;
  messages: ChatMsg[];
  onlineUsers: OnlineMember[];
  typingFrom: Record<string, { username: string; at: number }>;
  seenBy: Record<string, { username: string; messageId: string }>;
  minimized: boolean;
  unread: number;
  error: string;
  myUserId: string | null;

  connect: (token: string, myUserId: string) => void;
  disconnect: () => void;
  setMinimized: (v: boolean) => void;
  send: (body: { content?: string; imageUrl?: string; fileUrl?: string; fileName?: string; fileSize?: number }) => void;
  typing: () => void;
  react: (messageId: string, emoji: string) => void;
  markSeen: (messageId: string) => void;
  uploadImage: (file: File) => Promise<string>;
  uploadFile: (file: File) => Promise<{ url: string; name: string; size: number }>;
}

let loadedOnce = false;

export const usePublicChatStore = create<PublicChatState>((set, get) => ({
  socket: null,
  connected: false,
  messages: [],
  onlineUsers: [],
  typingFrom: {},
  seenBy: {},
  minimized: true,
  unread: 0,
  error: '',
  myUserId: null,

  connect(token, myUserId) {
    if (get().socket) return;
    set({ myUserId });
    if (!loadedOnce) {
      loadedOnce = true;
      api.get('/chat/messages').then((r) => set({ messages: r.data })).catch(() => {});
    }

    const socket = io('/chat', { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('chat:online-users', (list: OnlineMember[]) => set({ onlineUsers: list }));

    socket.on('chat:message', (m: ChatMsg) => {
      set((s) => ({
        messages: [...s.messages, m].slice(-300),
        unread: s.minimized && m.user.id !== s.myUserId ? s.unread + 1 : s.unread,
      }));
    });

    socket.on('chat:delete', ({ id }: { id: string }) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })));

    socket.on('chat:reaction-update', ({ messageId, reactions }: { messageId: string; reactions: ChatReaction[] }) => {
      set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)) }));
    });

    socket.on('chat:typing', ({ userId, username }: { userId: string; username: string }) => {
      if (userId === get().myUserId) return;
      set((s) => ({ typingFrom: { ...s.typingFrom, [userId]: { username, at: Date.now() } } }));
    });

    socket.on('chat:seen-update', ({ userId, username, messageId }: { userId: string; username: string; messageId: string }) => {
      if (userId === get().myUserId) return;
      set((s) => ({ seenBy: { ...s.seenBy, [userId]: { username, messageId } } }));
    });

    socket.on('chat:error', (msg: string) => {
      set({ error: msg });
      window.setTimeout(() => set((s) => (s.error === msg ? { error: '' } : {})), 3000);
    });

    set({ socket });
  },

  disconnect() {
    get().socket?.disconnect();
    set({ socket: null, connected: false });
  },

  setMinimized(v) {
    set({ minimized: v, unread: v ? get().unread : 0 });
  },

  send(body) {
    get().socket?.emit('chat:message', body);
  },

  typing() {
    get().socket?.emit('chat:typing');
  },

  react(messageId, emoji) {
    get().socket?.emit('chat:reaction', { messageId, emoji });
  },

  markSeen(messageId) {
    get().socket?.emit('chat:seen', { messageId });
  },

  async uploadImage(file) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/chat/images/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data.url;
  },

  async uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/chat/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data;
  },
}));
