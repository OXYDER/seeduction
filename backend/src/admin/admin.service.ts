import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private badges: BadgesService) {}

  async approveTorrent(id: string) {
    const torrent = await this.prisma.torrent.update({ where: { id }, data: { status: 'APPROVED' } });
    await this.notifications.notify({
      userId: torrent.uploaderId,
      type: 'TORRENT_APPROVED',
      title: 'Ton torrent a été approuvé',
      body: torrent.name,
      link: `/torrents/${torrent.id}`,
    });
    await this.badges.checkAndAward(torrent.uploaderId);
    return torrent;
  }

  async rejectTorrent(id: string) {
    const torrent = await this.prisma.torrent.update({ where: { id }, data: { status: 'REJECTED' } });
    await this.notifications.notify({
      userId: torrent.uploaderId,
      type: 'TORRENT_REJECTED',
      title: 'Ton torrent a été rejeté',
      body: torrent.name,
    });
    return torrent;
  }

  pendingTorrents() {
    return this.prisma.torrent.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  }

  allTorrents(search?: string) {
    return this.prisma.torrent.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { category: true, uploader: { select: { username: true } } },
    });
  }

  updateTorrent(id: string, data: { name?: string; categoryId?: string; freeleech?: boolean; doubleUpload?: boolean; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEAD' }) {
    return this.prisma.torrent.update({ where: { id }, data });
  }

  deleteTorrent(id: string) {
    return this.prisma.torrent.delete({ where: { id } });
  }

  warnUser(userId: string, reason: string, issuedBy: string) {
    return this.prisma.warning.create({ data: { userId, reason, issuedBy } });
  }

  banUser(userId: string, reason: string, issuedBy: string, expiresAt?: Date) {
    return this.prisma.$transaction([
      this.prisma.ban.create({ data: { userId, reason, issuedBy, expiresAt } }),
      this.prisma.user.update({ where: { id: userId }, data: { status: 'BANNED' } }),
    ]);
  }

  unbanUser(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  }

  listReports(status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN') {
    return this.prisma.report.findMany({ where: { status }, orderBy: { createdAt: 'desc' } });
  }

  resolveReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    return this.prisma.report.update({ where: { id }, data: { status } });
  }

  stats() {
    return Promise.all([
      this.prisma.user.count(),
      this.prisma.torrent.count({ where: { status: 'APPROVED' } }),
      this.prisma.peer.count(),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]).then(([users, torrents, activePeers, openReports]) => ({ users, torrents, activePeers, openReports }));
  }
}
