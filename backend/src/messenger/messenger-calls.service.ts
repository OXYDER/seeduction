import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { Actor, MessengerService } from './messenger.service';

type EndReason = 'ended' | 'declined' | 'cancelled' | 'missed' | 'busy' | 'dropped';

interface Call {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  video: boolean;
  state: 'ringing' | 'active';
  createdAt: number;
  answeredAt?: number;
  /** Les signaux WebRTC vont de socket à socket : l'onglet qui a lancé l'appel et celui qui l'a décroché. */
  callerSocket: string;
  calleeSocket?: string;
  ringTimer?: NodeJS.Timeout;
}

/** Comment le service parle aux clients (branché par la gateway au démarrage). */
export interface CallSink {
  toUser(userId: string, event: string, payload: any, exceptSocketId?: string): void;
  toSocket(socketId: string, event: string, payload: any): void;
}

const RING_MS = 45_000;
const MAX_SIGNAL_BYTES = 24_000;

/**
 * Appels audio / vidéo 1 à 1 (WebRTC). Le serveur ne voit jamais le son ni l'image : il ne fait que sonner chez l'autre,
 * relayer les messages de négociation (SDP / ICE) et garder une trace dans la conversation. L'état des appels vit en
 * mémoire : un redémarrage du serveur coupe les appels en cours (les clients le constatent à la déconnexion).
 */
@Injectable()
export class MessengerCallsService {
  private log = new Logger('MessengerCalls');
  private calls = new Map<string, Call>();
  private byUser = new Map<string, string>();
  private sink: CallSink | null = null;

  constructor(private messenger: MessengerService, private presence: PresenceService, private prisma: PrismaService) {}

  attach(sink: CallSink) { this.sink = sink; }

