import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { LIST_INCLUDE, toListRow } from '../torrents/torrents.service';

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService, private adult: AdultService) {}

  /** Aperçu en mosaïque (jusqu'à 4 pochettes) + compteurs ; jamais de pochette d'un contenu adulte masqué pour ce membre. */
  private async withCovers(userId: string | undefined, where: any) {
    const hidden = await this.adult.hiddenFor(userId);
    const rows = await this.prisma.collection.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, username: true } },
        _count: { select: { items: true, collaborators: true } },
        items: {
          orderBy: { addedAt: 'desc' },
          take: 8,
          where: { torrent: { coverImage: { not: null }, ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) } },
          select: { torrent: { select: { coverImage: true } } },
        },
      },
    });
    return rows.map(({ items, ...c }) => ({ ...c, covers: items.map((i) => i.torrent.coverImage as string).slice(0, 4) }));
  }

  /** Mes collections (propriétaire) + celles où je suis collaborateur. */
  mine(userId: string) {
    return this.withCovers(userId, { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] });
  }

  publicCollections(userId?: string) {
    return this.withCovers(userId, { visibility: { in: ['PUBLIC', 'COLLABORATIVE'] } });
  }

  async findOne(id: string, userId?: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, username: true } },
        collaborators: { include: { user: { select: { id: true, username: true } } } },
        items: {
          orderBy: { addedAt: 'desc' },
          include: {
            torrent: { include: LIST_INCLUDE },
            addedBy: { select: { id: true, username: true } },
          },
        },
      },
    });
    if (!collection) throw new NotFoundException('Collection introuvable');

    if (collection.visibility === 'PRIVATE') {
      const isOwnerOrCollaborator =
        userId && (collection.ownerId === userId || collection.collaborators.some((c) => c.userId === userId));
      if (!isOwnerOrCollaborator) throw new ForbiddenException('Cette collection est privée');
    }
    // Les torrents adultes n'apparaissent que pour un membre qui a activé l'option.
    const hidden = await this.adult.hiddenFor(userId);
    if (hidden.length) collection.items = collection.items.filter((i) => !hidden.includes(i.torrent.categoryId));
    return { ...collection, items: collection.items.map((i) => ({ ...i, torrent: toListRow(i.torrent) })) };
  }

  create(userId: string, name: string, description: string | undefined, visibility: string) {
    return this.prisma.collection.create({
      data: { name, description, visibility: visibility as any, ownerId: userId },
    });
  }

  private async requireOwner(id: string, userId: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException('Collection introuvable');
    if (collection.ownerId !== userId) throw new ForbiddenException("Ce n'est pas ta collection");
    return collection;
  }

  /** Propriétaire OU collaborateur si la collection est collaborative. */
  private async requireEditor(id: string, userId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: { collaborators: true },
    });
    if (!collection) throw new NotFoundException('Collection introuvable');
    const isOwner = collection.ownerId === userId;
    const isCollaborator = collection.visibility === 'COLLABORATIVE' && collection.collaborators.some((c) => c.userId === userId);
    if (!isOwner && !isCollaborator) throw new ForbiddenException("Tu n'as pas les droits d'édition sur cette collection");
    return collection;
  }

  async update(id: string, userId: string, data: { name?: string; description?: string; visibility?: string }) {
    await this.requireOwner(id, userId);
    return this.prisma.collection.update({
      where: { id },
      data: { ...data, visibility: data.visibility as any },
    });
  }

  async delete(id: string, userId: string) {
    await this.requireOwner(id, userId);
    return this.prisma.collection.delete({ where: { id } });
  }

  async addItem(collectionId: string, userId: string, torrentId: string, note?: string) {
    await this.requireEditor(collectionId, userId);
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId } });
    if (!torrent) throw new BadRequestException('Torrent introuvable');
    return this.prisma.collectionItem.upsert({
      where: { collectionId_torrentId: { collectionId, torrentId } },
      update: { note },
      create: { collectionId, torrentId, addedById: userId, note },
    });
  }

  async removeItem(collectionId: string, userId: string, torrentId: string) {
    await this.requireEditor(collectionId, userId);
    return this.prisma.collectionItem.delete({
      where: { collectionId_torrentId: { collectionId, torrentId } },
    });
  }

  async addCollaborator(collectionId: string, userId: string, username: string) {
    await this.requireOwner(collectionId, userId);
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new BadRequestException('Utilisateur introuvable');
    return this.prisma.collectionCollaborator.upsert({
      where: { collectionId_userId: { collectionId, userId: target.id } },
      update: {},
      create: { collectionId, userId: target.id },
    });
  }

  async removeCollaborator(collectionId: string, userId: string, targetUserId: string) {
    await this.requireOwner(collectionId, userId);
    return this.prisma.collectionCollaborator.delete({
      where: { collectionId_userId: { collectionId, userId: targetUserId } },
    });
  }
}
