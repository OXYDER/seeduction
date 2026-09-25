import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../dm/presence.service';
import { DmGateway } from '../dm/dm.gateway';

const userSelect = { id: true, username: true, avatarUrl: true };

@Injectable()
export class FriendsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private presence: PresenceService,
    private dmGateway: DmGateway,
  ) {}

  /** Amis, demandes reçues et demandes envoyées du membre. */
  async list(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }], status: { in: ['PENDING', 'ACCEPTED'] } },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
    });
    const friends: any[] = [];
    const incoming: any[] = [];
    const outgoing: any[] = [];
    for (const f of rows) {
      const isRequester = f.requesterId === userId;
      const other = isRequester ? f.addressee : f.requester;
      if (f.status === 'ACCEPTED') friends.push({ friendshipId: f.id, ...other, online: this.presence.isOnline(other.id) });
      else if (isRequester) outgoing.push({ friendshipId: f.id, ...other });
      else incoming.push({ friendshipId: f.id, ...other });
    }
    return { friends, incoming, outgoing };
  }

  async statusWith(meId: string, otherId: string): Promise<{ status: 'SELF' | 'NONE' | 'FRIENDS' | 'PENDING_OUT' | 'PENDING_IN'; friendshipId?: string }> {
    if (meId === otherId) return { status: 'SELF' };
    const f = await this.prisma.friendship.findFirst({
      where: { status: { in: ['PENDING', 'ACCEPTED'] }, OR: [{ requesterId: meId, addresseeId: otherId }, { requesterId: otherId, addresseeId: meId }] },
    });
    if (!f) return { status: 'NONE' };
    if (f.status === 'ACCEPTED') return { status: 'FRIENDS', friendshipId: f.id };
    return { status: f.requesterId === meId ? 'PENDING_OUT' : 'PENDING_IN', friendshipId: f.id };
  }

  async request(requesterId: string, requesterUsername: string, targetUsername: string) {
    const name = (targetUsername ?? '').trim();
    const target = await this.prisma.user.findUnique({ where: { username: name }, select: { id: true, username: true } });
    if (!target) throw new NotFoundException(`Aucun membre nommé « ${name} »`);
    if (target.id === requesterId) throw new BadRequestException("Tu ne peux pas t'ajouter toi-même");

    const existing = await this.prisma.friendship.findFirst({
      where: { OR: [{ requesterId, addresseeId: target.id }, { requesterId: target.id, addresseeId: requesterId }] },
    });
    if (existing?.status === 'ACCEPTED') throw new BadRequestException('Vous êtes déjà amis');
    if (existing?.status === 'BLOCKED') throw new BadRequestException('Impossible d\'ajouter ce membre');
    if (existing?.status === 'PENDING') {
      // L'autre t'avait déjà demandé : la demande devient automatiquement mutuelle (amis), comme sur Facebook.
      if (existing.requesterId === target.id) return this.accept(existing.id, requesterId);
      throw new BadRequestException('Demande déjà envoyée');
    }

    const friendship = await this.prisma.friendship.create({ data: { requesterId, addresseeId: target.id, status: 'PENDING' } });
    await this.notifications.notify({
      userId: target.id, type: 'FRIEND_REQUEST', title: 'Nouvelle demande d\'ami',
      body: `${requesterUsername} veut t'ajouter comme ami`, link: '/friends',
    });
    this.dmGateway.notifyUser(target.id, 'dm:friend-request', { from: { id: requesterId, username: requesterUsername } });
    return friendship;
  }

  async accept(friendshipId: string, userId: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!f || f.addresseeId !== userId || f.status !== 'PENDING') throw new NotFoundException('Demande introuvable');
    const updated = await this.prisma.friendship.update({ where: { id: friendshipId }, data: { status: 'ACCEPTED' } });
    await this.notifications.notify({
      userId: f.requesterId, type: 'FRIEND_REQUEST', title: 'Demande d\'ami acceptée', body: 'Vous êtes maintenant amis', link: '/friends',
    });
    this.dmGateway.notifyUser(f.requesterId, 'dm:friend-accepted', { by: userId });
    return updated;
  }

  /** Refuse une demande reçue, annule une demande envoyée, ou retire un ami — selon qui appelle et le statut. */
  async remove(friendshipId: string, userId: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!f) throw new NotFoundException('Introuvable');
    if (f.requesterId !== userId && f.addresseeId !== userId) throw new ForbiddenException();
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }
}
