import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const RESEED_COOLDOWN_MS = 7 * 86400_000;
const LIKE_BONUS_POINTS = 1;

@Injectable()
export class SocialService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ------------------------------------------------------------------ « merci » sur un torrent

  async likeStatus(torrentId: string, userId?: string) {
    const [count, mine] = await Promise.all([
      this.prisma.torrentLike.count({ where: { torrentId } }),
      userId ? this.prisma.torrentLike.findUnique({ where: { userId_torrentId: { userId, torrentId } } }) : null,
    ]);
    return { count, mine: !!mine };
  }

  async like(torrentId: string, userId: string) {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, uploaderId: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    const existing = await this.prisma.torrentLike.findUnique({ where: { userId_torrentId: { userId, torrentId } } });
    if (!existing) {
      await this.prisma.torrentLike.create({ data: { userId, torrentId } });
      // Petit remerciement pour l'uploader (pas pour un « merci » à soi-même).
      if (torrent.uploaderId !== userId) {
        await this.prisma.user.update({ where: { id: torrent.uploaderId }, data: { bonusPoints: { increment: LIKE_BONUS_POINTS } } });
      }
    }
    return this.likeStatus(torrentId, userId);
  }

  async unlike(torrentId: string, userId: string) {
    const removed = await this.prisma.torrentLike.deleteMany({ where: { userId, torrentId } });
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { uploaderId: true } });
    // Retire le point accordé, sans jamais passer sous zéro.
    if (removed.count > 0 && torrent && torrent.uploaderId !== userId) {
      await this.prisma.user.updateMany({
        where: { id: torrent.uploaderId, bonusPoints: { gte: LIKE_BONUS_POINTS } },
        data: { bonusPoints: { decrement: LIKE_BONUS_POINTS } },
      });
    }
    return this.likeStatus(torrentId, userId);
  }

  // ------------------------------------------------------------------ abonnements

  async myFollows(userId: string) {
    const rows = await this.prisma.entityFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { entity: { select: { id: true, name: true, type: true, imageUrl: true } } },
    });
    return rows.map((r) => r.entity);
  }

  async isFollowing(entityId: string, userId: string) {
    return { following: !!(await this.prisma.entityFollow.findUnique({ where: { userId_entityId: { userId, entityId } } })) };
  }

  async follow(entityId: string, userId: string) {
    if (!(await this.prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } }))) throw new NotFoundException('Introuvable');
    const count = await this.prisma.entityFollow.count({ where: { userId } });
    if (count >= 200) throw new BadRequestException("Tu suis déjà 200 éléments : retire-en avant d'en ajouter");
    await this.prisma.entityFollow.upsert({ where: { userId_entityId: { userId, entityId } }, update: {}, create: { userId, entityId } });
    return { following: true };
  }

  async unfollow(entityId: string, userId: string) {
    await this.prisma.entityFollow.deleteMany({ where: { userId, entityId } });
    return { following: false };
  }

  /** Appelé quand un torrent est approuvé : prévient les membres abonnés à l'un de ses acteurs, studios, genres... */
  async notifyFollowers(torrentId: string) {
    const torrent = await this.prisma.torrent.findUnique({
      where: { id: torrentId },
      select: { id: true, name: true, uploaderId: true, entities: { select: { entityId: true, entity: { select: { name: true } } } } },
    });
    if (!torrent || torrent.entities.length === 0) return;

    const follows = await this.prisma.entityFollow.findMany({
      where: { entityId: { in: torrent.entities.map((e) => e.entityId) }, userId: { not: torrent.uploaderId } },
      select: { userId: true, entityId: true },
    });
    const nameById = new Map(torrent.entities.map((e) => [e.entityId, e.entity.name]));
    // Une seule notification par membre, même s'il suit plusieurs éléments de ce torrent.
    const firstMatch = new Map<string, string>();
    for (const f of follows) if (!firstMatch.has(f.userId)) firstMatch.set(f.userId, nameById.get(f.entityId) ?? '');
    if (firstMatch.size === 0) return;

    await this.prisma.notification.createMany({
      data: [...firstMatch.entries()].map(([userId, entityName]) => ({
        userId,
        type: 'FOLLOW' as const,
        title: `Nouveau torrent : ${entityName}`,
        body: torrent.name,
        link: `/torrents/${torrent.id}`,
      })),
    });
  }

  // ------------------------------------------------------------------ demande de reseed

  /** Prévient ceux qui ont complété ce torrent qu'il n'a plus de seeder (une fois par semaine au plus). */
  async requestReseed(torrentId: string, userId: string) {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, name: true, seeders: true, reseedRequestedAt: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    if (torrent.seeders > 0) throw new BadRequestException('Ce torrent a encore des seeders');
    if (torrent.reseedRequestedAt && Date.now() - torrent.reseedRequestedAt.getTime() < RESEED_COOLDOWN_MS) {
      throw new BadRequestException('Une demande de reseed a déjà été envoyée récemment pour ce torrent');
    }

    const snatchers = await this.prisma.snatch.findMany({
      where: { torrentId, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
      take: 100,
    });
    await this.prisma.torrent.update({ where: { id: torrentId }, data: { reseedRequestedAt: new Date() } });
    if (snatchers.length > 0) {
      await this.prisma.notification.createMany({
        data: snatchers.map((s) => ({
          userId: s.userId,
          type: 'RESEED_REQUEST' as const,
          title: 'Demande de reseed',
          body: `« ${torrent.name} » n'a plus de seeder : si tu l'as encore, remets-le en seed !`,
          link: `/torrents/${torrentId}`,
        })),
      });
    }
    return { notified: snatchers.length };
  }
}
