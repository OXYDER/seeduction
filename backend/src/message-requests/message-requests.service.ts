import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const DAY = 86_400_000;
export const INTRO_MAX = 1000;
const RETRY_AFTER_DECLINE_DAYS = 7;
const PENDING_MAX = 10;

export const REQUEST_REQUIRED = 'MESSAGE_REQUEST_REQUIRED';

/**
 * Demandes de message : pour écrire à quelqu'un qui n'est pas son ami, il faut d'abord lui envoyer une demande (message d'introduction facultatif) ; il l'accepte ou la refuse.
 * L'équipe (modérateurs et plus) n'a pas besoin d'approbation, dans les deux sens. Une discussion déjà commencée, ou une amitié, ouvre le droit d'écrire sans demande.
 */
@Injectable()
export class MessageRequestsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  private async roles(a: string, b: string) {
    const rows = await this.prisma.user.findMany({ where: { id: { in: [a, b] } }, select: { id: true, role: true, username: true, status: true, dmPrivacy: true } });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async blocked(a: string, b: string) {
    return !!(await this.prisma.friendship.findFirst({ where: { status: 'BLOCKED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] }, select: { id: true } }));
  }

  private async friends(a: string, b: string) {
    return !!(await this.prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] }, select: { id: true } }));
  }

  /** Une discussion existe déjà entre les deux (messagerie instantanée ou messages privés) : elle reste ouverte, sans demande. */
  private async hasHistory(a: string, b: string) {
    const key = [a, b].sort().join(':');
    const [conv, pm] = await Promise.all([
      this.prisma.conversation.findUnique({ where: { directKey: key }, select: { id: true } }),
      this.prisma.privateMessage.findFirst({ where: { OR: [{ senderId: a, recipientId: b }, { senderId: b, recipientId: a }] }, select: { id: true } }),
    ]);
    return !!conv || !!pm;
  }

  /** Peut-on écrire à ce membre tout de suite ? Sinon pourquoi, et la demande éventuelle. */
  async status(fromId: string, toId: string) {
    const users = await this.roles(fromId, toId);
    const target = users.get(toId), me = users.get(fromId);
    if (!target || !me) throw new NotFoundException('Membre introuvable');
    const targetName = target.username;
    if (await this.blocked(fromId, toId)) return { allowed: false, reason: 'blocked' as string, request: null as any, incoming: null as any, targetName };
    if (STAFF.includes(me.role) || STAFF.includes(target.role)) return { allowed: true, reason: 'staff' as string, request: null as any, incoming: null as any, targetName };
    if (await this.friends(fromId, toId)) return { allowed: true, reason: 'friends' as string, request: null as any, incoming: null as any, targetName };
    if (target.dmPrivacy === 'FRIENDS_ONLY') return { allowed: false, reason: 'friends_only' as string, request: null as any, incoming: null as any, targetName };
    const req = await this.prisma.messageRequest.findFirst({ where: { OR: [{ fromId, toId }, { fromId: toId, toId: fromId }] }, orderBy: { createdAt: 'desc' } });
    if (req?.status === 'ACCEPTED') return { allowed: true, reason: 'accepted' as string, request: null as any, incoming: null as any, targetName };
    if (await this.hasHistory(fromId, toId)) return { allowed: true, reason: 'history' as string, request: null as any, incoming: null as any, targetName };
    const mine = req && req.fromId === fromId ? req : null;
    const retryAt = mine?.status === 'DECLINED' && mine.respondedAt ? new Date(mine.respondedAt.getTime() + RETRY_AFTER_DECLINE_DAYS * DAY) : null;
    return {
      allowed: false, reason: 'request_required' as string, targetName,
      request: mine ? { id: mine.id, status: mine.status, retryAt: retryAt && retryAt > new Date() ? retryAt : null } : (null as any),
      // une demande reçue de ce membre : on peut l'accepter au lieu d'en envoyer une
      incoming: req && req.toId === fromId && req.status === 'PENDING' ? { id: req.id } : (null as any),
    };
  }

  /** Utilisé par la messagerie : lève l'erreur « demande requise » (reconnue par le site, qui ouvre alors la fenêtre de demande). */
  async assertCanContact(fromId: string, toId: string) {
    const s = await this.status(fromId, toId);
    if (s.allowed) return;
    if (s.reason === 'blocked') throw new ForbiddenException('Tu ne peux pas écrire à ce membre');
    if (s.reason === 'friends_only') throw new ForbiddenException("Ce membre n'accepte les messages privés que de ses amis");
    throw new ForbiddenException({ statusCode: 403, message: `Pour écrire à ${s.targetName}, envoie-lui d'abord une demande de message : il devra l'accepter avant que vous puissiez échanger.`, error: 'Forbidden', code: REQUEST_REQUIRED, toId, toUsername: s.targetName });
  }

