import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_LENGTH = 10_000;
const userSelect = { id: true, username: true, avatarUrl: true };

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ------------------------------------------------------------------ anciens endpoints (boîte / envoyés)

  inbox(userId: string) {
    return this.prisma.privateMessage.findMany({
      where: { recipientId: userId, deletedByRecipient: false },
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: userSelect } },
    });
  }

  sent(userId: string) {
    return this.prisma.privateMessage.findMany({
      where: { senderId: userId, deletedBySender: false },
      orderBy: { createdAt: 'desc' },
      include: { recipient: { select: userSelect } },
    });
  }

  unreadCount(userId: string) {
    return this.prisma.privateMessage.count({ where: { recipientId: userId, read: false, deletedByRecipient: false } });
  }

  markRead(messageId: string, userId: string) {
    return this.prisma.privateMessage.updateMany({ where: { id: messageId, recipientId: userId }, data: { read: true } });
  }

  // ------------------------------------------------------------------ conversations

  /** Clé de conversation : le threadId, ou l'identifiant du message pour un ancien message sans fil. */
  private key(m: { id: string; threadId: string | null }) {
    return m.threadId ?? m.id;
  }

  /** Liste des conversations du membre, la plus récente d'abord, avec le nombre de messages non lus. */
  async threads(userId: string) {
    const messages = await this.prisma.privateMessage.findMany({
      where: {
        OR: [
          { senderId: userId, deletedBySender: false },
          { recipientId: userId, deletedByRecipient: false },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
    });

    const map = new Map<string, any>();
    for (const m of messages) {
      const k = this.key(m);
      const other = m.senderId === userId ? m.recipient : m.sender;
      const current = map.get(k);
      if (!current) {
        map.set(k, {
          threadId: k, subject: m.subject, other, count: 1,
          unread: m.recipientId === userId && !m.read ? 1 : 0,
          last: { snippet: m.content.replace(/\[[^\]]*\]/g, '').slice(0, 120), createdAt: m.createdAt, fromMe: m.senderId === userId },
        });
      } else {
        current.count++;
        current.subject = m.subject.replace(/^Re: /, ''); // le plus ancien (parcours du plus récent au plus ancien) donne le sujet d'origine
        if (m.recipientId === userId && !m.read) current.unread++;
      }
    }
    return [...map.values()];
  }

  /** Une conversation complète ; les messages reçus sont marqués comme lus. */
  async thread(threadId: string, userId: string) {
    const messages = await this.prisma.privateMessage.findMany({
      where: { OR: [{ threadId }, { id: threadId, threadId: null }] },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
    });
    if (messages.length === 0) throw new NotFoundException('Conversation introuvable');
    if (!messages.some((m) => m.senderId === userId || m.recipientId === userId)) throw new ForbiddenException('Cette conversation ne te concerne pas');

    const visible = messages.filter((m) => (m.senderId === userId ? !m.deletedBySender : m.recipientId === userId ? !m.deletedByRecipient : false));
    await this.prisma.privateMessage.updateMany({
      where: { id: { in: visible.filter((m) => m.recipientId === userId && !m.read).map((m) => m.id) } },
      data: { read: true },
    });
    const first = messages[0];
    return {
      threadId,
      subject: first.subject,
      other: first.senderId === userId ? first.recipient : first.sender,
      messages: visible.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt, fromMe: m.senderId === userId, sender: m.sender })),
    };
  }

  async send(senderId: string, senderUsername: string, recipientUsername: string, subject: string, content: string) {
    const text = content?.trim();
    if (!text || !subject?.trim()) throw new BadRequestException('Sujet et message requis');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (${MAX_LENGTH} caractères maximum)`);
    const recipient = await this.prisma.user.findUnique({ where: { username: String(recipientUsername ?? '').trim() }, select: { id: true, status: true } });
    if (!recipient) throw new NotFoundException(`Aucun membre nommé « ${recipientUsername} »`);
    if (recipient.id === senderId) throw new BadRequestException('Tu ne peux pas t\'écrire à toi-même');

    const id = randomUUID();
    const message = await this.prisma.privateMessage.create({
      data: { id, threadId: id, subject: subject.trim().slice(0, 200), content: text, senderId, recipientId: recipient.id },
    });
    await this.notifications.notify({
      userId: recipient.id,
      type: 'MESSAGE',
      title: `Nouveau message de ${senderUsername}`,
      body: message.subject,
      link: `/messages?thread=${id}`,
    });
    return { threadId: id, id: message.id };
  }

  async reply(threadId: string, userId: string, username: string, content: string) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Message vide');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (${MAX_LENGTH} caractères maximum)`);
    const messages = await this.prisma.privateMessage.findMany({ where: { OR: [{ threadId }, { id: threadId, threadId: null }] }, orderBy: { createdAt: 'asc' } });
    if (messages.length === 0) throw new NotFoundException('Conversation introuvable');
    const first = messages[0];
    if (first.senderId !== userId && first.recipientId !== userId) throw new ForbiddenException('Cette conversation ne te concerne pas');
    const otherId = first.senderId === userId ? first.recipientId : first.senderId;

    const message = await this.prisma.privateMessage.create({
      data: {
        threadId, subject: first.subject.startsWith('Re: ') ? first.subject : `Re: ${first.subject}`, content: text, senderId: userId, recipientId: otherId,
        // Une réponse fait « réapparaître » la conversation chez celui qui l'avait supprimée.
        deletedBySender: false, deletedByRecipient: false,
      },
    });
    // Si l'ancien fil n'avait pas d'identifiant de conversation, on le rattache maintenant.
    if (first.threadId === null) await this.prisma.privateMessage.update({ where: { id: first.id }, data: { threadId } });
    // La conversation réapparaît aussi pour l'autre personne si elle l'avait supprimée.
    await this.prisma.privateMessage.updateMany({
      where: { threadId, senderId: otherId, deletedBySender: true }, data: { deletedBySender: false },
    });
    await this.prisma.privateMessage.updateMany({
      where: { threadId, recipientId: otherId, deletedByRecipient: true }, data: { deletedByRecipient: false },
    });
    await this.notifications.notify({
      userId: otherId,
      type: 'MESSAGE',
      title: `Réponse de ${username}`,
      body: first.subject.replace(/^Re: /, ''),
      link: `/messages?thread=${threadId}`,
    });
    return { id: message.id };
  }

  /** « Supprime » la conversation pour ce membre seulement (l'autre la garde). */
  async deleteThread(threadId: string, userId: string) {
    await this.prisma.privateMessage.updateMany({ where: { threadId, senderId: userId }, data: { deletedBySender: true } });
    await this.prisma.privateMessage.updateMany({ where: { threadId, recipientId: userId }, data: { deletedByRecipient: true } });
    // Ancien message isolé (sans threadId)
    await this.prisma.privateMessage.updateMany({ where: { id: threadId, threadId: null, senderId: userId }, data: { deletedBySender: true } });
    await this.prisma.privateMessage.updateMany({ where: { id: threadId, threadId: null, recipientId: userId }, data: { deletedByRecipient: true } });
    return { deleted: true };
  }
}
