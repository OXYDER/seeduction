import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, torrent: { status: 'APPROVED' } },
      orderBy: { createdAt: 'desc' },
      include: { torrent: { include: { category: true, uploader: { select: { username: true } } } } },
    });
    return rows.map(({ torrent: { metadata, ...t }, createdAt }) => ({ ...t, favoritedAt: createdAt }));
  }

  async ids(userId: string) {
    const rows = await this.prisma.favorite.findMany({ where: { userId }, select: { torrentId: true } });
    return rows.map((r) => r.torrentId);
  }

  async add(userId: string, torrentId: string) {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    await this.prisma.favorite.upsert({
      where: { userId_torrentId: { userId, torrentId } },
      update: {},
      create: { userId, torrentId },
    });
    return { favorite: true };
  }

  async remove(userId: string, torrentId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, torrentId } });
    return { favorite: false };
  }
}
