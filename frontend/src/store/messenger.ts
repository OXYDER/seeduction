import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';
import type { PublicStatus } from '../lib/presence';

export interface MsgUser { id: string; username: string; avatarUrl?: string | null; role?: string }
export interface Reaction { emoji: string; userIds: string[] }
export interface TorrentCardData {
  id: string; adult: boolean; name?: string; coverImage?: string | null; size?: number; seeders?: number; leechers?: number;
  resolution?: string | null; year?: number | null; category?: string | null;
}
export type MsgType = 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE' | 'GIF' | 'SYSTEM' | 'BOT_ANSWER' | 'TICKET_OFFER';
export interface Msg {
  id: string;
  conversationId: string;
  type: MsgType;
  createdAt: string;
  editedAt?: string | null;
  deleted: boolean;
  sender: MsgUser;
  content: string;
  replyTo: { id: string; type: string; senderId: string; senderUsername: string; preview: string } | null;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mime?: string | null;
  durationMs?: number | null;
  mentionIds: string[];
  torrent: TorrentCardData | null;
  reactions: Reaction[];
  // Local seulement
  pending?: boolean;
  failed?: string;
}
export interface SendInput {
  content?: string;
  type?: string;
  replyToId?: string | null;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mime?: string | null;
  durationMs?: number | null;
  torrentId?: string | null;
}
export interface ConvSummary {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'CHANNEL';
  name: string | null;
  slug?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  other: (MsgUser & { status: PublicStatus }) | null;
  members?: (MsgUser & { role: string })[];
  memberCount?: number;
  last: { id: string; type: string; preview: string; senderId: string; senderUsername: string; createdAt: string } | null;
  unread: number;
  mentions: number;
  mutedUntil: string | null;
  pinned: boolean;
  archived: boolean;
  myRole: string;
  /** Messages épinglés (le plus ancien d'abord) ; la liste complète se charge à part. */
  pinnedMessageIds: string[];
  /** Message du jour d'un canal et sa date de dernière modification. */
  motd?: string | null;
  motdAt?: string | null;
  writable: boolean;
  position: number;
  lastMessageAt: string;
}
export interface Thread {
  messages: Msg[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  myLastReadAt: string | null;
  readBy: { userId: string; lastReadAt: string }[];
  error?: string;
}
export interface DockWindow { conversationId: string; minimized: boolean }

const MAX_WINDOWS = 3;
const emptyThread = (): Thread => ({ messages: [], hasMore: false, loading: false, loaded: false, myLastReadAt: null, readBy: [] });
const byDate = (a: Msg, b: Msg) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);

function mergeMessage(list: Msg[], m: Msg): Msg[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) return list.map((x, j) => (j === i ? m : x));
  const next = [...list, m];
  const last = list[list.length - 1];
  return last && byDate(last, m) > 0 ? next.sort(byDate) : next;
}

function isMuted(c: { mutedUntil: string | null }) {
  return !!c.mutedUntil && new Date(c.mutedUntil).getTime() > Date.now();
}

/** Nombre total de non lus qui comptent pour la pastille (conversations non muettes et non archivées). */
export function totalUnreadOf(conversations: ConvSummary[]) {
  return conversations.reduce((n, c) => (c.archived || isMuted(c) ? n : n + c.unread), 0);
}

/** Non lus séparés en messages privés (1 à 1 et groupes) et messages publics (canaux), sans compter les conversations muettes ou archivées. */
export function privateUnreadOf(conversations: ConvSummary[]) {
  return conversations.reduce((n, c) => (c.type === 'CHANNEL' || c.archived || isMuted(c) ? n : n + c.unread), 0);
}
export function publicUnreadOf(conversations: ConvSummary[]) {
  return conversations.reduce((n, c) => (c.type !== 'CHANNEL' || c.archived || isMuted(c) ? n : n + c.unread), 0);
}

interface MsgrState {
  socket: Socket | null;
  connected: boolean;
  myId: string | null;
  myUsername: string | null;
  conversations: ConvSummary[];
  convLoaded: boolean;
  threads: Record<string, Thread>;
  typing: Record<string, Record<string, { username: string; at: number }>>;
  online: Record<string, PublicStatus>;
  onlineList: { id: string; username: string; status: PublicStatus }[];
  windows: DockWindow[];
  /** conversationId -> nombre de vues qui l'affichent en ce moment (page ouverte dessus, fenêtre déployée). */
  visible: Record<string, number>;
  /** Dernière annonce (« un nouveau message ») pour le son / la notification du navigateur. */
  incoming: { id: string; conversationId: string; at: number } | null;
  settings: { sound: boolean; desktop: boolean };

