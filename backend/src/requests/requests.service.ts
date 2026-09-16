import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.$transaction([
      this.prisma.torrentRequest.update({
        where: { id: requestId },
        data: { filledById: fillerUserId, filledTorrentId: torrentId },
      }),
      this.prisma.user.update({
        where: { id: fillerUserId },
        data: { bonusPoints: { increment: request.bounty } },
      }),
    ]);
  }
}
