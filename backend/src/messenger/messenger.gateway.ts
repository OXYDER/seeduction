import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { MessengerService, RealtimeEvent, SendInput } from './messenger.service';
import { PresenceService } from '../presence/presence.service';

interface MessengerSocket extends Socket {
  data: { userId: string; username: string; role: string };
}

const userRoom = (userId: string) => `user:${userId}`;
const channelRoom = (conversationId: string) => `channel:${conversationId}`;

// Anti-spam : au plus 8 messages par tranche de 10 secondes et par membre (en plus du mode lent d'un canal).
const WINDOW_MS = 10_000;
const MAX_IN_WINDOW = 8;

/**
 * Temps réel du Messenger : une seule websocket (`/messenger`) pour tout — messages, frappe, « lu », réactions,
 * présence. Chaque membre rejoint sa salle personnelle (1 à 1 et groupes) et celle des canaux qu'il peut lire.
 * Les mutations passent par MessengerService (comme les routes REST) qui publie ici les événements à diffuser.
 */
@Injectable()
@WebSocketGateway({ namespace: '/messenger', cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' } })
export class MessengerGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Namespace;
  private readonly logger = new Logger(MessengerGateway.name);
  private sentAt = new Map<string, number[]>();
  private presenceTimer: NodeJS.Timeout | null = null;

  constructor(private jwtService: JwtService, private messenger: MessengerService, private presence: PresenceService) {}

  onModuleInit() {
    this.messenger.on('realtime', (e: RealtimeEvent) => {
      if (!this.server) return;
      if (e.channel) this.server.to(channelRoom(e.channel)).emit(e.event, e.payload);
      else if (e.userIds?.length) this.server.to(e.userIds.map(userRoom)).emit(e.event, e.payload);
    });
    // Canal créé / modifié / supprimé : chaque connexion rejoint ou quitte la salle du canal selon son rôle, puis tout le monde rafraîchit sa liste.
    this.messenger.on('channel:changed', async ({ id, removed }: { id: string; removed?: boolean }) => {
      if (!this.server) return;
      try {
        for (const s of await this.server.fetchSockets()) {
          const allowed = !removed && (await this.messenger.readableChannelIds({ role: (s.data as any)?.role ?? 'USER' })).includes(id);
          if (allowed) s.join(channelRoom(id)); else s.leave(channelRoom(id));
        }
      } catch (err: any) { this.logger.warn(`Mise à jour des salles de canal échouée : ${err?.message}`); }
      this.server.emit('conversation:changed', { conversationId: id, reason: 'channel' });
    });
    // La présence est partagée avec le reste du site : tout changement met à jour la liste des membres en ligne (regroupé pour ne pas inonder).
    const schedule = () => {
      if (this.presenceTimer) return;
      this.presenceTimer = setTimeout(() => {
        this.presenceTimer = null;
        this.server?.emit('presence:online', this.presence.listOnline());
      }, 400);
    };
    this.presence.on('presence-changed', schedule);
    this.presence.on('status-changed', schedule);
  }

  async handleConnection(client: MessengerSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (!token || typeof token !== 'string') { client.disconnect(); return; }
    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET ?? 'change-me-in-.env' });
      client.data = { userId: payload.sub, username: payload.username, role: payload.role };
      client.join(userRoom(payload.sub));
      for (const id of await this.messenger.readableChannelIds({ role: payload.role })) client.join(channelRoom(id));
      await this.presence.connect(payload.sub, client.id, payload.username);
      client.emit('presence:online', this.presence.listOnline());
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: MessengerSocket) {
    if (!client.data?.userId) return;
    this.presence.disconnect(client.data.userId, client.id);
    if (!this.presence.isOnline(client.data.userId)) this.sentAt.delete(client.data.userId);
  }

  private actor(client: MessengerSocket) {
    return { userId: client.data.userId, username: client.data.username, role: client.data.role };
  }

  private tooFast(userId: string) {
    const now = Date.now();
    const recent = (this.sentAt.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_IN_WINDOW) { this.sentAt.set(userId, recent); return true; }
    recent.push(now);
    this.sentAt.set(userId, recent);
    return false;
  }

  /** Les erreurs métier (droits, message vide...) reviennent à l'appelant dans l'accusé de réception, pas en exception de socket. */
  private async guard<T>(fn: () => Promise<T>) {
    try {
      return { ok: true as const, data: await fn() };
    } catch (err: any) {
      return { ok: false as const, error: err?.response?.message ?? err?.message ?? 'Action impossible' };
    }
  }

  @SubscribeMessage('message:send')
  async onSend(@ConnectedSocket() client: MessengerSocket, @MessageBody() body: SendInput & { conversationId: string; clientId?: string }) {
    if (!client.data?.userId || !body?.conversationId) return { ok: false, error: 'Requête invalide' };
    if (this.tooFast(client.data.userId)) return { ok: false, error: 'Tu envoies des messages trop vite, attends un instant.', clientId: body.clientId };
    const res = await this.guard(() => this.messenger.send(this.actor(client), body.conversationId, body));
    return res.ok ? { ok: true, message: res.data, clientId: body.clientId } : { ok: false, error: res.error, clientId: body.clientId };
  }

  @SubscribeMessage('message:edit')
  async onEdit(@ConnectedSocket() client: MessengerSocket, @MessageBody() body: { messageId: string; content: string }) {
    if (!client.data?.userId) return { ok: false };
    const res = await this.guard(() => this.messenger.edit(this.actor(client), body?.messageId, body?.content));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  @SubscribeMessage('message:delete')
  async onDelete(@ConnectedSocket() client: MessengerSocket, @MessageBody() body: { messageId: string }) {
    if (!client.data?.userId) return { ok: false };
    const res = await this.guard(() => this.messenger.remove(this.actor(client), body?.messageId));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  @SubscribeMessage('message:react')
  async onReact(@ConnectedSocket() client: MessengerSocket, @MessageBody() body: { messageId: string; emoji: string }) {
    if (!client.data?.userId) return { ok: false };
    const res = await this.guard(() => this.messenger.react(this.actor(client), body?.messageId, body?.emoji));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  @SubscribeMessage('conversation:read')
  async onRead(@ConnectedSocket() client: MessengerSocket, @MessageBody() body: { conversationId: string }) {
    if (!client.data?.userId || !body?.conversationId) return { ok: false };
    const res = await this.guard(() => this.messenger.markRead(this.actor(client), body.conversationId));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  @SubscribeMessage('conversation:typing')
  async onTyping(@ConnectedSocket() client: MessengerSocket, @MessageBody() body: { conversationId: string }) {
    if (!client.data?.userId || !body?.conversationId) return;
    const payload = { conversationId: body.conversationId, userId: client.data.userId, username: client.data.username };
    const audience = await this.messenger.audience(this.actor(client), body.conversationId).catch(() => null);
    if (!audience) return;
    if (audience.channel) client.to(channelRoom(audience.channel)).emit('conversation:typing', payload);
    else client.to(audience.userIds.filter((id) => id !== client.data.userId).map(userRoom)).emit('conversation:typing', payload);
  }
}
