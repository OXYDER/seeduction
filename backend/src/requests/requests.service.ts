import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { Cron } from '@nestjs/schedule';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const MAX_BOUNTY = 100_000;
/** Part de la récompense pour le membre qui a trouvé un torrent déjà sur le site (sans en être l'envoyeur) ; l'envoyeur garde le reste. */
export const FINDER_PERCENT = 10;
/** Sous ce montant, pas de part : tout va à l'envoyeur. */
const MIN_BOUNTY_FOR_SHARE = 10;
/** Sans réponse du demandeur, une proposition est confirmée d'office après ce délai. */
export const AUTO_CONFIRM_DAYS = 3;
const MAX_OPEN_PROPOSALS = 5;

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
          finder: { select: { id: true, username: true } },
          proposedBy: { select: { id: true, username: true } },
          proposedTorrent: { select: { id: true, name: true, uploader: { select: { id: true, username: true } } } },
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
    const updated = await this.prisma.torrentRequest.update({ where: { id: requestId }, data: { bounty: { increment: amount }, backers: { increment: 1 } } });
    if (request.requestedById !== userId) {
      await this.notifications.notify({
        userId: request.requestedById, type: 'REQUEST_FILLED', category: 'requests', title: `+${amount} points ajoutés à ta demande`, titleMany: 'Des points ont été ajoutés à ta demande ({n} contributions)',
        groupKey: `bounty:${requestId}`, body: `${request.title} : récompense de ${Math.round(updated.bounty)} points`, link: '/requests',
      }).catch(() => undefined);
    }
    return updated;
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

  /** Un membre qui n'est pas l'envoyeur désigne un torrent du site : le demandeur confirme (ou refuse). */
  private async openProposals(userId: string) {
    return this.prisma.torrentRequest.count({ where: { proposedById: userId, filledById: null } });
  }

  /**
   * Combler une demande avec un torrent. Trois cas :
   * - l'envoyeur du torrent, le demandeur ou l'équipe : la demande est comblée tout de suite ;
   * - un autre membre qui a trouvé ce torrent sur le site : c'est une proposition, que le demandeur confirme ou refuse (sans réponse, elle est
   *   confirmée d'office après {AUTO_CONFIRM_DAYS} jours). À la confirmation, l'envoyeur reçoit la récompense moins une petite part ({FINDER_PERCENT} %) pour celui qui l'a trouvé.
   */
  async fill(requestId: string, torrentId: string, filler: { userId: string; role: string; alt?: string }) {
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId } });
    if (!request || request.filledById) throw new BadRequestException('Demande déjà comblée ou introuvable');
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, name: true, uploaderId: true, status: true, requestFilled: { select: { id: true } } } });
    if (!torrent) throw new BadRequestException('Torrent introuvable');
    if (torrent.requestFilled) throw new BadRequestException('Ce torrent a déjà servi à combler une autre demande');
    if (torrent.status !== 'APPROVED') throw new BadRequestException('Le torrent doit être approuvé par le staff');
    if (request.declinedTorrentIds.includes(torrentId)) throw new BadRequestException('Le demandeur a déjà refusé ce torrent pour cette demande');
    const staff = STAFF.includes(filler.role);
    const mine = (id: string) => id === filler.userId || id === filler.alt; // compte principal ou profil famille
    const isUploader = mine(torrent.uploaderId);
    const isRequester = mine(request.requestedById);
    if (isRequester && isUploader && request.backers > 1) throw new BadRequestException("Tu ne peux pas combler ta propre demande avec ton propre torrent quand d'autres membres y ont contribué");

    // Direct : envoyeur, demandeur ou équipe (SDT) : pas besoin de confirmation. Les points vont à l'envoyeur du torrent ; un membre de l'équipe qui a trouvé
    // le torrent d'un autre dans les listes reçoit, comme tout trouveur, la petite part.
    if (isUploader || isRequester || staff) {
      const finder = staff && !isUploader && !isRequester ? filler.userId : null;
      await this.complete(request, torrent, finder, torrent.uploaderId === filler.alt ? filler.alt : filler.userId);
      return { status: 'filled' as const };
    }

    // Proposition d'un membre qui a trouvé ce torrent sur le site.
    if (request.proposedTorrentId) throw new BadRequestException('Une proposition attend déjà la réponse du demandeur');
    if ((await this.openProposals(filler.userId)) >= MAX_OPEN_PROPOSALS) throw new BadRequestException(`Tu as déjà ${MAX_OPEN_PROPOSALS} propositions en attente de réponse`);
    await this.prisma.torrentRequest.update({ where: { id: requestId }, data: { proposedTorrentId: torrentId, proposedById: filler.userId, proposedAt: new Date() } });
    await this.notifications.notify({
      userId: request.requestedById, type: 'REQUEST_FILLED', title: 'Un torrent est proposé pour ta demande',
      body: `${request.title} → ${torrent.name} : confirme ou refuse dans Demandes (sans réponse, il sera accepté dans ${AUTO_CONFIRM_DAYS} jours)`, link: '/requests',
    }).catch(() => undefined);
    return { status: 'proposed' as const };
  }

  /** Le demandeur (ou l'équipe) confirme la proposition en attente : la demande est comblée et les points sont versés. */
  async confirm(requestId: string, user: { userId: string; role: string }) {
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId } });
    if (!request || request.filledById) throw new BadRequestException('Demande déjà comblée ou introuvable');
    if (request.requestedById !== user.userId && !STAFF.includes(user.role)) throw new ForbiddenException('Seul le demandeur peut confirmer');
    if (!request.proposedTorrentId) throw new BadRequestException('Aucune proposition en attente');
    return this.completeProposal(request);
  }

  /** Le demandeur (ou l'équipe) refuse la proposition : la demande reste ouverte et ce torrent ne peut plus être proposé pour elle. */
  async decline(requestId: string, user: { userId: string; role: string }) {
    const request = await this.prisma.torrentRequest.findUnique({ where: { id: requestId }, include: { proposedTorrent: { select: { name: true } } } });
    if (!request || request.filledById) throw new BadRequestException('Demande déjà comblée ou introuvable');
    if (request.requestedById !== user.userId && !STAFF.includes(user.role)) throw new ForbiddenException('Seul le demandeur peut refuser');
    if (!request.proposedTorrentId) throw new BadRequestException('Aucune proposition en attente');
    await this.prisma.torrentRequest.update({
      where: { id: requestId },
      data: { proposedTorrentId: null, proposedById: null, proposedAt: null, declinedTorrentIds: { push: request.proposedTorrentId } },
    });
    if (request.proposedById) {
      await this.notifications.notify({
        userId: request.proposedById, type: 'REQUEST_FILLED', title: 'Ta proposition a été refusée',
        body: `${request.title}${request.proposedTorrent ? ` : « ${request.proposedTorrent.name} » ne correspond pas à la demande` : ''}`, link: '/requests',
      }).catch(() => undefined);
    }
    return { ok: true };
  }

  private async completeProposal(request: { id: string; title: string; bounty: number; requestedById: string; proposedTorrentId: string | null; proposedById: string | null }) {
    const torrent = request.proposedTorrentId
      ? await this.prisma.torrent.findUnique({ where: { id: request.proposedTorrentId }, select: { id: true, name: true, uploaderId: true, status: true, requestFilled: { select: { id: true } } } })
      : null;
    // Le torrent proposé a disparu, a été retiré ou a servi ailleurs entre-temps : la proposition tombe.
    if (!torrent || torrent.status !== 'APPROVED' || torrent.requestFilled) {
      await this.prisma.torrentRequest.update({ where: { id: request.id }, data: { proposedTorrentId: null, proposedById: null, proposedAt: null } });
      throw new BadRequestException("Le torrent proposé n'est plus disponible : la proposition est annulée");
    }
    await this.complete(request, torrent, request.proposedById, null);
    return { status: 'filled' as const };
  }

  /** Verse la récompense : à l'envoyeur du torrent, moins la part de celui qui l'a trouvé (s'il n'est ni l'envoyeur ni le demandeur). */
  private async complete(request: { id: string; title: string; bounty: number; requestedById: string }, torrent: { id: string; name?: string; uploaderId: string }, finderId: string | null, actorId: string | null) {
    const finder = finderId && finderId !== torrent.uploaderId && finderId !== request.requestedById ? finderId : null;
    const finderPoints = finder && request.bounty >= MIN_BOUNTY_FOR_SHARE ? Math.max(1, Math.floor((request.bounty * FINDER_PERCENT) / 100)) : 0;
    const uploaderPoints = request.bounty - finderPoints;
    await this.prisma.$transaction([
      this.prisma.torrentRequest.update({
        where: { id: request.id },
        data: {
          filledById: torrent.uploaderId, filledTorrentId: torrent.id, finderId: finderPoints > 0 || finder ? finder : null, finderPoints, uploaderPoints,
          proposedTorrentId: null, proposedById: null, proposedAt: null,
        },
      }),
      this.prisma.user.update({ where: { id: torrent.uploaderId }, data: { bonusPoints: { increment: uploaderPoints } } }),
      ...(finderPoints > 0 && finder ? [this.prisma.user.update({ where: { id: finder }, data: { bonusPoints: { increment: finderPoints } } })] : []),
    ]);

    const link = `/torrents/${torrent.id}`;
    if (request.requestedById !== torrent.uploaderId && request.requestedById !== actorId) {
      await this.notifications.notify({ userId: request.requestedById, type: 'REQUEST_FILLED', title: 'Ta demande a été comblée', body: request.title, link }).catch(() => undefined);
    }
    if (torrent.uploaderId !== actorId && uploaderPoints > 0) {
      await this.notifications.notify({ userId: torrent.uploaderId, type: 'REQUEST_FILLED', title: `Ton torrent a comblé une demande : +${Math.round(uploaderPoints)} points`, body: request.title, link }).catch(() => undefined);
    }
    if (finder && finderPoints > 0) {
      await this.notifications.notify({ userId: finder, type: 'REQUEST_FILLED', title: `Merci ! +${Math.round(finderPoints)} points pour avoir trouvé ce torrent`, body: request.title, link }).catch(() => undefined);
    }
    await this.badges.checkAndAward(torrent.uploaderId);
  }

  /** Propositions sans réponse du demandeur depuis 3 jours : confirmées d'office (le demandeur a pu refuser avant, pas après). */
  @Cron('7 * * * *')
  async autoConfirm() {
    const due = await this.prisma.torrentRequest.findMany({
      where: { filledById: null, proposedTorrentId: { not: null }, proposedAt: { lt: new Date(Date.now() - AUTO_CONFIRM_DAYS * 86_400_000) } },
      take: 50,
    });
    for (const r of due) await this.completeProposal(r).catch(() => undefined);
  }
}
