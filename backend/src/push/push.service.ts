import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { openText, sealText } from '../common/utils/seal';
import { MAX_SUBSCRIPTIONS, PushThrottle, buildPayload, isGone, validEndpoint, validKeys, type PushPayload } from '../common/utils/push';

const KEY = 'pushVapid';
const PURPOSE = 'push-vapid';

/**
 * Notifications push : l'application installée (ou le navigateur) reçoit les notifications du site même fermée. Les clés VAPID du serveur sont créées au premier usage et rangées chiffrées en base ;
 * chaque appareil abonné reçoit un message chiffré de bout en bout, envoyé uniquement aux services des navigateurs (Google, Mozilla, Apple, Microsoft).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private keyPair: { publicKey: string; privateKey: string } | null = null;
  private throttle = new PushThrottle();
  private tests = new Map<string, number[]>();

  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  private async keys() {
    if (this.keyPair) return this.keyPair;
    const saved = (await this.settings.get<{ publicKey: string; privateSealed: string }>(KEY)) ?? null;
    const priv = saved ? openText(saved.privateSealed, PURPOSE) : null;
    if (saved && priv) { this.keyPair = { publicKey: saved.publicKey, privateKey: priv }; return this.keyPair; }
    // première fois (ou JWT_SECRET changé : la clé rangée n'est plus lisible) : nouvelles clés ; les anciens abonnements ne servent plus à rien, les appareils se réabonneront
    const fresh = webpush.generateVAPIDKeys();
    await this.settings.set(KEY, { publicKey: fresh.publicKey, privateSealed: sealText(fresh.privateKey, PURPOSE) });
    if (saved) { await this.prisma.pushSubscription.deleteMany({}); this.logger.warn('Clés push régénérées : les appareils doivent se réabonner'); }
    this.keyPair = fresh;
    return fresh;
  }

  async publicKey(): Promise<string> { return (await this.keys()).publicKey; }

  async status(userId: string) {
    const rows = await this.prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastPushAt: true } });
    return { max: MAX_SUBSCRIPTIONS, devices: rows.map((r) => ({ id: r.id, endpoint: r.endpoint, userAgent: r.userAgent, createdAt: r.createdAt, lastPushAt: r.lastPushAt })) };
  }

  async subscribe(userId: string, body: { endpoint?: unknown; keys?: unknown; userAgent?: unknown }) {
    const endpoint = validEndpoint(body?.endpoint);
    const keys = validKeys(body?.keys);
    if (!endpoint || !keys) throw new BadRequestException("Abonnement refusé : ce navigateur n'envoie pas un abonnement valide");
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } });
    if (!existing && (await this.prisma.pushSubscription.count({ where: { userId } })) >= MAX_SUBSCRIPTIONS) throw new BadRequestException(`Tu as déjà ${MAX_SUBSCRIPTIONS} appareils : retire-en un d'abord`);
    const userAgent = String(body?.userAgent ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
    // un même appareil qui change de profil ou de compte : l'abonnement passe au nouveau propriétaire (jamais deux comptes sur le même appareil)
    await this.prisma.pushSubscription.upsert({ where: { endpoint }, create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent }, update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, failures: 0 } });
    return this.status(userId);
  }

  async unsubscribe(userId: string, endpoint: unknown) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint: String(endpoint ?? '') } });
    return this.status(userId);
  }

  async removeDevice(userId: string, id: string) {
    const r = await this.prisma.pushSubscription.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Appareil introuvable');
    return this.status(userId);
  }

  /** Envoie un message de test à tous les appareils du membre (5 essais par minute au plus). */
  async test(userId: string) {
    const now = Date.now();
    const recent = (this.tests.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 5) throw new BadRequestException('Trop d\'essais : réessaie dans une minute');
    this.tests.set(userId, [...recent, now]);
    const sent = await this.sendTo(userId, { title: '🔔 Notifications Seeduction', body: 'Ça fonctionne : tu recevras tes notifications ici.', url: '/notifications', tag: 'test' });
    return { sent };
  }

  /** Une notification du site (créée ou regroupée) devient un message push, au plus un par minute et par regroupement. */
  async fromNotification(n: { id: string; userId: string; title: string; body?: string | null; link?: string | null; groupKey?: string | null; category?: string }) {
    if (!this.throttle.allow(`${n.userId}:${n.groupKey ?? n.id}`)) return 0;
    return this.sendTo(n.userId, buildPayload(n));
  }

  /** Annonce à tout le monde : seuls les membres qui ont au moins un appareil abonné sont touchés, par petits groupes. */
  async sendToMany(userIds: string[], payload: PushPayload): Promise<number> {
    if (userIds.length === 0) return 0;
    const withDevice = await this.prisma.pushSubscription.groupBy({ by: ['userId'], where: { userId: { in: userIds } } });
    let sent = 0;
    for (let i = 0; i < withDevice.length; i += 20) sent += (await Promise.all(withDevice.slice(i, i + 20).map((g) => this.sendTo(g.userId, payload)))).reduce((a, b) => a + b, 0);
    return sent;
  }

  async sendTo(userId: string, payload: PushPayload): Promise<number> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return 0;
    const kp = await this.keys();
    const subject = process.env.SITE_URL && /^https:\/\//.test(process.env.SITE_URL) ? process.env.SITE_URL : 'mailto:no-reply@seeduction.invalid';
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { vapidDetails: { subject, publicKey: kp.publicKey, privateKey: kp.privateKey }, TTL: 3600, timeout: 10_000 });
        sent++;
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastPushAt: new Date(), failures: 0 } }).catch(() => undefined);
      } catch (e: any) {
        if (isGone(e?.statusCode)) { await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } }); return; }
        const failures = s.failures + 1;
        if (failures >= 5) await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { failures } }).catch(() => undefined);
        this.logger.debug(`Push vers un appareil de ${userId} : ${e?.statusCode ?? ''} ${e?.message ?? e}`);
      }
    }));
    return sent;
  }
}