  async send(fromId: string, toId: string, introRaw?: string) {
    if (fromId === toId) throw new BadRequestException("Tu ne peux pas t'écrire à toi-même");
    const s = await this.status(fromId, toId);
    if (s.allowed) throw new BadRequestException('Tu peux déjà lui écrire : aucune demande nécessaire.');
    if (s.reason === 'blocked') throw new ForbiddenException('Tu ne peux pas écrire à ce membre');
    if (s.reason === 'friends_only') throw new ForbiddenException("Ce membre n'accepte les messages privés que de ses amis");
    if (s.incoming) throw new BadRequestException("Ce membre t'a déjà envoyé une demande : accepte-la pour discuter.");
    if (s.request?.status === 'PENDING') throw new BadRequestException("Ta demande est déjà envoyée : il doit l'accepter.");
    if (s.request?.retryAt) throw new BadRequestException(`Ta demande a été refusée récemment : tu pourras en renvoyer une le ${new Date(s.request.retryAt).toLocaleDateString('fr-CA')}.`);
    const intro = String(introRaw ?? '').trim().slice(0, INTRO_MAX) || null;
    if ((await this.prisma.messageRequest.count({ where: { fromId, status: 'PENDING' } })) >= PENDING_MAX) throw new BadRequestException(`Tu as déjà ${PENDING_MAX} demandes en attente : attends les réponses.`);
    const me = await this.prisma.user.findUnique({ where: { id: fromId }, select: { username: true } });
    const row = await this.prisma.messageRequest.upsert({
      where: { fromId_toId: { fromId, toId } },
      create: { fromId, toId, intro },
      update: { intro, status: 'PENDING', respondedAt: null, createdAt: new Date() },
    });
    await this.notifications.notify({
      userId: toId, type: 'SYSTEM', category: 'messages', groupKey: `msgreq:${fromId}`,
      title: `✉️ ${me?.username ?? 'Un membre'} voudrait t'écrire`, body: (intro ?? 'Demande de message').slice(0, 200), link: '/messages?demandes=1',
    }).catch(() => undefined);
    return row;
  }

  private async load(userId: string, id: string) {
    const r = await this.prisma.messageRequest.findUnique({ where: { id } });
    if (!r || r.toId !== userId) throw new NotFoundException('Demande introuvable');
    if (r.status !== 'PENDING') throw new BadRequestException('Cette demande a déjà été traitée');
    return r;
  }

  async accept(userId: string, id: string) {
    const r = await this.load(userId, id);
    await this.prisma.messageRequest.update({ where: { id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    await this.notifications.notify({ userId: r.fromId, type: 'SYSTEM', category: 'messages', title: `✅ ${me?.username ?? 'Ce membre'} a accepté ta demande`, body: 'Vous pouvez maintenant discuter.', link: `/messages?to=${encodeURIComponent(me?.username ?? '')}` }).catch(() => undefined);
    return { ok: true, fromId: r.fromId };
  }

  /** Refuser ne prévient pas l'expéditeur par une notification (pas de message hostile) : il voit seulement que la demande n'a pas abouti, et ne peut pas la renvoyer avant 7 jours. */
  async decline(userId: string, id: string) {
    await this.load(userId, id);
    await this.prisma.messageRequest.update({ where: { id }, data: { status: 'DECLINED', respondedAt: new Date() } });
    return { ok: true };
  }

  async cancel(userId: string, id: string) {
    const r = await this.prisma.messageRequest.findUnique({ where: { id } });
    if (!r || r.fromId !== userId || r.status !== 'PENDING') throw new NotFoundException('Demande introuvable');
    await this.prisma.messageRequest.delete({ where: { id } });
    return { ok: true };
  }

  /** Demandes reçues en attente, et mes demandes envoyées récentes. */
  async list(userId: string) {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.messageRequest.findMany({ where: { toId: userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.messageRequest.findMany({ where: { fromId: userId, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const ids = [...new Set([...incoming.map((r) => r.fromId), ...outgoing.map((r) => r.toId)])];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatarUrl: true, role: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      incoming: incoming.map((r) => ({ id: r.id, intro: r.intro, createdAt: r.createdAt, from: byId.get(r.fromId) ?? null })),
      outgoing: outgoing.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, to: byId.get(r.toId) ?? null })),
      pendingCount: incoming.length,
    };
  }
}
