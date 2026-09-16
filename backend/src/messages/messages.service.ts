import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

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

  send(senderId: string, recipientUsername: string, subject: string, content: string) {
    return this.prisma.privateMessage.create({
      data: {
        subject,
        content,
        sender: { connect: { id: senderId } },
        recipient: { connect: { username: recipientUsername } },
      },
    });
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