  connect: (token: string, me: { id: string; username: string }) => void;
  disconnect: () => void;
  loadConversations: () => Promise<void>;
  ensureConversation: (id: string) => Promise<boolean>;
  loadThread: (conversationId: string) => Promise<void>;
  loadOlder: (conversationId: string) => Promise<void>;
  send: (conversationId: string, input: SendInput) => void;
  retry: (conversationId: string, tempId: string) => void;
  dismissFailed: (conversationId: string, tempId: string) => void;
  edit: (messageId: string, content: string) => Promise<string | null>;
  remove: (messageId: string) => Promise<string | null>;
  react: (messageId: string, emoji: string) => void;
  typingPing: (conversationId: string) => void;
  markRead: (conversationId: string) => void;
  setVisible: (conversationId: string, on: boolean) => void;
  openDirect: (user: { id: string; username: string; avatarUrl?: string | null }, opts?: { window?: boolean }) => Promise<ConvSummary | null>;
  openWindow: (conversationId: string, opts?: { minimized?: boolean }) => void;
  closeWindow: (conversationId: string) => void;
  toggleMinimize: (conversationId: string) => void;
  patchConversation: (id: string, patch: Partial<ConvSummary>) => void;
  setSettings: (patch: Partial<{ sound: boolean; desktop: boolean }>) => void;
}

