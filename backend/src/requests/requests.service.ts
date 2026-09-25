import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';

const STAFF = ['MODERATOR', 'ADMIN', 'OWNER'];
const MAX_BOUNTY = 100_000;

export interface RequestInput {
  title?: string; description?: string; bounty?: number; year?: number; language?: string; resolution?: string; categoryId?: string;
}

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private badges: BadgesService) {}

  async list(q: { status?: string; search?: string; categoryId?: string; sort?: string; mine?: string; userId?: string }) {
    const filled = q.status === 'filled';
    const where: any = filled ? { filledById: { not: null } } : { filledById: null };
    if (q.search?.trim()) where.title = { contains: q.search.trim(), mode: 'insensitive' };
    if (q.categoryId) {
      const ids = await this.prisma.category.findMany({ where: { OR: [{ id: q.categoryId }, { parentId: q.categoryId }] }, select: { id: true } });
      where.categoryId = { in: ids.map((c) => c.id) };
    }
    if (q.mine === '1' && q.userId) where.requestedById = q.userId;
    const orderBy: any = q.sort === 'date' ? { createdAt: 'desc' } : q.sort === 'ancien' ? { createdAt: 'asc' } : { bounty: 'desc' };
    const [items, openStats] = await Promise.all([
      this.prisma.torrentRequest.findMany({
        where, orderBy, take: 200,
        include: {
          requestedBy: { select: { id: true, username: true } },
          filledBy: { select: { id: true, username: true } },
          filledTorrent: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, slug: true, parent: { select: { slug: true, name: true } } } },
        },
      }),
      this.prisma.torrentRequest.aggregate({ where: { filledById: null }, _count: { _all: true }, _sum: { bounty: true } }),
    ]);
    const filledCount = await this.prisma.torrentRequest.count({ where: { filledById: { not: null } } });
    return { items, stats: { open: openStats._count._all, points: openStats._sum.bounty ?? 0, filled: filledCount } };
  }

  /** Débite les points du membre ; échoue sans rien changer s'il n'en a pas assez. */
  private async charge(userId: string, amount: number) {
    if (amount <= 0) return;
    const res = await this.prisma.user.updateMany({ where: { id: userId, bonusPoints: { gte: amount } }, data: { bonusPoints: { decrement: amount } } });
    if (res.count === 0) throw new BadRequestException('Points bonus insuffisants');
  }

  private cleanAmount(value: unknown, min = 0) {
    const n = Math.floor(Number(value) || 0);
    if (n < min) throw new BadRequestException(`Montant minimum : ${min} points`);
    if (n > MAX_BOUNTY) throw new BadRequestException(`Montant maximum : ${MAX_BOUNTY} points`);
    return n;
  }

  async create(userId: string, input: RequestInput) {
    const title = (input.title ?? '').trim();
    if (title.length < 2 || title.length > 200) throw new BadRequestException('Titre requis (2 à 200 caractères)');
    const bounty = this.cleanAmount(input.bounty);
    if (input.categoryId && !(await this.prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
      throw new BadRequestException('Catégorie introuvable');
    }
    await this.charge(userId, bounty);
    return this.prisma.torrentRequest.create({
      data: {
        title, description: (input.description ?? '').slice(0, 5000), bounty, requestedById: userId,
        year: input.year && input.year > 1800 && input.year < 2200 ? Math.floor(input.year) : null,
        language: input.language?.slice(0, 20) || null,
        resolution: input.resolution?.slice(0, 20) || null,
        categoryId: input.categoryId || null,
      },
    });
  }

  /** Ajoute des points à la récompense d'une demande ouverte (payés par le membre qui contribue). */
  async addBounty(requestId: string, userId: string, rawAmount: number) {
    const amount = this.cleanAmount(rawAmount, 10);
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId } });
    if (!request || request.filledById) throw new BadRequestException('Demande introuvable ou déjà comblée');
    await this.charge(userId, amount);
    return this.prisma.torrentRequest.update({ where: { id: requestId }, data: { bounty: { increment: amount }, backers: { increment: 1 } } });
  }

  async remove(requestId: string, user: { userId: string; role: string }) {
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');
    const isStaff = STAFF.includes(user.role);
    if (request.requestedById !== user.userId && !isStaff) throw new ForbiddenException();
    if (request.filledById && !isStaff) throw new BadRequestException('Une demande comblée ne peut plus être supprimée');
    // Remboursement seulement si personne d'autre n'a contribué (sinon les points des autres seraient rendus au demandeur).
    const refund = !request.filledById && request.backers <= 1 ? request.bounty : 0;
    await this.prisma.$transaction([
      this.prisma.torrentRequest.delete({ where: { id: requestId } }),
      ...(refund > 0 ? [this.prisma.user.update({ where: { id: request.requestedById }, data: { bonusPoints: { increment: refund } } })] : []),
    ]);
    return { ok: true, refunded: refund };
  }

  async fill(requestId: string, torrentId: string, filler: { userId: string; role: string }) {
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId } });
    if (!request || request.filledById) throw new BadRequestException('Demande déjà comblée ou introuvable');
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, uploaderId: true, status: true, requestFilled: { select: { id: true } } } });
    if (!torrent) throw new BadRequestException('Torrent introuvable');
    if (torrent.requestFilled) throw new BadRequestException('Ce torrent a déjà servi à combler une autre demande');
    if (torrent.status !== 'APPROVED') throw new BadRequestException('Le torrent doit être approuvé par le staff');
    if (torrent.uploaderId !== filler.userId && !STAFF.includes(filler.role)) throw new ForbiddenException('Tu ne peux combler une demande qu\'avec un de tes propres torrents');
    if (request.requestedById === filler.userId && request.backers > 1) throw new BadRequestException("Tu ne peux pas combler ta propre demande quand d'autres membres y ont contribué");

    const result = await this.prisma.$transaction([
      this.prisma.torrentRequest.update({ where: { id: requestId }, data: { filledById: filler.userId, filledTorrentId: torrentId } }),
      this.prisma.user.update({ where: { id: torrent.uploaderId }, data: { bonusPoints: { increment: request.bounty } } }),
    ]);

    if (request.requestedById !== filler.userId) {
      await this.notifications.notify({
        userId: request.requestedById,
        type: 'REQUEST_FILLED',
        title: 'Ta demande a été comblée',
        body: request.title,
        link: `/torrents/${torrentId}`,
      });
    }
    await this.badges.checkAndAward(torrent.uploaderId);
    return result[0];
  }
}
