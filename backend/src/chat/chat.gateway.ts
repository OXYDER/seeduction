import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { PresenceService } from '../presence/presence.service';

interface ChatSocket extends Socket {
  data: { userId: string; username: string; role: string };
}

const MIN_INTERVAL_MS = 1500; // anti-spam : un message par utilisateur toutes les 1.5s minimum

@Injectable()
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private lastMessageAt = new Map<string, number>();
  // Dernier message vu par chaque membre (en mémoire seulement, remis à zéro si le serveur redémarre — sans conséquence).
  private lastSeen = new Map<string, string>();

  constructor(private jwtService: JwtService, private chatService: ChatService, private presence: PresenceService) {}

  /** La présence (chat public + chat privé + reste du site) est partagée : tout changement met à jour la liste des membres en ligne. */
  onModuleInit() {
    this.presence.on('presence-changed', () => this.broadcastOnlineUsers());
    this.presence.on('status-changed', () => this.broadcastOnlineUsers());
  }

  private broadcastOnlineUsers() {
    this.server?.emit('chat:online-users', this.presence.listOnline());
  }

  async handleConnection(client: ChatSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET ?? 'change-me-in-.env' });
      client.data = { userId: payload.sub, username: payload.username, role: payload.role };
      await this.presence.connect(payload.sub, client.id, payload.username);
      client.emit('chat:online-users', this.presence.listOnline());
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: ChatSocket) {
    if (!client.data?.userId) return;
    this.presence.disconnect(client.data.userId, client.id);
  }

  @SubscribeMessage('chat:message')
  async onMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { content?: string; imageUrl?: string; fileUrl?: string; fileName?: string; fileSize?: number },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    // Les pièces jointes (photo, fichier) passent déjà par un upload authentifié séparé : seul le texte est anti-spammé.
    if (!body?.imageUrl && !body?.fileUrl) {
      const last = this.lastMessageAt.get(userId) ?? 0;
      if (Date.now() - last < MIN_INTERVAL_MS) {
        client.emit('chat:error', 'Tu envoies des messages trop vite, attends un instant.');
        return;
      }
    }

    try {
      const message = await this.chatService.create(userId, body ?? {});
      this.lastMessageAt.set(userId, Date.now());
      this.server.emit('chat:message', message);
    } catch (err: any) {
      client.emit('chat:error', err?.message ?? 'Message invalide');
    }
  }

  @SubscribeMessage('chat:typing')
  onTyping(@ConnectedSocket() client: ChatSocket) {
    if (!client.data?.userId) return;
    client.broadcast.emit('chat:typing', { userId: client.data.userId, username: client.data.username });
  }

  @SubscribeMessage('chat:reaction')
  async onReaction(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { messageId: string; emoji: string }) {
    if (!client.data?.userId || !body?.messageId || !body?.emoji) return;
    try {
      const reactions = await this.chatService.react(client.data.userId, body.messageId, body.emoji);
      this.server.emit('chat:reaction-update', { messageId: body.messageId, reactions });
    } catch {
      // réaction refusée (message supprimé entre-temps, etc.) : on l'ignore silencieusement
    }
  }

  @SubscribeMessage('chat:seen')
  onSeen(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { messageId: string }) {
    if (!client.data?.userId || !body?.messageId) return;
    this.lastSeen.set(client.data.userId, body.messageId);
    client.broadcast.emit('chat:seen-update', { userId: client.data.userId, username: client.data.username, messageId: body.messageId });
  }

  /** Appelé par ChatController après une suppression staff (REST) pour retirer le message chez tout le monde en direct. */
  broadcastDelete(id: string) {
    this.server.emit('chat:delete', { id });
  }
}
