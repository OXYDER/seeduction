import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../presence/presence.service';

const MAX_LENGTH = 4000;
const userSelect = { id: true, username: true, avatarUrl: true };

/**
 * Discussions privées façon « Messenger » : distinctes de la messagerie classique (sujet + destinataire libre).
 * Par défaut, n'importe quel membre peut en écrire un autre (comme une demande de message Messenger) ; un membre peut
 * restreindre ça à ses amis seulement (voir `dmPrivacy` sur User, réglable dans son compte).
 */
@Injectable()
export class DmService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private presence: PresenceService) {}

  /** Identifiant de fil stable et déterministe pour une paire de membres, indépendant de qui écrit le premier. */
  threadKey(a: string, b: string) {
    return `dm-${[a, b].sort().join('-')}`;
  }

  private async areFriends(aId: string, bId: string) {
    return !!(await this.prisma.friendship.findFirst({
      where: { status: 'ACCEPTED', OR: [{ requesterId: aId, addresseeId: bId }, { requesterId: bId, addresseeId: aId }] },
    }));
  }

  /** true si `fromId` a le droit d'écrire à `toId`, selon la préférence de `toId` (tout le monde, ou ses amis seulement). */
  private async canMessage(fromId: string, toId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: toId }, select: { dmPrivacy: true } });
    if (!target) return false;
    if (target.dmPrivacy === 'EVERYONE') return true;
    return this.areFriends(fromId, toId);
  }

  private async assertCanMessage(fromId: string, toId: string) {
    if (!(await this.canMessage(fromId, toId))) {
      throw new ForbiddenException("Ce membre n'accepte les messages privés que de ses amis");
    }
  }

  /** Amis et discussions déjà entamées, avec le dernier message (s'il y en a un) et le nombre de non lus, triés par activité récente. */
  async conversations(userId: string) {
    const [friendships, threadMessages] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
        include: { requester: { select: userSelect }, addressee: { select: userSelect } },
      }),
      this.prisma.privateMessage.findMany({
        where: { threadId: { startsWith: 'dm-' }, OR: [{ senderId: userId }, { recipientId: userId }] },
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: userSelect }, recipient: { select: userSelect } },
      }),
    ]);

    const others = new Map<string, { id: string; username: string; avatarUrl: string | null }>();
    for (const f of friendships) {
      const other = f.requesterId === userId ? f.addressee : f.requester;
      others.set(other.id, other);
    }
    for (const m of threadMessages) {
      const other = m.senderId === userId ? m.recipient : m.sender;
      if (!others.has(other.id)) others.set(other.id, other);
    }
    if (others.size === 0) return [];

    const byOther = new Map<string, typeof threadMessages>();
    for (const m of threadMessages) {
      const otherId = m.senderId === userId ? m.recipientId : m.senderId;
      const arr = byOther.get(otherId) ?? [];
      arr.push(m);
      byOther.set(otherId, arr);
    }

    return [...others.values()]
      .map((other) => {
        const thread = byOther.get(other.id) ?? [];
        const last = thread[0];
        const unread = thread.filter((m) => m.recipientId === userId && !m.read).length;
        return {
          friend: { ...other, online: this.presence.isOnline(other.id) },
          last: last ? { content: last.content.slice(0, 140), createdAt: last.createdAt, fromMe: last.senderId === userId } : null,
          unread,
        };
      })
      .sort((a, b) => {
        const at = a.last ? new Date(a.last.createdAt).getTime() : 0;
        const bt = b.last ? new Date(b.last.createdAt).getTime() : 0;
        return bt - at;
      });
  }

  async unreadCount(userId: string) {
    return this.prisma.privateMessage.count({ where: { recipientId: userId, read: false, threadId: { startsWith: 'dm-' } } });
  }

  /** Historique avec un membre ; marque les messages reçus comme lus. Autorisé s'il n'a pas restreint ses messages à ses amis. */
  async history(userId: string, otherId: string) {
    await this.assertCanMessage(userId, otherId);
    const threadId = this.threadKey(userId, otherId);
    const messages = await this.prisma.privateMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: 300,
      include: { sender: { select: userSelect } },
    });
    await this.prisma.privateMessage.updateMany({ where: { threadId, recipientId: userId, read: false }, data: { read: true } });
    return messages.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt, fromMe: m.senderId === userId, read: m.read }));
  }

  async send(fromId: string, fromUsername: string, toId: string, content: string) {
    const text = (content ?? '').trim();
    if (!text) throw new BadRequestException('Message vide');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (${MAX_LENGTH} caractères maximum)`);
    if (toId === fromId) throw new BadRequestException("Tu ne peux pas t'écrire à toi-même");
    await this.assertCanMessage(fromId, toId);

    const threadId = this.threadKey(fromId, toId);
    const message = await this.prisma.privateMessage.create({
      data: { threadId, subject: '', content: text, senderId: fromId, recipientId: toId },
      include: { sender: { select: userSelect } },
    });

    if (!this.presence.isOnline(toId)) {
      await this.notifications.notify({
        userId: toId, type: 'MESSAGE', title: `Nouveau message de ${fromUsername}`,
        body: text.slice(0, 120), link: '/friends',
      });
    }
    return { id: message.id, content: message.content, createdAt: message.createdAt, sender: message.sender };
  }

  async markRead(userId: string, otherId: string) {
    const threadId = this.threadKey(userId, otherId);
    await this.prisma.privateMessage.updateMany({ where: { threadId, recipientId: userId, read: false }, data: { read: true } });
    return { ok: true };
  }
}
