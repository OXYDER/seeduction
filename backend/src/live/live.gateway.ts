import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { lockState } from '../lockdown/lockdown-state';
import { PrismaService } from '../common/prisma.service';
import { loadIdentity, sessionRefusal } from '../common/utils/session-identity';
import { jwtSecret } from '../common/utils/secret';
import { cleanChatText, InteractionConfig, LiveRoomState } from '../common/utils/live-room';
import { LiveService } from './live.service';

interface LiveSocket extends Socket {
  data: { userId: string; username: string; role: string; joined: boolean; interactions: boolean };
}

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/**
 * Salle du direct : nombre de spectateurs, chat et réactions pendant une diffusion (page « Direct »). Deux groupes :
 * « live » (tous les spectateurs : nombre de personnes) et « live-i » (ceux qui ont gardé le chat et les réactions : le bouton du lecteur les coupe, et le serveur
 * cesse alors de leur envoyer quoi que ce soit). Rien n'est enregistré : tout repart de zéro à chaque nouvelle diffusion.
 */
@Injectable()
@WebSocketGateway({ namespace: '/live', cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' } })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly log = new Logger(LiveGateway.name);
  private room = new LiveRoomState();
  private timers: NodeJS.Timeout[] = [];
  private lastViewers = -1;
  private wasLive = false;
  private cache: { at: number; live: boolean; cfg: InteractionConfig | null } = { at: 0, live: false, cfg: null };

  constructor(private jwt: JwtService, private prisma: PrismaService, private live: LiveService) {
    lockState.onLock(() => this.server?.disconnectSockets(true));
  }

  onModuleInit() {
    // Réactions : envoyées groupées toutes les 0,7 s (200 spectateurs qui appuient en même temps = quelques animations, pas 200).
    this.timers.push(setInterval(() => {
      const counts = this.room.takeReactions();
      if (Object.keys(counts).length) this.server?.to('live-i').emit('live:reactions', counts);
    }, 700));
    // Nombre de spectateurs : seulement s'il a changé, au plus toutes les 2 s.
    this.timers.push(setInterval(() => {
      const n = this.room.count();
      if (n !== this.lastViewers) { this.lastViewers = n; this.server?.to('live').emit('live:viewers', { count: n }); }
    }, 2000));
    // Fin de la diffusion : le chat repart de zéro pour la suivante.
    this.timers.push(setInterval(async () => {
      const { live } = await this.state(true).catch(() => ({ live: this.wasLive }));
      if (this.wasLive && !live) { this.room.reset(); this.server?.to('live').emit('live:reset'); }
      this.wasLive = live;
    }, 10_000));
  }

  onModuleDestroy() { this.timers.forEach(clearInterval); }

  /** Diffusion en cours ? et réglages : lus au plus toutes les 5 s (chaque message ne doit pas interroger la base). */
  private async state(force = false) {
    if (force || Date.now() - this.cache.at > 5000) {
      const [s, cfg] = await Promise.all([this.live.forMembers(), this.live.interactions()]);
      this.cache = { at: Date.now(), live: !!s.live, cfg };
    }
    return { live: this.cache.live, cfg: this.cache.cfg! };
  }

  async handleConnection(client: LiveSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (!token || typeof token !== 'string') { client.disconnect(); return; }
    try {
      const payload = this.jwt.verify(token, { secret: jwtSecret() });
      if (lockState.blocking || lockState.tokenRevoked(payload.iat)) { client.disconnect(); return; }
      if (payload.scope === 'account') { client.disconnect(); return; }
      const ident = await loadIdentity(this.prisma, payload.sub);
      if (sessionRefusal(ident, payload.iat)) { client.disconnect(); return; }
      client.data = { userId: payload.sub, username: payload.username, role: ident!.role, joined: false, interactions: true };
      // La vérification de la session est asynchrone : le client ne doit rejoindre la salle qu'après ce signal (sinon sa demande arrive trop tôt et est ignorée).
      client.emit('live:ready');
    } catch { client.disconnect(); }
  }

  handleDisconnect(client: LiveSocket) {
    if (!client.data?.userId) return;
    this.room.leave(client.id);
  }

  @SubscribeMessage('live:join')
  async onJoin(@ConnectedSocket() client: LiveSocket) {
    if (!client.data?.userId) return;
    const { cfg } = await this.state();
    client.data.joined = true;
    void client.join('live');
    if (client.data.interactions) void client.join('live-i');
    this.room.join(client.data.userId, client.id);
    client.emit('live:init', {
      viewers: this.room.count(),
      messages: client.data.interactions && cfg.chat ? this.room.recent() : [],
      config: { chat: cfg.chat, reactions: cfg.reactions, emojis: cfg.emojis, slowSeconds: cfg.slowSeconds, maxLen: cfg.maxLen, reactionsPerMinute: cfg.reactionsPerMinute },
      staff: STAFF.includes(client.data.role),
    });
  }

  @SubscribeMessage('live:leave')
  onLeave(@ConnectedSocket() client: LiveSocket) {
    if (!client.data?.userId) return;
    client.data.joined = false;
    void client.leave('live'); void client.leave('live-i');
    this.room.leave(client.id);
  }

  /** Le bouton « Couper le chat et les réactions » du lecteur : le serveur cesse d'envoyer messages et réactions à ce spectateur (il reste compté parmi les spectateurs). */
  @SubscribeMessage('live:prefs')
  async onPrefs(@ConnectedSocket() client: LiveSocket, @MessageBody() body: { interactions?: boolean }) {
    if (!client.data?.userId) return;
    client.data.interactions = body?.interactions !== false;
    if (!client.data.joined) return;
    if (client.data.interactions) {
      void client.join('live-i');
      const { cfg } = await this.state();
      client.emit('live:backlog', cfg.chat ? this.room.recent() : []);
    } else void client.leave('live-i');
  }

  @SubscribeMessage('live:chat')
  async onChat(@ConnectedSocket() client: LiveSocket, @MessageBody() body: { text?: string }) {
    const d = client.data;
    if (!d?.userId || !d.joined) return;
    const { live, cfg } = await this.state();
    if (!live) { client.emit('live:error', 'Aucune diffusion en cours.'); return; }
    const staff = STAFF.includes(d.role);
    const ok = this.room.canChat(d.userId, cfg);
    if (!ok.ok) { client.emit('live:error', ok.reason); return; }
    const clean = cleanChatText(body?.text, cfg.maxLen, staff);
    if ('error' in clean) { client.emit('live:error', clean.error); return; }
    const entry = this.room.addChat({ userId: d.userId, username: d.username, role: d.role, text: clean.text });
    this.server.to('live-i').emit('live:chat', entry);
  }

  @SubscribeMessage('live:react')
  async onReact(@ConnectedSocket() client: LiveSocket, @MessageBody() body: { emoji?: string }) {
    const d = client.data;
    if (!d?.userId || !d.joined) return;
    const { live, cfg } = await this.state();
    if (!live) return;
    const ok = this.room.canReact(d.userId, body?.emoji, cfg);
    if (!ok.ok) { client.emit('live:error', ok.reason); return; }
    this.room.addReaction(d.userId, body!.emoji!);
  }

  // ── Équipe : retirer un message, réduire un membre au silence ────────────
  @SubscribeMessage('live:delete')
  onDelete(@ConnectedSocket() client: LiveSocket, @MessageBody() body: { id?: string }) {
    if (!client.data?.userId || !STAFF.includes(client.data.role) || typeof body?.id !== 'string') return;
    if (this.room.deleteChat(body.id)) this.server.to('live-i').emit('live:chat-delete', { id: body.id });
  }

  @SubscribeMessage('live:mute')
  onMute(@ConnectedSocket() client: LiveSocket, @MessageBody() body: { userId?: string; minutes?: number }) {
    if (!client.data?.userId || !STAFF.includes(client.data.role) || typeof body?.userId !== 'string') return;
    this.room.mute(body.userId, Number(body.minutes) || 10);
    client.emit('live:notice', 'Membre réduit au silence.');
  }
}
