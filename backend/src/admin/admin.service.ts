import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { ReportsService } from '../reports/reports.service';
import { SocialService } from '../social/social.service';
import { normalizeOrigin } from '../common/utils/facets';

import { createHash, randomBytes, randomUUID } from 'crypto';

const ROLE_RANK: Record<string, number> = { USER: 0, UPLOADER: 1, MODERATOR: 2, SUPER_MODERATOR: 3, ADMIN: 4, OWNER: 5 };
const MEMBER_EDITORS = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const MEMBER_CLASSES = ['NOUVEAU', 'MEMBRE', 'POWER_USER', 'ELITE', 'VETERAN'];
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

  async rejectTorrent(id: string, reason?: string) {
    const why = (reason ?? '').trim().slice(0, 300);
    const torrent = await this.prisma.torrent.update({ where: { id }, data: { status: 'REJECTED' } });
    await this.notifications.notify({
      userId: torrent.uploaderId,
      type: 'TORRENT_REJECTED',
      title: 'Ton torrent a été rejeté',
      body: why ? `${torrent.name} — Motif : ${why}` : torrent.name,
    });
    return torrent;
  }

  /** Compteurs de la file de modération (pastille du menu « Modération »). */
  async queueCounts() {
    const [pendingTorrents, openReports] = await Promise.all([
      this.prisma.torrent.count({ where: { status: 'PENDING' } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]);
    return { pendingTorrents, openReports, total: pendingTorrents + openReports };
  }

  /** Torrents à valider, du plus ancien au plus récent, avec de quoi décider sans ouvrir chaque fiche. */
  async pendingQueue() {
    const rows = await this.prisma.torrent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, name: true, size: true, coverImage: true, createdAt: true, year: true, resolution: true, description: true, fileList: true,
        anonymousUpload: true, category: { select: { name: true } }, uploader: { select: { id: true, username: true, uploaded: true, downloaded: true, createdAt: true } },
      },
    });
    const reportCounts = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { status: 'OPEN', targetType: 'torrent', targetId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const reported = new Map(reportCounts.map((r) => [r.targetId, r._count._all]));
    return rows.map(({ size, description, fileList, ...t }) => ({
      ...t,
      size: Number(size),
      fileCount: Array.isArray(fileList) ? fileList.length : 0,
      excerpt: (description ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240),
      openReports: reported.get(t.id) ?? 0,
    }));
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
      const cat = await this.prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true, _count: { select: { children: true } } } });
      if (!cat) throw new BadRequestException('Catégorie introuvable');
      if (cat._count.children > 0) throw new BadRequestException('Choisissez une sous-catégorie (les catégories principales ne sont pas sélectionnables)');
      data.categoryId = body.categoryId;
    }
    for (const key of ['season', 'episode', 'videoType'] as const) {
      if (typeof body[key] === 'string') data[key] = body[key].trim().slice(0, 40) || null;
    }
    if (Array.isArray(body.genres)) data.genres = body.genres.filter((g: any) => typeof g === 'string').map((g: string) => g.trim().slice(0, 40)).filter(Boolean).slice(0, 8);
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

  /** Un profil famille se modère à travers son compte : avertissement, bannissement et lien de réinitialisation visent le compte principal. */
  private async accountIdOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { parentId: true } });
    return u?.parentId ?? userId;
  }

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
        minRatio: true, memberClass: true, freeleechTokens: true, parentId: true, familyEnabled: true,
        createdAt: true, lastSeenAt: true,
        warnings: { orderBy: { createdAt: 'desc' }, take: 20 },
        bans: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    // Hit & run non régularisés (qu'un administrateur peut effacer).
    const flagged = await this.prisma.snatch.findMany({ where: { userId, hnr: true, satisfied: false }, orderBy: { completedAt: 'desc' }, take: 50 });
    const names = flagged.length ? await this.prisma.torrent.findMany({ where: { id: { in: flagged.map((f) => f.torrentId) } }, select: { id: true, name: true } }) : [];
    const byId = new Map(names.map((t) => [t.id, t.name]));
    const hnr = flagged.map((f) => ({ id: f.id, torrentId: f.torrentId, name: byId.get(f.torrentId) ?? '(torrent supprimé)', seedHours: Math.floor(f.seedSeconds / 3600), completedAt: f.completedAt }));
    return { ...user, hnr };
  }

  /** Rôle, pseudo, upload/download/bonus : réservé aux administrateurs, avec la hiérarchie des rôles. */
  async updateUser(actor: Actor, userId: string, body: Record<string, any>) {
    userId = await this.accountIdOf(userId);
    if (!MEMBER_EDITORS.includes(actor.role)) throw new ForbiddenException('Réservé aux administrateurs et super modérateurs');
    const target = await this.loadTarget(userId);
    if (actor.userId !== target.id) this.assertOutranks(actor, target);

    const data: Record<string, any> = {};
    const who = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    (target as any).email = who?.email;
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
      // Les profils famille de ce compte portent son pseudo (« Nom·pseudo ») : on les renomme avec lui.
      const kids = await this.prisma.user.findMany({ where: { parentId: userId }, select: { id: true, profileName: true } });
      for (const k of kids) await this.prisma.user.update({ where: { id: k.id }, data: { username: `${k.profileName}·${username}` } });
    }
    for (const field of ['uploaded', 'downloaded'] as const) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        const gb = Number(body[field]);
        if (!Number.isFinite(gb) || gb < 0) throw new BadRequestException(`Valeur invalide pour ${field}`);
        data[field] = BigInt(Math.round(gb * 1e9));
      }
    }
    if (typeof body.email === 'string' && body.email.trim().toLowerCase() !== (target as any).email?.toLowerCase()) {
      const email = body.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Courriel invalide');
      if (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: userId } }, select: { id: true } })) throw new BadRequestException('Ce courriel est déjà utilisé');
      data.email = email;
    }
    if (body.minRatio !== undefined && body.minRatio !== null && body.minRatio !== '') {
      const r = Number(body.minRatio);
      if (!Number.isFinite(r) || r < 0 || r > 20) throw new BadRequestException('Ratio minimum invalide (0 à 20)');
      data.minRatio = r;
    }
    if (typeof body.memberClass === 'string' && body.memberClass) {
      if (!MEMBER_CLASSES.includes(body.memberClass)) throw new BadRequestException('Rang inconnu');
      data.memberClass = body.memberClass;
    }
    if (body.freeleechTokens !== undefined && body.freeleechTokens !== null && body.freeleechTokens !== '') {
      const n = Math.floor(Number(body.freeleechTokens));
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw new BadRequestException('Nombre de jetons invalide');
      data.freeleechTokens = n;
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
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    await this.prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } });
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600_000);
    await this.prisma.passwordReset.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt } });
    return { token, expiresAt };
  }

  async warnUser(actor: Actor, userId: string, reason: string) {
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    if (!reason?.trim()) throw new BadRequestException('Motif requis');
    return this.prisma.warning.create({ data: { userId, reason: reason.trim(), issuedBy: actor.username } });
  }

  async banUser(actor: Actor, userId: string, reason: string, expiresAt?: Date) {
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    if (!reason?.trim()) throw new BadRequestException('Motif requis');
    return this.prisma.$transaction([
      this.prisma.ban.create({ data: { userId, reason: reason.trim(), issuedBy: actor.username, expiresAt } }),
      this.prisma.user.update({ where: { id: userId }, data: { status: 'BANNED' } }),
    ]);
  }

  async unbanUser(actor: Actor, userId: string) {
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    return this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  }

  private assertMemberEditor(actor: Actor) {
    if (!MEMBER_EDITORS.includes(actor.role)) throw new ForbiddenException('Réservé aux administrateurs et super modérateurs');
  }

  /** Efface des hit & run (un seul, ou tous ceux du membre) : ils ne comptent plus ni dans le blocage des téléchargements ni dans son historique. */
  async clearHitAndRun(actor: Actor, userId: string, snatchId?: string) {
    this.assertMemberEditor(actor);
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    const res = await this.prisma.snatch.updateMany({ where: { userId, hnr: true, satisfied: false, ...(snatchId ? { id: snatchId } : {}) }, data: { hnr: false, satisfied: true } });
    let warnings = 0;
    if (!snatchId) warnings = (await this.prisma.warning.deleteMany({ where: { userId, issuedBy: 'Système', reason: { startsWith: 'Hit & run' } } })).count;
    return { cleared: res.count, warningsDeleted: warnings };
  }

  async deleteWarning(actor: Actor, userId: string, warningId: string) {
    this.assertMemberEditor(actor);
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    const res = await this.prisma.warning.deleteMany({ where: { id: warningId, userId } });
    if (res.count === 0) throw new NotFoundException('Avertissement introuvable');
    return { ok: true };
  }

  /** Nouvelle passkey (l'ancienne cesse de fonctionner : le membre doit retélécharger ses .torrent). */
  async regeneratePasskey(actor: Actor, userId: string) {
    this.assertMemberEditor(actor);
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    const passkey = randomUUID();
    await this.prisma.user.update({ where: { id: userId }, data: { passkey } });
    return { ok: true };
  }

  listReports(status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN', target?: { type?: string; id?: string }) {
    return this.reports.listForStaff(status, target);
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
