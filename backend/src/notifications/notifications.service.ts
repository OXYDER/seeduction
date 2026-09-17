import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

// Dérivé du enum Prisma plutôt que retapé à la main : sinon un nouveau type de
// notification (comme BADGE_EARNED) compile côté schema mais casse ici en silence.
type NotifyInput = {
  userId: string;
  type: NotificationType;
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
