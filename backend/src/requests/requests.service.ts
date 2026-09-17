import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  list() {
    return this.prisma.torrentRequest.findMany({
      where: { filledById: null },
      orderBy: { bounty: 'desc' },
      include: { requestedBy: { select: { username: true } } },
    });
  }

  create(userId: string, title: string, description: string, bounty: number) {
    return this.prisma.torrentRequest.create({
      data: { title, description, bounty, requestedById: userId },
    });
  }

  async fill(requestId: string, torrentId: string, fillerUserId: string) {
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId } });
    if (!request || request.filledById) throw new BadRequestException('Requête déjà remplie ou introuvable');

    const result = await this.prisma.$transaction([
      this.prisma.torrentRequest.update({
        where: { id: requestId },
        data: { filledById: fillerUserId, filledTorrentId: torrentId },
      }),
      this.prisma.user.update({
        where: { id: fillerUserId },
        data: { bonusPoints: { increment: request.bounty } },
      }),
    ]);

    if (request.requestedById !== fillerUserId) {
      await this.notifications.notify({
        userId: request.requestedById,
        type: 'REQUEST_FILLED',
        title: 'Ta demande a été comblée',
        body: request.title,
        link: `/torrents/${torrentId}`,
      });
    }

    return result;
  }
}
