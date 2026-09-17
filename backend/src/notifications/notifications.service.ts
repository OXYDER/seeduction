import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

type NotifyInput = {
  userId: string;
  type: 'MESSAGE' | 'FORUM_REPLY' | 'REQUEST_FILLED' | 'TORRENT_APPROVED' | 'TORRENT_REJECTED' | 'ANNOUNCEMENT' | 'INVITE_USED';
  title: string;
  body?: string;
  link?: string;
};

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Point d'entrée utilisé par les autres modules (messages, forum, demandes, admin...) pour créer une notification. */
  notify(input: NotifyInput) {
    return this.prisma.notification.create({ data: input });
  }

  /** Diffuse une notification à tous les membres (annonces globales). */
  async notifyAll(input: Omit<NotifyInput, 'userId'>) {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return this.prisma.notification.createMany({
      data: users.map((u) => ({ ...input, userId: u.id })),
    });
  }

  list(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  }
}