  /** Serveurs STUN / TURN donnés au navigateur. Le TURN (facultatif) sert aux réseaux qui bloquent le pair à pair. */
  iceServers(userId: string) {
    const servers: any[] = [{ urls: (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean) }];
    const urls = (process.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (urls.length) {
      if (process.env.TURN_SECRET) {
        // Identifiants temporaires (mode « use-auth-secret » de coturn) : valables 6 h, jamais un mot de passe fixe côté navigateur.
        const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${userId}`;
        servers.push({ urls, username, credential: createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64') });
      } else if (process.env.TURN_USERNAME) {
        servers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_PASSWORD ?? '' });
      }
    }
    return { iceServers: servers, relay: urls.length > 0 };
  }

  private busy(userId: string) { return this.byUser.has(userId); }

  async invite(actor: Actor, socketId: string, conversationId: string, video: boolean) {
    await this.messenger.assertMessaging(actor.userId);
    if (this.busy(actor.userId)) return { ok: false as const, error: 'Tu es déjà en appel' };
    const calleeId = await this.messenger.callPeer(actor, conversationId);
    if (!this.presence.isOnline(calleeId) || this.presence.publicStatus(calleeId) === 'OFFLINE') return { ok: false as const, error: "Ce membre n'est pas en ligne" };
    const callee = await this.prisma.user.findUnique({ where: { id: calleeId }, select: { username: true, presenceStatus: true } });
    if (callee?.presenceStatus === 'BUSY') return { ok: false as const, error: 'Ce membre est occupé et ne souhaite pas être dérangé' };
    if (this.busy(calleeId)) {
      await this.messenger.logCall(conversationId, actor.userId, `📞 Appel ${video ? 'vidéo' : 'audio'} manqué (déjà en ligne)`);
      return { ok: false as const, error: 'Ce membre est déjà en appel' };
    }
    const caller = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, username: true, avatarUrl: true } });
    const call: Call = { id: randomUUID(), conversationId, callerId: actor.userId, calleeId, video: !!video, state: 'ringing', createdAt: Date.now(), callerSocket: socketId };
    this.calls.set(call.id, call);
    this.byUser.set(call.callerId, call.id);
    this.byUser.set(call.calleeId, call.id);
    call.ringTimer = setTimeout(() => { void this.finish(call, 'missed'); }, RING_MS);
    this.sink?.toUser(calleeId, 'call:incoming', { callId: call.id, conversationId, video: call.video, from: caller });
    return { ok: true as const, callId: call.id, peer: { id: calleeId, username: callee?.username ?? '' } };
  }

  accept(userId: string, socketId: string, callId: string) {
    const call = this.calls.get(callId);
    if (!call || call.calleeId !== userId || call.state !== 'ringing') return { ok: false as const, error: "Cet appel n'est plus disponible" };
    clearTimeout(call.ringTimer);
    call.state = 'active';
    call.answeredAt = Date.now();
    call.calleeSocket = socketId;
    this.sink?.toSocket(call.callerSocket, 'call:accepted', { callId });
    // Les autres onglets / appareils du destinataire arrêtent de sonner.
    this.sink?.toUser(userId, 'call:handled', { callId }, socketId);
    return { ok: true as const };
  }

  async decline(userId: string, callId: string) {
    const call = this.calls.get(callId);
    if (!call || call.calleeId !== userId || call.state !== 'ringing') return { ok: false as const };
    await this.finish(call, 'declined');
    return { ok: true as const };
  }

  /** Raccrocher : annule l'appel qui sonne encore, ou termine l'appel en cours. */
  async hangup(userId: string, callId: string) {
    const call = this.calls.get(callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) return { ok: false as const };
    if (call.state === 'ringing') await this.finish(call, call.callerId === userId ? 'cancelled' : 'declined');
    else await this.finish(call, 'ended');
    return { ok: true as const };
  }

  /** Relaie un message de négociation WebRTC (SDP / candidat ICE) ou un changement d'état (micro, caméra) vers l'autre participant. */
  relay(userId: string, callId: string, event: 'call:signal' | 'call:media', data: any) {
    const call = this.calls.get(callId);
    if (!call || call.state !== 'active') return { ok: false as const };
    const target = call.callerId === userId ? call.calleeSocket : call.calleeId === userId ? call.callerSocket : undefined;
    if (!target) return { ok: false as const };
    let size = 0;
    try { size = JSON.stringify(data ?? null).length; } catch { return { ok: false as const }; }
    if (size > MAX_SIGNAL_BYTES) return { ok: false as const };
    this.sink?.toSocket(target, event, { callId, data });
    return { ok: true as const };
  }

  /** Une connexion se ferme : si c'est celle d'un appel, l'appel est terminé pour l'autre aussi. */
  async onSocketGone(userId: string, socketId: string) {
    const id = this.byUser.get(userId);
    const call = id ? this.calls.get(id) : undefined;
    if (!call) return;
    if (call.state === 'active' && (call.callerSocket === socketId || call.calleeSocket === socketId)) await this.finish(call, 'dropped');
    else if (call.state === 'ringing' && call.callerId === userId && call.callerSocket === socketId) await this.finish(call, 'cancelled');
    else if (call.state === 'ringing' && call.calleeId === userId && !this.presence.isOnline(userId)) await this.finish(call, 'missed');
  }

  private async finish(call: Call, reason: EndReason) {
    if (!this.calls.delete(call.id)) return;
    clearTimeout(call.ringTimer);
    if (this.byUser.get(call.callerId) === call.id) this.byUser.delete(call.callerId);
    if (this.byUser.get(call.calleeId) === call.id) this.byUser.delete(call.calleeId);
    const payload = { callId: call.id, reason };
    this.sink?.toUser(call.callerId, 'call:ended', payload);
    this.sink?.toUser(call.calleeId, 'call:ended', payload);
    const kind = call.video ? 'vidéo' : 'audio';
    let text: string | null = null;
    if (call.state === 'active' && call.answeredAt) {
      const s = Math.max(1, Math.round((Date.now() - call.answeredAt) / 1000));
      text = `📞 Appel ${kind} · ${s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`}`;
    } else if (reason === 'declined') text = `📞 Appel ${kind} refusé`;
    else if (reason === 'missed' || reason === 'cancelled') text = `📞 Appel ${kind} manqué`;
    if (text) await this.messenger.logCall(call.conversationId, call.callerId, text).catch((err) => this.log.warn(`Trace d'appel impossible : ${err?.message}`));
  }
}
