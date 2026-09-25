import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../common/prisma.service';
import { DmService } from './dm.service';
import { PresenceService } from '../presence/presence.service';

interface DmSocket extends Socket {
  data: { userId: string; username: string };
}

const MIN_INTERVAL_MS = 400; // anti-spam, plus permissif que le chat public (discussion 1-à-1)

function room(userId: string) {
  return `user:${userId}`;
}

@Injectable()
@WebSocketGateway({
  namespace: '/dm',
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' },
})
export class DmGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DmGateway.name);
  private lastMessageAt = new Map<string, number>();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private dmService: DmService,
    private presence: PresenceService,
  ) {}

  /** Relaie les changements de présence (connexion/déconnexion/statut) aux amis du membre concerné, sans coupler les gateways entre elles. */
  onModuleInit() {
    this.presence.on('presence-changed', async ({ userId, online }: { userId: string; online: boolean }) => {
      const status = online ? this.presence.publicStatus(userId) : 'OFFLINE';
      for (const id of await this.friendIdsOf(userId)) this.server.to(room(id)).emit('dm:presence', { userId, status });
    });
    this.presence.on('status-changed', async ({ userId, status }: { userId: string; status: string }) => {
      for (const id of await this.friendIdsOf(userId)) this.server.to(room(id)).emit('dm:presence', { userId, status });
    });
  }

  private async friendIdsOf(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
  }

  async handleConnection(client: DmSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (!token || typeof token !== 'string') { client.disconnect(); return; }
    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET ?? 'change-me-in-.env' });
      client.data = { userId: payload.sub, username: payload.username };
      client.join(room(client.data.userId));
      await this.presence.connect(client.data.userId, client.id, client.data.username);

      const friendIds = await this.friendIdsOf(client.data.userId);
      client.emit('dm:online-friends', friendIds.map((id) => ({ userId: id, status: this.presence.publicStatus(id) })).filter((f) => f.status !== 'OFFLINE'));
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: DmSocket) {
    if (!client.data?.userId) return;
    this.presence.disconnect(client.data.userId, client.id);
  }

  @SubscribeMessage('dm:send')
  async onSend(@ConnectedSocket() client: DmSocket, @MessageBody() body: { toUserId: string; content: string }) {
    const userId = client.data?.userId;
    if (!userId || !body?.toUserId) return;
    const last = this.lastMessageAt.get(userId) ?? 0;
    if (Date.now() - last < MIN_INTERVAL_MS) return;
    try {
      const message = await this.dmService.send(userId, client.data.username, body.toUserId, body.content);
      this.lastMessageAt.set(userId, Date.now());
      const payload = { ...message, threadWith: { self: userId, other: body.toUserId } };
      this.server.to(room(userId)).emit('dm:message', { ...payload, fromMe: true, otherId: body.toUserId });
      this.server.to(room(body.toUserId)).emit('dm:message', { ...payload, fromMe: false, otherId: userId });
    } catch (err: any) {
      client.emit('dm:error', { toUserId: body.toUserId, message: err?.message ?? 'Message invalide' });
    }
  }

  @SubscribeMessage('dm:typing')
  onTyping(@ConnectedSocket() client: DmSocket, @MessageBody() body: { toUserId: string }) {
    if (!client.data?.userId || !body?.toUserId) return;
    this.server.to(room(body.toUserId)).emit('dm:typing', { fromUserId: client.data.userId });
  }

  @SubscribeMessage('dm:read')
  async onRead(@ConnectedSocket() client: DmSocket, @MessageBody() body: { friendId: string }) {
    if (!client.data?.userId || !body?.friendId) return;
    await this.dmService.markRead(client.data.userId, body.friendId);
    this.server.to(room(body.friendId)).emit('dm:seen', { byUserId: client.data.userId });
  }

  /** Utilisé par FriendsService pour prévenir le destinataire d'une demande d'ami en direct, s'il est en ligne. */
  notifyUser(userId: string, event: string, data: any) {
    this.server?.to(room(userId)).emit(event, data);
  }
}
