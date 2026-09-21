import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class EntitiesService {
  constructor(private prisma: PrismaService) {}

  /** Fiche d'une entité (acteur, studio, genre...) + combien de torrents approuvés la référencent, par rôle. */
  async get(id: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Introuvable');
    const grouped = await this.prisma.torrentEntity.groupBy({
      by: ['role'],
      where: { entityId: id, torrent: { status: 'APPROVED' } },
      _count: { _all: true },
    });
    return {
      ...entity,
      roles: grouped.map((g) => ({ role: g.role, count: g._count._all })).sort((a, b) => b.count - a.count),
    };
  }

  search(query?: string, type?: string) {
    return this.prisma.entity.findMany({
      where: {
        ...(query ? { name: { contains: query, mode: 'insensitive' as const } } : {}),
        ...(type ? { type: type as any } : {}),
      },
      orderBy: { name: 'asc' },
      take: 30,
    });
  }
}
