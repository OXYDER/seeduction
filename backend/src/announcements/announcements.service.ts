import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  list(limit = 5) {
    return this.prisma.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { author: { select: { id: true, username: true, avatarUrl: true } } },
    });
  }

  /** Fil des nouvelles, paginé (les épinglées d'abord, puis les plus récentes). */
  async feed(page: number, pageSize = 10) {
    const safePage = Math.max(1, page || 1);
    const [total, items] = await Promise.all([
      this.prisma.announcement.count(),
      this.prisma.announcement.findMany({
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: (safePage - 1) * pageSize,
        take: pageSize,
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      }),
    ]);
    return { items, total, page: safePage, pageSize };
  }

  async findOne(id: string) {
    const item = await this.prisma.announcement.findUnique({ where: { id }, include: { author: { select: { id: true, username: true, avatarUrl: true } } } });
    if (!item) throw new NotFoundException('Nouvelle introuvable');
    return item;
  }

  private cleanImage(v: unknown): string | null | undefined {
    if (v === undefined) return undefined;
    if (!v) return null;
    if (typeof v !== 'string' || !/^\/api\/covers\/[\w.-]+$/.test(v)) throw new BadRequestException('Image invalide : téléverse-la depuis le site');
    return v;
  }

  async update(id: string, data: { title?: string; content?: string; pinned?: boolean; summary?: string | null; imageUrl?: string | null }) {
    const payload: any = {};
    if (data.summary !== undefined) payload.summary = (data.summary ?? '').trim().slice(0, 300) || null;
    const img = this.cleanImage(data.imageUrl);
    if (img !== undefined) payload.imageUrl = img;
    if (data.title?.trim()) payload.title = data.title.trim();
    if (data.content?.trim()) payload.content = data.content;
    if (typeof data.pinned === 'boolean') payload.pinned = data.pinned;
    if (Object.keys(payload).length === 0) throw new BadRequestException('Aucune modification');
    return this.prisma.announcement.update({ where: { id }, data: payload });
  }

  async create(authorId: string, title: string, content: string, pinned = false, extra: { summary?: string | null; imageUrl?: string | null } = {}) {
    if (!title?.trim() || !content?.trim()) throw new BadRequestException('Titre et contenu requis');
    const announcement = await this.prisma.announcement.create({
      data: { title: title.trim(), content, pinned, summary: (extra.summary ?? '').trim().slice(0, 300) || null, imageUrl: this.cleanImage(extra.imageUrl) ?? null, author: { connect: { id: authorId } } },
    });
    // La notification affiche un extrait sans balises de mise en forme.
    await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `📯 ${title}`, body: content.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140), link: `/news/${announcement.id}` });
    return announcement;
  }

  delete(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}
