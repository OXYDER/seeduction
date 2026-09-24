import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { ReportsService } from '../reports/reports.service';
import { SocialService } from '../social/social.service';
import { normalizeOrigin } from '../common/utils/facets';

import { createHash, randomBytes } from 'crypto';

const ROLE_RANK: Record<string, number> = { USER: 0, UPLOADER: 1, MODERATOR: 2, ADMIN: 3, OWNER: 4 };
const TORRENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DEAD'];

export interface Actor { userId: string; username: string; role: string }

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private badges: BadgesService, private reports: ReportsService, private social: SocialService) {}

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
    // Les abonnés à un acteur, studio, genre... de ce torrent sont prévenus (sans jamais bloquer l'approbation).
    await this.social.notifyFollowers(torrent.id).catch(() => undefined);
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

  /** Seuls ces champs sont modifiables (le corps de la requête n'est jamais passé tel quel à la base). */
  async updateTorrent(id: string, body: Record<string, any>) {
    const data: Record<string, any> = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 300);
    if (typeof body.description === 'string') data.description = body.description;
    if (typeof body.categoryId === 'string' && body.categoryId) {
      if (!(await this.prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } }))) throw new BadRequestException('Catégorie introuvable');
      data.categoryId = body.categoryId;
    }
    if (typeof body.origin === 'string') data.origin = normalizeOrigin(body.origin) ?? null;
    if (typeof body.resolution === 'string') data.resolution = body.resolution.trim() || null;
    if (typeof body.source === 'string') data.source = body.source.trim() || null;
    if (typeof body.language === 'string') data.language = body.language.trim() || null;
    if (typeof body.freeleech === 'boolean') data.freeleech = body.freeleech;
    if (typeof body.doubleUpload === 'boolean') data.doubleUpload = body.doubleUpload;
    if (body.coverImage === null || typeof body.coverImage === 'string') data.coverImage = body.coverImage || null;
    if (TORRENT_STATUSES.includes(body.status)) data.status = body.status;
    if (Object.keys(data).length === 0) throw new BadRequestException('Aucune modification valide');
    return this.prisma.torrent.update({ where: { id }, data });
  }

  // ------------------------------------------------------------ membres

  private async loadTarget(userId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, role: true } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    return target;
  }

  /** On ne modère que des membres de rang strictement inférieur (sauf le propriétaire, qui peut tout). */
  private assertOutranks(actor: Actor, target: { id: string; role: string }) {
    if (actor.userId === target.id) throw new ForbiddenException('Tu ne peux pas faire ça sur ton propre compte');
    if (actor.role === 'OWNER') return;
    if ((ROLE_RANK[actor.role] ?? 0) <= (ROLE_RANK[target.role] ?? 0)) {
      throw new ForbiddenException('Tu ne peux pas modérer un membre de rang égal ou supérieur au tien');
    }
  }

  async userDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, role: true, status: true, uploaded: true, downloaded: true, bonusPoints: true,
        createdAt: true, lastSeenAt: true,
        warnings: { orderBy: { createdAt: 'desc' }, take: 20 },
        bans: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  /** Rôle, pseudo, upload/download/bonus : réservé aux administrateurs, avec la hiérarchie des rôles. */
  async updateUser(actor: Actor, userId: string, body: Record<string, any>) {
    if (!['ADMIN', 'OWNER'].includes(actor.role)) throw new ForbiddenException('Réservé aux administrateurs');
    const target = await this.loadTarget(userId);
    if (actor.userId !== target.id) this.assertOutranks(actor, target);

    const data: Record<string, any> = {};
    if (typeof body.role === 'string') {
      if (!(body.role in ROLE_RANK)) throw new BadRequestException('Rôle invalide');
      if (actor.userId === target.id && body.role !== target.role) throw new ForbiddenException('Tu ne peux pas changer ton propre rôle');
      // On ne peut attribuer qu'un rôle strictement inférieur au sien (le propriétaire peut tout attribuer).
      if (actor.role !== 'OWNER' && ROLE_RANK[body.role] >= ROLE_RANK[actor.role]) throw new ForbiddenException('Tu ne peux pas attribuer un rôle égal ou supérieur au tien');
      data.role = body.role;
    }
    if (typeof body.username === 'string' && body.username.trim() && body.username.trim() !== target.username) {
      const username = body.username.trim();
      if (!/^[\w.-]{3,32}$/.test(username)) throw new BadRequestException('Pseudo invalide (3 à 32 caractères : lettres, chiffres, . _ -)');
      if (await this.prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new BadRequestException('Ce pseudo est déjà pris');
      data.username = username;
    }
    for (const field of ['uploaded', 'downloaded'] as const) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        const gb = Number(body[field]);
        if (!Number.isFinite(gb) || gb < 0) throw new BadRequestException(`Valeur invalide pour ${field}`);
        data[field] = BigInt(Math.round(gb * 1e9));
      }
    }
    if (body.bonusPoints !== undefined && body.bonusPoints !== null && body.bonusPoints !== '') {
      const points = Number(body.bonusPoints);
      if (!Number.isFinite(points) || points < 0) throw new BadRequestException('Points bonus invalides');
      data.bonusPoints = points;
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Aucune modification');
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.userDetail(userId);
  }

  deleteTorrent(id: string) {
    return this.prisma.torrent.delete({ where: { id } });
  }

  /** Lien de réinitialisation de mot de passe (1 h, usage unique) à transmettre au membre. */
  async issueResetLink(actor: Actor, userId: string) {
    this.assertOutranks(actor, await this.loadTarget(userId));
    await this.prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } });
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600_000);
    await this.prisma.passwordReset.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt } });
    return { token, expiresAt };
  }

  async warnUser(actor: Actor, userId: string, reason: string) {
    this.assertOutranks(actor, await this.loadTarget(userId));
    if (!reason?.trim()) throw new BadRequestException('Motif requis');
    return this.prisma.warning.create({ data: { userId, reason: reason.trim(), issuedBy: actor.username } });
  }

  async banUser(actor: Actor, userId: string, reason: string, expiresAt?: Date) {
    this.assertOutranks(actor, await this.loadTarget(userId));
    if (!reason?.trim()) throw new BadRequestException('Motif requis');
    return this.prisma.$transaction([
      this.prisma.ban.create({ data: { userId, reason: reason.trim(), issuedBy: actor.username, expiresAt } }),
      this.prisma.user.update({ where: { id: userId }, data: { status: 'BANNED' } }),
    ]);
  }

  async unbanUser(actor: Actor, userId: string) {
    this.assertOutranks(actor, await this.loadTarget(userId));
    return this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  }

  listReports(status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN') {
    return this.reports.listForStaff(status);
  }

  async resolveReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    const report = await this.prisma.report.update({ where: { id }, data: { status } });
    // La personne qui a signalé est prévenue de la suite donnée.
    await this.notifications.notify({
      userId: report.reporterId,
      type: 'SYSTEM',
      title: status === 'RESOLVED' ? 'Ton signalement a été traité' : 'Ton signalement a été examiné',
      body: status === 'RESOLVED' ? 'Merci : le staff a pris les mesures nécessaires.' : "Le staff n'a pas retenu d'action pour cet élément. Merci d'avoir aidé à garder la communauté propre.",
    }).catch(() => undefined);
    return report;
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
