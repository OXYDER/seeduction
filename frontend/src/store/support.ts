import { create } from 'zustand';
import { api } from '../api/client';

export interface SupportOverview {
  enabled: boolean;
  channelId: string | null;
  botUserId: string | null;
  botName: string;
  aiActive: boolean;
  staffOnline: number;
  hoursText: string;
  welcome: string;
  maxOpenPerMember: number;
}

interface SupportState {
  overview: SupportOverview | null;
  /** Billets de moi qui ont une réponse non lue. */
  mine: number;
  /** Billets en attente de l'équipe (staff seulement). */
  staff: number | null;
  loadOverview: () => Promise<SupportOverview | null>;
  refreshBadge: () => Promise<void>;
  reset: () => void;
}

/** Canal Support, assistant et pastilles des billets : partagés par le menu, la page Support et le Messenger. */
export const useSupport = create<SupportState>((set, get) => ({
  overview: null,
  mine: 0,
  staff: null,
  async loadOverview() {
    try {
      const { data } = await api.get('/support/overview');
      set({ overview: data });
      return data;
    } catch { return get().overview; }
  },
  async refreshBadge() {
    try {
      const { data } = await api.get('/support/badge');
      set({ mine: data.mine ?? 0, staff: data.staff ?? null });
    } catch { /* hors ligne */ }
  },
  reset: () => set({ overview: null, mine: 0, staff: null }),
}));

export const TICKET_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Ouvert', cls: 'open' },
  ANSWERED: { label: 'Répondu', cls: 'answered' },
  RESOLVED: { label: 'Résolu', cls: 'resolved' },
  CLOSED: { label: 'Fermé', cls: 'closed' },
};
export const TICKET_PRIORITY: Record<string, string> = { LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente' };

export interface TicketUser { id: string; username: string; avatarUrl?: string | null; role?: string }
export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  status: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  source: 'WEB' | 'CHAT' | 'STAFF';
  category: { id: string; name: string; icon: string | null } | null;
  requester: TicketUser;
  assignee: TicketUser | null;
  unread: boolean;
  lastReplyAt: string;
  lastReplyBy: 'MEMBER' | 'STAFF';
  createdAt: string;
  resolvedAt: string | null;
  rating: number | null;
  ratingComment: string | null;
}
export interface TicketAttachment { url: string; name: string; kind: 'image' | 'file'; size?: number }
export interface TicketMessage {
  id: string;
  kind: 'MEMBER' | 'STAFF' | 'EVENT' | 'CHAT';
  internal: boolean;
  content: string;
  attachments: TicketAttachment[];
  createdAt: string;
  author: TicketUser | null;
}
export interface TicketDetail extends TicketSummary { messages: TicketMessage[] }
