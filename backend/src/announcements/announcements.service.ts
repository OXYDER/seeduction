import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  list(limit = 5) {
    return this.prisma.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { author: { select: { username: true } } },
    });
  }

  create(authorId: string, title: string, content: string, pinned = false) {
    return this.prisma.announcement.create({
      data: { title, content, pinned, author: { connect: { id: authorId } } },
    });
  }

  delete(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}