const SETTINGS_KEY = 'seeduction:messenger-settings';
function loadSettings() {
  try { return { sound: true, desktop: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return { sound: true, desktop: false }; }
}

let refreshTimer: number | null = null;
let readTimers: Record<string, number> = {};

export const useMessenger = create<MsgrState>((set, get) => {
  /** Ajoute / met à jour une conversation dans la liste (la remonte selon son activité). */
  function upsertConversation(c: ConvSummary) {
    set((s) => ({ conversations: s.conversations.some((x) => x.id === c.id) ? s.conversations.map((x) => (x.id === c.id ? c : x)) : [c, ...s.conversations] }));
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(() => { refreshTimer = null; get().loadConversations(); }, 300);
  }

  function applyIncoming(m: Msg) {
    const s = get();
    const mine = m.sender.id === s.myId;
    const viewing = (s.visible[m.conversationId] ?? 0) > 0 && document.visibilityState === 'visible';
    const known = s.conversations.some((c) => c.id === m.conversationId);

    set((st) => {
      const t = st.threads[m.conversationId];
      const threads = t?.loaded ? { ...st.threads, [m.conversationId]: { ...t, messages: mergeMessage(t.messages, m) } } : st.threads;
      const conversations = st.conversations.map((c) => {
        if (c.id !== m.conversationId) return c;
        const mentionsMe = !!st.myId && m.mentionIds.includes(st.myId);
        return {
          ...c,
          last: { id: m.id, type: m.type, preview: m.content ? m.content.slice(0, 100) : m.type === 'IMAGE' ? '📷 Photo' : m.type === 'VOICE' ? '🎤 Message vocal' : m.type === 'GIF' ? 'GIF' : m.fileName ? `📎 ${m.fileName}` : m.torrent ? '🎬 Torrent partagé' : '', senderId: m.sender.id, senderUsername: m.sender.username, createdAt: m.createdAt },
          lastMessageAt: m.createdAt,
          unread: mine || viewing ? c.unread : c.unread + 1,
          mentions: mine || viewing || !mentionsMe ? c.mentions : c.mentions + 1,
        };
      });
      conversations.sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.type === 'CHANNEL' && b.type === 'CHANNEL' ? a.position - b.position : new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()));
      return { threads, conversations };
    });

    if (!known) {
      // Première fois qu'on reçoit quelque chose de cette conversation : on la charge, et une bulle réduite apparaît.
      api.get(`/messenger/conversations/${m.conversationId}`).then((r) => {
        upsertConversation({ ...r.data, unread: mine || viewing ? 0 : 1 });
        if (!mine && !viewing) get().openWindow(m.conversationId, { minimized: true });
      }).catch(() => {});
    }
    if (!mine && !viewing) {
      const conv = get().conversations.find((c) => c.id === m.conversationId);
      const w = get().windows;
      // Un message privé reçu fait apparaître la bulle de la discussion (réduite), sans l'ouvrir de force.
      if (conv && conv.type !== 'CHANNEL' && !w.some((x) => x.conversationId === m.conversationId) && !isMuted(conv)) get().openWindow(m.conversationId, { minimized: true });
      if (!(conv && isMuted(conv))) set({ incoming: { id: m.id, conversationId: m.conversationId, at: Date.now() } });
    }
    if (viewing && !mine) get().markRead(m.conversationId);
  }

  return {
    socket: null,
    connected: false,
    myId: null,
    myUsername: null,
    conversations: [],
    convLoaded: false,
    threads: {},
    typing: {},
    online: {},
    onlineList: [],
    windows: [],
    visible: {},
    incoming: null,
    settings: loadSettings(),

    connect(token, me) {
      if (get().socket) return;
      set({ myId: me.id, myUsername: me.username });
      const socket = io('/messenger', { auth: { token }, transports: ['websocket', 'polling'] });

      let wasConnected = false;
      socket.on('connect', () => {
        set({ connected: true });
        get().loadConversations();
        // Reconnexion après une coupure : on rattrape les messages manqués dans les conversations déjà ouvertes.
        if (wasConnected) {
          Object.entries(get().threads).filter(([, t]) => t.loaded).forEach(([id]) => {
            api.get(`/messenger/conversations/${id}/messages`, { params: { limit: 40 } }).then((r) => {
              set((s) => {
                const t = s.threads[id];
                if (!t) return {};
                let messages = t.messages;
                for (const m of r.data.messages as Msg[]) messages = mergeMessage(messages, m);
                return { threads: { ...s.threads, [id]: { ...t, messages, readBy: r.data.readBy } } };
              });
            }).catch(() => {});
          });
        }
        wasConnected = true;
      });
      socket.on('disconnect', () => set({ connected: false }));

      socket.on('presence:online', (list: { id: string; username: string; status: PublicStatus }[]) => {
        set({ onlineList: list, online: Object.fromEntries(list.map((u) => [u.id, u.status])) });
      });
      socket.on('message:new', (m: Msg) => applyIncoming(m));
      socket.on('message:updated', (m: Msg) => {
        set((s) => {
          const t = s.threads[m.conversationId];
          return {
            threads: t ? { ...s.threads, [m.conversationId]: { ...t, messages: t.messages.map((x) => (x.id === m.id ? m : x)) } } : s.threads,
            conversations: s.conversations.map((c) => (c.id === m.conversationId && c.last?.id === m.id ? { ...c, last: { ...c.last, preview: m.deleted ? 'Message supprimé' : m.content.slice(0, 100) || c.last.preview } } : c)),
          };
        });
      });
      socket.on('message:reactions', ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: Reaction[] }) => {
        set((s) => {
          const t = s.threads[conversationId];
          return t ? { threads: { ...s.threads, [conversationId]: { ...t, messages: t.messages.map((x) => (x.id === messageId ? { ...x, reactions } : x)) } } } : {};
        });
      });
      socket.on('conversation:typing', ({ conversationId, userId, username }: { conversationId: string; userId: string; username: string }) => {
        if (userId === get().myId) return;
        set((s) => ({ typing: { ...s.typing, [conversationId]: { ...(s.typing[conversationId] ?? {}), [userId]: { username, at: Date.now() } } } }));
      });
      socket.on('conversation:read', ({ conversationId, userId, at }: { conversationId: string; userId: string; at: string }) => {
        if (userId === get().myId) return;
        set((s) => {
          const t = s.threads[conversationId];
          if (!t) return {};
          const others = t.readBy.filter((r) => r.userId !== userId);
          return { threads: { ...s.threads, [conversationId]: { ...t, readBy: [...others, { userId, lastReadAt: at }] } } };
        });
      });
      socket.on('conversation:read-self', ({ conversationId }: { conversationId: string }) => {
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0, mentions: 0 } : c)) }));
      });
      socket.on('conversation:pinned', ({ conversationId, pinnedMessageIds }: { conversationId: string; pinnedMessageIds: string[] }) => {
        get().patchConversation(conversationId, { pinnedMessageIds });
      });
      socket.on('conversation:changed', () => scheduleRefresh());

      set({ socket });
    },

    disconnect() {
      get().socket?.disconnect();
      set({ socket: null, connected: false, conversations: [], convLoaded: false, threads: {}, typing: {}, online: {}, onlineList: [], windows: [], visible: {}, myId: null });
    },

    async loadConversations() {
      try {
        const { data } = await api.get('/messenger/conversations');
        set((s) => {
          // Une discussion tout juste ouverte (aucun message encore) n'est pas dans la liste du serveur : on la garde.
          const serverIds = new Set((data as ConvSummary[]).map((c) => c.id));
          const justOpened = s.conversations.filter((c) => !serverIds.has(c.id) && c.type === 'DIRECT' && c.last === null);
          return { conversations: [...data, ...justOpened], convLoaded: true };
        });
      } catch { set({ convLoaded: true }); }
    },

    async ensureConversation(id) {
      if (get().conversations.some((c) => c.id === id)) return true;
      try {
        const { data } = await api.get(`/messenger/conversations/${id}`);
        upsertConversation(data);
        return true;
      } catch { return false; }
    },

    async loadThread(conversationId) {
      const cur = get().threads[conversationId];
      if (cur?.loaded || cur?.loading) return;
      set((s) => ({ threads: { ...s.threads, [conversationId]: { ...(cur ?? emptyThread()), loading: true, error: undefined } } }));
      try {
        const { data } = await api.get(`/messenger/conversations/${conversationId}/messages`, { params: { limit: 40 } });
        set((s) => ({
          threads: {
            ...s.threads,
            [conversationId]: { messages: data.messages, hasMore: data.hasMore, loading: false, loaded: true, myLastReadAt: data.myLastReadAt, readBy: data.readBy },
          },
        }));
      } catch (err: any) {
        set((s) => ({ threads: { ...s.threads, [conversationId]: { ...emptyThread(), error: err.response?.data?.message ?? 'Impossible de charger la conversation' } } }));
      }
    },

    async loadOlder(conversationId) {
      const t = get().threads[conversationId];
      if (!t || t.loading || !t.hasMore || t.messages.length === 0) return;
      set((s) => ({ threads: { ...s.threads, [conversationId]: { ...t, loading: true } } }));
      try {
        const oldest = t.messages.find((m) => !m.pending);
        const { data } = await api.get(`/messenger/conversations/${conversationId}/messages`, { params: { limit: 40, before: oldest?.id } });
        set((s) => {
          const cur = s.threads[conversationId];
          const known = new Set(cur.messages.map((m) => m.id));
          return { threads: { ...s.threads, [conversationId]: { ...cur, loading: false, hasMore: data.hasMore, messages: [...data.messages.filter((m: Msg) => !known.has(m.id)), ...cur.messages] } } };
        });
      } catch {
        set((s) => ({ threads: { ...s.threads, [conversationId]: { ...s.threads[conversationId], loading: false } } }));
      }
    },

    send(conversationId, input) {
      const s = get();
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const replyTo = input.replyToId ? s.threads[conversationId]?.messages.find((m) => m.id === input.replyToId) : undefined;
      const pending: Msg = {
        id: tempId, conversationId, type: (input.type as MsgType) ?? (input.imageUrl ? 'IMAGE' : input.fileUrl ? 'FILE' : 'TEXT'), createdAt: new Date().toISOString(), deleted: false,
        sender: { id: s.myId ?? '', username: s.myUsername ?? '' }, content: input.content ?? '', imageUrl: input.imageUrl, fileUrl: input.fileUrl, fileName: input.fileName,
        fileSize: input.fileSize, mime: input.mime, durationMs: input.durationMs, mentionIds: [], torrent: null, reactions: [], pending: true,
        replyTo: replyTo ? { id: replyTo.id, type: replyTo.type, senderId: replyTo.sender.id, senderUsername: replyTo.sender.username, preview: replyTo.content.slice(0, 100) } : null,
      };
      set((st) => {
        const t = st.threads[conversationId] ?? emptyThread();
        return { threads: { ...st.threads, [conversationId]: { ...t, messages: [...t.messages, pending] } } };
      });

      const settle = (res: { ok: boolean; message?: Msg; error?: string }) => {
        set((st) => {
          const t = st.threads[conversationId];
          if (!t) return {};
          let messages = t.messages.filter((m) => m.id !== tempId);
          if (res.ok && res.message) messages = mergeMessage(messages, res.message);
          else messages = [...messages, { ...pending, pending: false, failed: res.error ?? 'Envoi impossible' }].sort(byDate);
          return { threads: { ...st.threads, [conversationId]: { ...t, messages } } };
        });
        if (res.ok) get().markRead(conversationId);
      };

      const payload = { ...input, conversationId, clientId: tempId };
      if (s.socket?.connected) {
        s.socket.timeout(15000).emit('message:send', payload, (err: any, res: any) => settle(err ? { ok: false, error: 'Pas de réponse du serveur' } : res));
      } else {
        // Websocket indisponible : on passe par l'API pour ne pas perdre le message.
        api.post(`/messenger/conversations/${conversationId}/messages`, input)
          .then((r) => settle({ ok: true, message: r.data }))
          .catch((err) => settle({ ok: false, error: err.response?.data?.message ?? 'Envoi impossible' }));
      }
    },

    retry(conversationId, tempId) {
      const m = get().threads[conversationId]?.messages.find((x) => x.id === tempId);
      if (!m) return;
      get().dismissFailed(conversationId, tempId);
      get().send(conversationId, { content: m.content, replyToId: m.replyTo?.id, imageUrl: m.imageUrl, fileUrl: m.fileUrl, fileName: m.fileName, fileSize: m.fileSize, mime: m.mime, durationMs: m.durationMs, type: m.type });
    },

    dismissFailed(conversationId, tempId) {
      set((s) => {
        const t = s.threads[conversationId];
        return t ? { threads: { ...s.threads, [conversationId]: { ...t, messages: t.messages.filter((m) => m.id !== tempId) } } } : {};
      });
    },

    async edit(messageId, content) {
      try { await api.patch(`/messenger/messages/${messageId}`, { content }); return null; }
      catch (err: any) { return err.response?.data?.message ?? 'Modification impossible'; }
    },

    async remove(messageId) {
      try { await api.delete(`/messenger/messages/${messageId}`); return null; }
      catch (err: any) { return err.response?.data?.message ?? 'Suppression impossible'; }
    },

    react(messageId, emoji) {
      const s = get();
      if (s.socket?.connected) s.socket.emit('message:react', { messageId, emoji });
      else api.post(`/messenger/messages/${messageId}/reactions`, { emoji }).catch(() => {});
    },

    typingPing(conversationId) {
      get().socket?.emit('conversation:typing', { conversationId });
    },

    markRead(conversationId) {
      // Regroupé : plusieurs messages d'affilée ne déclenchent qu'un seul « lu » côté serveur.
      if (readTimers[conversationId]) return;
      readTimers[conversationId] = window.setTimeout(() => {
        delete readTimers[conversationId];
        const s = get();
        set({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0, mentions: 0 } : c)) });
        if (s.socket?.connected) s.socket.emit('conversation:read', { conversationId });
        else api.post(`/messenger/conversations/${conversationId}/read`).catch(() => {});
      }, 250);
    },

    setVisible(conversationId, on) {
      set((s) => ({ visible: { ...s.visible, [conversationId]: Math.max(0, (s.visible[conversationId] ?? 0) + (on ? 1 : -1)) } }));
      if (on) get().markRead(conversationId);
    },

    async openDirect(user, opts) {
      try {
        const { data } = await api.post('/messenger/direct', { userId: user.id });
        upsertConversation(data);
        if (opts?.window !== false) get().openWindow(data.id);
        return data as ConvSummary;
      } catch (err: any) {
        // Le message d'erreur (ex. « n'accepte les messages que de ses amis ») s'affiche là où l'action a été faite.
        window.alert(err.response?.data?.message ?? "Impossible d'ouvrir la discussion");
        return null;
      }
    },

    openWindow(conversationId, opts) {
      const minimized = !!opts?.minimized;
      set((s) => {
        const existing = s.windows.find((w) => w.conversationId === conversationId);
        // Déjà là : une demande explicite la déploie, un simple message reçu ne la dérange pas.
        if (existing) return minimized ? {} : { windows: s.windows.map((w) => (w.conversationId === conversationId ? { ...w, minimized: false } : w)) };
        const trimmed = s.windows.length >= MAX_WINDOWS ? s.windows.slice(1) : s.windows;
        return { windows: [...trimmed, { conversationId, minimized }] };
      });
      if (!minimized) get().loadThread(conversationId);
    },

    closeWindow(conversationId) {
      set((s) => ({ windows: s.windows.filter((w) => w.conversationId !== conversationId) }));
    },

    toggleMinimize(conversationId) {
      set((s) => ({ windows: s.windows.map((w) => (w.conversationId === conversationId ? { ...w, minimized: !w.minimized } : w)) }));
      if (!get().windows.find((w) => w.conversationId === conversationId)?.minimized) get().loadThread(conversationId);
    },

    patchConversation(id, patch) {
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    },

    setSettings(patch) {
      set((s) => {
        const settings = { ...s.settings, ...patch };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* préférence valable pour cette visite */ }
        return { settings };
      });
    },
  };
});

/** Statut de présence affiché pour un membre : celui du direct s'il est connecté, sinon hors ligne. */
export function statusOf(online: Record<string, PublicStatus>, userId?: string | null): PublicStatus {
  return (userId && online[userId]) || 'OFFLINE';
}
