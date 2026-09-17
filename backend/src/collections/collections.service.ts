import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const TORRENT_CARD_SELECT = {
  id: true,
  name: true,
  size: true,
  seeders: true,
  leechers: true,
  category: { select: { name: true, slug: true } },
};

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  /** Mes collections (propriétaire) + celles où je suis collaborateur. */
  mine(userId: string) {
    return this.prisma.collection.findMany({
      where: { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { username: true } },
        _count: { select: { items: true, collaborators: true } },
      },
    });
  }

  publicCollections() {
    return this.prisma.collection.findMany({
      where: { visibility: { in: ['PUBLIC', 'COLLABORATIVE'] } },
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { username: true } },
        _count: { select: { items: true, collaborators: true } },
      },
    });
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
            torrent: { select: TORRENT_CARD_SELECT },
            addedBy: { select: { username: true } },
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
    return collection;
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
