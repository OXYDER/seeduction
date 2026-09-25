import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../presence/presence.service';

const MAX_LENGTH = 4000;
const userSelect = { id: true, username: true, avatarUrl: true };

/** Discussions privées entre amis (style « Messenger ») : distinctes de la messagerie classique (sujet + destinataire libre). */
@Injectable()
export class DmService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private presence: PresenceService) {}

  /** Identifiant de fil stable et déterministe pour une paire de membres, indépendant de qui écrit le premier. */
  threadKey(a: string, b: string) {
    return `dm-${[a, b].sort().join('-')}`;
  }

  private async assertFriends(meId: string, otherId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: { status: 'ACCEPTED', OR: [{ requesterId: meId, addresseeId: otherId }, { requesterId: otherId, addresseeId: meId }] },
    });
    if (!friendship) throw new ForbiddenException('Vous devez être amis pour vous écrire ici');
  }

  /** Amis avec le dernier message échangé (s'il y en a un) et le nombre de messages non lus, triés par activité récente. */
  async conversations(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
    });
    const friends = friendships.map((f) => (f.requesterId === userId ? f.addressee : f.requester));
    if (friends.length === 0) return [];

    const threadKeys = friends.map((f) => this.threadKey(userId, f.id));
    const messages = await this.prisma.privateMessage.findMany({
      where: { threadId: { in: threadKeys } },
      orderBy: { createdAt: 'desc' },
    });
    const byThread = new Map<string, typeof messages>();
    for (const m of messages) {
      const arr = byThread.get(m.threadId!) ?? [];
      arr.push(m);
      byThread.set(m.threadId!, arr);
    }

    return friends
      .map((friend) => {
        const key = this.threadKey(userId, friend.id);
        const thread = byThread.get(key) ?? [];
        const last = thread[0];
        const unread = thread.filter((m) => m.recipientId === userId && !m.read).length;
        return {
          friend: { ...friend, online: this.presence.isOnline(friend.id) },
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

  /** Historique avec un ami ; marque les messages reçus comme lus. */
  async history(userId: string, friendId: string) {
    await this.assertFriends(userId, friendId);
    const threadId = this.threadKey(userId, friendId);
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
    await this.assertFriends(fromId, toId);

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

  async markRead(userId: string, friendId: string) {
    const threadId = this.threadKey(userId, friendId);
    await this.prisma.privateMessage.updateMany({ where: { threadId, recipientId: userId, read: false }, data: { read: true } });
    return { ok: true };
  }
}
