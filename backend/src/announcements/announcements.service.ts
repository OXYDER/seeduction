import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  list(limit = 5) {
    return this.prisma.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { author: { select: { username: true } } },
    });
  }

  async create(authorId: string, title: string, content: string, pinned = false) {
    const announcement = await this.prisma.announcement.create({
      data: { title, content, pinned, author: { connect: { id: authorId } } },
    });
    await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `📯 ${title}`, body: content, link: '/' });
    return announcement;
  }

  delete(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}
