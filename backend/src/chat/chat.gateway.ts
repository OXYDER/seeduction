import { Injectable, Logger } from '@nestjs/common';
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

interface ChatSocket extends Socket {
  data: { userId: string; username: string; role: string };
}

const MIN_INTERVAL_MS = 1500; // anti-spam : un message par utilisateur toutes les 1.5s minimum

@Injectable()
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private lastMessageAt = new Map<string, number>();
  private onlineUserIds = new Map<string, string>(); // socketId -> userId

  constructor(private jwtService: JwtService, private chatService: ChatService) {}

  async handleConnection(client: ChatSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET ?? 'change-me-in-.env' });
      client.data = { userId: payload.sub, username: payload.username, role: payload.role };
      this.onlineUserIds.set(client.id, payload.sub);
      this.server.emit('chat:presence', { count: this.onlineUserIds.size });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: ChatSocket) {
    this.onlineUserIds.delete(client.id);
    this.server.emit('chat:presence', { count: this.onlineUserIds.size });
  }

  @SubscribeMessage('chat:message')
  async onMessage(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { content: string }) {
    const userId = client.data?.userId;
    if (!userId) return;

    const last = this.lastMessageAt.get(userId) ?? 0;
    if (Date.now() - last < MIN_INTERVAL_MS) {
      client.emit('chat:error', 'Tu envoies des messages trop vite, attends un instant.');
      return;
    }

    try {
      const message = await this.chatService.create(userId, body?.content);
      this.lastMessageAt.set(userId, Date.now());
      this.server.emit('chat:message', message);
    } catch (err: any) {
      client.emit('chat:error', err?.message ?? 'Message invalide');
    }
  }

  /** Appelé par ChatController après une suppression staff (REST) pour retirer le message chez tout le monde en direct. */
  broadcastDelete(id: string) {
    this.server.emit('chat:delete', { id });
  }
}
