import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  inbox(userId: string) {
    return this.prisma.privateMessage.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: { username: true } } },
    });
  }

  sent(userId: string) {
    return this.prisma.privateMessage.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      include: { recipient: { select: { username: true } } },
    });
  }

  async send(senderId: string, senderUsername: string, recipientUsername: string, subject: string, content: string) {
    const message = await this.prisma.privateMessage.create({
      data: {
        subject,
        content,
        sender: { connect: { id: senderId } },
        recipient: { connect: { username: recipientUsername } },
      },
    });
    await this.notifications.notify({
      userId: message.recipientId,
      type: 'MESSAGE',
      title: `Nouveau message de ${senderUsername}`,
      body: subject,
      link: '/messages',
    });
    return message;
  }

  markRead(messageId: string, userId: string) {
    return this.prisma.privateMessage.updateMany({
      where: { id: messageId, recipientId: userId },
      data: { read: true },
    });
  }

  unreadCount(userId: string) {
    return this.prisma.privateMessage.count({ where: { recipientId: userId, read: false } });
  }
}
