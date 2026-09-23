import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const PER_PAGE = 20;
const STAFF = ['MODERATOR', 'ADMIN', 'OWNER'];
const MAX_LENGTH = 5000;

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async list(torrentId: string, page: number) {
    const safePage = Math.max(1, page || 1);
    const [total, items] = await Promise.all([
      this.prisma.torrentComment.count({ where: { torrentId } }),
      this.prisma.torrentComment.findMany({
        where: { torrentId },
        orderBy: { createdAt: 'asc' },
        skip: (safePage - 1) * PER_PAGE,
        take: PER_PAGE,
        include: { author: { select: { id: true, username: true, role: true, createdAt: true } } },
      }),
    ]);
    return { items, total, page: safePage, pageSize: PER_PAGE };
  }

  async create(torrentId: string, user: { userId: string; username: string }, content: string) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Commentaire vide');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Commentaire trop long (${MAX_LENGTH} caractères maximum)`);
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, name: true, uploaderId: true, status: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');

    const comment = await this.prisma.torrentComment.create({
      data: { torrentId, authorId: user.userId, content: text },
      include: { author: { select: { id: true, username: true, role: true, createdAt: true } } },
    });
    if (torrent.uploaderId !== user.userId) {
      await this.notifications.notify({
        userId: torrent.uploaderId,
        type: 'TORRENT_COMMENT',
        title: `${user.username} a commenté ton torrent`,
        body: torrent.name,
        link: `/torrents/${torrent.id}`,
      });
    }
    return comment;
  }

  async edit(id: string, viewer: { userId: string; role: string }, content: string) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Commentaire vide');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Commentaire trop long (${MAX_LENGTH} caractères maximum)`);
    const comment = await this.prisma.torrentComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    if (comment.authorId !== viewer.userId && !STAFF.includes(viewer.role)) throw new ForbiddenException('Tu ne peux modifier que tes commentaires');
    return this.prisma.torrentComment.update({ where: { id }, data: { content: text, editedAt: new Date() } });
  }

  async remove(id: string, viewer: { userId: string; role: string }) {
    const comment = await this.prisma.torrentComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    if (comment.authorId !== viewer.userId && !STAFF.includes(viewer.role)) throw new ForbiddenException('Tu ne peux supprimer que tes commentaires');
    await this.prisma.torrentComment.delete({ where: { id } });
    return { deleted: true };
  }
}
