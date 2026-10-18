import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { forgetIdentity } from '../common/utils/session-identity';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { ReportsService } from '../reports/reports.service';
import { SocialService } from '../social/social.service';
import { normalizeOrigin } from '../common/utils/facets';
import { facetKeysFor, normalizeAttrs } from '../common/utils/facet-schema';

import { createHash, randomBytes, randomUUID } from 'crypto';

const ROLE_RANK: Record<string, number> = { USER: 0, UPLOADER: 1, MODERATOR: 2, SUPER_MODERATOR: 3, ADMIN: 4, OWNER: 5 };
const MEMBER_EDITORS = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const MEMBER_CLASSES = ['NOUVEAU', 'MEMBRE', 'POWER_USER', 'ELITE', 'VETERAN'];
const TORRENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DEAD'];

import { AccountDeletionService, DELETED_USER_ID } from './account-deletion.service';
import { normalizeLanguage } from '../common/utils/language';
import { stripReleaseExtension } from '../common/utils/release-name';
import { AuthService } from '../auth/auth.service';
import { UploadCreditService } from '../upload-credit/upload-credit.service';
import { holdMessage, normalizeHold } from '../common/utils/torrent-hold';

export interface Actor { userId: string; username: string; role: string }

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private badges: BadgesService, private reports: ReportsService, private social: SocialService, private deletion: AccountDeletionService, private auth: AuthService, private uploadCredit: UploadCreditService) {}

  async approveTorrent(id: string) {
    const previous = await this.prisma.torrent.findUnique({ where: { id }, select: { approvedAt: true } });
    const torrent = await this.prisma.torrent.update({ where: { id }, data: { status: 'APPROVED', holdAt: null, holdReasons: [], holdNote: null, holdByName: null, rejectReason: null, ...(previous?.approvedAt ? {} : { approvedAt: new Date() }) } });
    await this.notifications.notify({
      userId: torrent.uploaderId,
      type: 'TORRENT_APPROVED',
      title: 'Ton torrent a été approuvé',
      body: torrent.name,
      link: `/torrents/${torrent.id}`,
    });
    await this.badges.checkAndAward(torrent.uploaderId);
    await this.uploadCredit.onApproved(torrent.id); // crédit d'envoi (versé tout de suite si l'uploader seede, sinon rattrapé plus tard)
    // Les abonnés à un acteur, studio, genre... de ce torrent sont prévenus (sans jamais bloquer l'approbation).
    await this.social.notifyFollowers(torrent.id).catch(() => undefined);
    return torrent;
  }

  async rejectTorrent(id: string, reason?: string) {
    const why = (reason ?? '').trim().slice(0, 300);
    const torrent = await this.prisma.torrent.update({ where: { id }, data: { status: 'REJECTED', holdAt: null, holdReasons: [], holdNote: null, holdByName: null, rejectReason: why || null } });
    await this.uploadCredit.revoke(id).catch(() => undefined);
    await this.notifications.notify({
      userId: torrent.uploaderId,
      type: 'TORRENT_REJECTED',
      title: 'Ton torrent a été rejeté',
      body: why ? `${torrent.name} — Motif : ${why}` : torrent.name,
      link: `/torrents/${torrent.id}?edit=1`, // le membre peut corriger : le torrent repart alors en validation
    });
    return torrent;
  }

  /**
   * Met un torrent en attente en suspens et demande une correction au membre (pas de seed, erreur dans la description, mauvais NFO, mauvaise fiche...).
   * Le torrent reste « en attente » mais sort de la file à examiner jusqu'à ce que le membre le renvoie corrigé.
   */
  async holdTorrent(id: string, actor: Actor, raw: any) {
    let hold;
    try { hold = normalizeHold(raw); } catch (e: any) { throw new BadRequestException(e.message); }
    const t = await this.prisma.torrent.findUnique({ where: { id }, select: { id: true, name: true, status: true, uploaderId: true } });
    if (!t) throw new NotFoundException('Torrent introuvable');
    if (t.status !== 'PENDING') throw new BadRequestException('Seul un torrent en attente de validation peut être mis en suspens');
    const torrent = await this.prisma.torrent.update({ where: { id }, data: { holdAt: new Date(), holdReasons: hold.reasons, holdNote: hold.note || null, holdByName: actor.username.slice(0, 60), resubmittedAt: null, resubmitNote: null } });
    await this.notifications.notify({
      userId: t.uploaderId, type: 'SYSTEM', category: 'torrents', title: '✏️ Modification demandée sur ton torrent',
      body: holdMessage(t.name, hold, actor.username), link: `/torrents/${t.id}?edit=1`,
    });
    return torrent;
  }

  /** Compteurs de la file de modération (pastille du menu « Modération »). */
  async queueCounts() {
    const [pendingTorrents, openReports] = await Promise.all([
      this.prisma.torrent.count({ where: { status: 'PENDING', holdAt: null } }), // les torrents en attente de correction ne sont pas à examiner
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]);
    return { pendingTorrents, openReports, total: pendingTorrents + openReports };
  }

  /**
   * Torrents à valider, du plus ancien au plus récent, avec de quoi décider sans ouvrir chaque fiche : étiquettes de la release, envoyeur
   * (ancienneté, ratio, historique d'envois), fiche, NFO, description, fichiers, doublons possibles, origine de l'envoi et contrôles automatiques.
   */
  async pendingQueue() {
    const rows = await this.prisma.torrent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, infoHash: true, name: true, size: true, coverImage: true, createdAt: true, year: true, resolution: true, description: true, nfoFile: { select: { content: true } }, fileList: true,
        seeders: true, leechers: true, anonymousUpload: true, freeleech: true, doubleUpload: true, holdAt: true, holdReasons: true, holdNote: true, holdByName: true, resubmittedAt: true, resubmitNote: true,
        language: true, source: true, codec: true, hdr: true, audio: true, subtitles: true, containerFormat: true, season: true, episode: true, releaseDate: true, origin: true,
        releaseGroup: true, genres: true, videoType: true, durationMinutes: true, metaSource: true, metaExternalId: true, metadata: true,
        category: { select: { name: true, adult: true, parent: { select: { name: true, adult: true } } } },
        uploader: { select: { id: true, username: true, role: true, uploaded: true, downloaded: true, createdAt: true, parentId: true, profileType: true } },
      },
    });
    const ids = rows.map((r) => r.id);
    const uploaderIds = [...new Set(rows.map((r) => r.uploader.id))];
    const [reportCounts, history, sameFiche, sameName, memberItems] = await Promise.all([
      this.prisma.report.groupBy({ by: ['targetId'], where: { status: 'OPEN', targetType: 'torrent', targetId: { in: ids } }, _count: { _all: true } }),
      this.prisma.torrent.groupBy({ by: ['uploaderId', 'status'], where: { uploaderId: { in: uploaderIds } }, _count: { _all: true } }),
      this.prisma.torrent.findMany({
        where: { status: { in: ['APPROVED', 'PENDING'] }, metaExternalId: { in: rows.map((r) => r.metaExternalId).filter((x): x is string => !!x) } },
        select: { id: true, name: true, status: true, metaSource: true, metaExternalId: true, language: true, resolution: true, source: true, season: true, episode: true, size: true, seeders: true },
      }),
      this.prisma.torrent.findMany({
        where: { status: { in: ['APPROVED', 'PENDING'] }, name: { in: rows.map((r) => r.name) } },
        select: { id: true, name: true, status: true, metaSource: true, metaExternalId: true, language: true, resolution: true, source: true, season: true, episode: true, size: true, seeders: true },
      }),
      this.prisma.memberImportItem.findMany({ where: { torrentId: { in: ids } }, select: { torrentId: true, detail: true, learned: true } }),
    ]);
    const reported = new Map(reportCounts.map((r) => [r.targetId, r._count._all]));
    const histOf = (uid: string) => {
      const h = { approved: 0, rejected: 0, pending: 0, other: 0 };
      for (const g of history) if (g.uploaderId === uid) { if (g.status === 'APPROVED') h.approved += g._count._all; else if (g.status === 'REJECTED') h.rejected += g._count._all; else if (g.status === 'PENDING') h.pending += g._count._all; else h.other += g._count._all; }
      return h;
    };
    const imported = new Map(memberItems.map((m) => [m.torrentId as string, m]));
    const plain = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n).trimEnd() + '…' : t);
    const pick = (o: any) => ({ id: o.id, name: o.name, status: o.status, language: o.language, resolution: o.resolution, source: o.source, season: o.season, episode: o.episode, size: Number(o.size), seeders: o.seeders });

    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, any>;
      const files: { path: string; size: number }[] = Array.isArray(r.fileList) ? (r.fileList as any[]) : [];
      const text = plain(r.description ?? '');
      const nfo = (r.nfoFile?.content ?? '').trim(); // le NFO est rangé à part (TorrentNfo), pas dans la fiche
      const up = Number(r.uploader.uploaded), down = Number(r.uploader.downloaded);
      const dupes = [
        ...sameFiche.filter((o) => o.id !== r.id && o.metaExternalId === r.metaExternalId && o.metaSource === r.metaSource && r.metaExternalId && (!r.season || !o.season || o.season === r.season) && (!r.episode || !o.episode || o.episode === r.episode)).map((o) => ({ ...pick(o), why: 'même fiche' })),
        ...sameName.filter((o) => o.id !== r.id && o.name === r.name).map((o) => ({ ...pick(o), why: 'même nom' })),
      ];
      const seen = new Set<string>();
      const duplicates = dupes.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true))).slice(0, 6);
      const mi = imported.get(r.id);
      const miDetail = (mi?.detail ?? {}) as Record<string, any>;
      return {
        id: r.id, infoHash: r.infoHash, name: r.name, size: Number(r.size), coverImage: r.coverImage, createdAt: r.createdAt, year: r.year, resolution: r.resolution,
        language: r.language, source: r.source, codec: r.codec, hdr: r.hdr, audio: r.audio, subtitles: r.subtitles, containerFormat: r.containerFormat, season: r.season, episode: r.episode,
        releaseDate: r.releaseDate, origin: r.origin, releaseGroup: r.releaseGroup, videoType: r.videoType, durationMinutes: r.durationMinutes, genres: r.genres,
        seeders: r.seeders, leechers: r.leechers, anonymousUpload: r.anonymousUpload, freeleech: r.freeleech, doubleUpload: r.doubleUpload,
        hold: r.holdAt ? { at: r.holdAt, reasons: r.holdReasons, note: r.holdNote, by: r.holdByName } : null,
        resubmitted: r.resubmittedAt ? { at: r.resubmittedAt, note: r.resubmitNote } : null,
        category: r.category ? { name: r.category.name, path: [r.category.parent?.name, r.category.name].filter(Boolean).join(' › '), adult: !!(r.category.adult || r.category.parent?.adult) } : null,
        uploader: {
          id: r.uploader.id, username: r.uploader.username, role: r.uploader.role, uploaded: r.uploader.uploaded, downloaded: r.uploader.downloaded, createdAt: r.uploader.createdAt,
          ratio: down > 0 ? up / down : null, history: histOf(r.uploader.id),
        },
        fiche: r.metaSource ? { source: r.metaSource, id: r.metaExternalId, title: meta.title ?? meta.name ?? meta.originalTitle ?? null, originalTitle: meta.originalTitle ?? null, year: meta.year ?? null } : null,
        nfo: { present: nfo.length >= 20, length: nfo.length, excerpt: nfo ? cut(nfo.replace(/\r/g, ''), 1200) : '' },
        description: { length: text.length, excerpt: cut(text, 600) },
        excerpt: cut(text, 240),
        fileCount: files.length,
        files: files.slice(0, 15).map((f) => ({ path: String(f.path), size: Number(f.size) })),
        filesTruncated: files.length > 15,
        duplicates,
        sentVia: mi ? { via: 'envoi multiple', verdict: miDetail.verdict ?? null, learned: !!mi.learned } : null,
        openReports: reported.get(r.id) ?? 0,
      };
    });
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
  async updateTorrent(id: string, body: Record<string, any>, opts: { owner?: boolean } = {}) {
    const data: Record<string, any> = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = stripReleaseExtension(body.name.trim().slice(0, 300));
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
    if (typeof body.language === 'string') data.language = normalizeLanguage(body.language) ?? null;
    if (body.attrs && typeof body.attrs === 'object' && !Array.isArray(body.attrs)) {
      const t = await this.prisma.torrent.findUnique({ where: { id }, select: { categoryId: true } });
      const catId = data.categoryId ?? t?.categoryId;
      const c = catId ? await this.prisma.category.findUnique({ where: { id: catId }, select: { name: true, parent: { select: { name: true } } } }) : null;
      data.attrs = normalizeAttrs(body.attrs, facetKeysFor(c?.parent?.name ?? c?.name ?? '', c?.name ?? ''));
    }
    if (typeof body.overview === 'string') {
      // Synopsis affiché (modifiable à la main) : il remplace celui de la fiche et n'est plus retraduit automatiquement.
      const cur = await this.prisma.torrent.findUnique({ where: { id }, select: { metadata: true } });
      data.metadata = { ...((cur?.metadata as object) ?? {}), overview: body.overview.trim().slice(0, 4000) || null };
      data.overviewTranslatedAt = new Date();
    }
    // Caractéristiques de la release : l'envoyeur peut corriger toutes ses erreurs, comme le staff.
    if (body.year === null || body.year === '') data.year = null;
    else if (body.year !== undefined) {
      const y = Number(body.year);
      if (!Number.isInteger(y) || y < 1880 || y > new Date().getFullYear() + 2) throw new BadRequestException('Année invalide');
      data.year = y;
    }
    for (const key of ['codec', 'audio', 'containerFormat'] as const) {
      if (typeof body[key] === 'string') data[key] = body[key].trim().slice(0, 60) || null;
    }
    if (typeof body.hdr === 'boolean') data.hdr = body.hdr;
    if (Array.isArray(body.subtitles)) data.subtitles = body.subtitles.filter((t: any) => typeof t === 'string').map((t: string) => t.trim().slice(0, 24)).filter(Boolean).slice(0, 12);
    if (typeof body.anonymousUpload === 'boolean') data.anonymousUpload = body.anonymousUpload;
    if (Array.isArray(body.tags)) data.tags = body.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 12);
    if (typeof body.releaseDate === 'string') {
      const d = body.releaseDate.trim();
      if (d && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d)) throw new BadRequestException('Date de sortie invalide (AAAA, AAAA-MM ou AAAA-MM-JJ)');
      data.releaseDate = d || null;
    }
    for (const key of ['fps', 'durationMinutes'] as const) {
      if (body[key] === null || body[key] === '') data[key] = null;
      else if (body[key] !== undefined) {
        const n = Number(body[key]);
        if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new BadRequestException('Valeur numérique invalide');
        data[key] = n;
      }
    }
    if (typeof body.nfo === 'string') {
      const nfo = body.nfo.trim();
      if (nfo.replace(/\s+/g, ' ').length < 20) throw new BadRequestException('Le NFO ou le MediaInfo est obligatoire (20 caractères minimum)');
      data.nfoFile = { upsert: { create: { content: nfo.slice(0, 200_000) }, update: { content: nfo.slice(0, 200_000) } } };
    }
    if (body.coverImage === null || typeof body.coverImage === 'string') {
      const cover = body.coverImage || null;
      // L'envoyeur ne peut choisir qu'une image enregistrée sur Seeduction (jamais un lien externe).
      if (cover && opts.owner && !/^\/api\/covers\/[\w.-]+$/.test(cover)) throw new BadRequestException('Pochette invalide : téléverse une image');
      data.coverImage = cover;
    }
    if (!opts.owner) {
      // Réservé à l'équipe : mise en avant (freeleech, double upload) et statut.
      if (typeof body.freeleech === 'boolean') data.freeleech = body.freeleech;
      if (typeof body.doubleUpload === 'boolean') data.doubleUpload = body.doubleUpload;
      if (TORRENT_STATUSES.includes(body.status)) data.status = body.status;
    }
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

  async deleteTorrent(id: string) {
    await this.uploadCredit.revoke(id).catch(() => undefined); // le crédit d'envoi de ce torrent est repris
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

  /**
   * Réinitialisation OBLIGATOIRE du mot de passe (administrateurs) : toutes les sessions du compte sont fermées, il est inutilisable tant que le membre n'a pas choisi un nouveau mot de passe
   * avec le lien reçu par courriel (valable 24 h). `cancel` lève l'exigence sans changer le mot de passe.
   */
  async forceReset(actor: Actor, userId: string, cancel: boolean, ip?: string | null) {
    const fresh = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { role: true, status: true } });
    if (!fresh || fresh.status !== 'ACTIVE' || !['ADMIN', 'OWNER'].includes(fresh.role)) throw new ForbiddenException('Réservé aux administrateurs');
    actor = { ...actor, role: fresh.role };
    userId = await this.accountIdOf(userId);
    const target = await this.loadTarget(userId);
    this.assertOutranks(actor, target);
    if (cancel) {
      await this.prisma.user.update({ where: { id: userId }, data: { mustResetPassword: false } });
      forgetIdentity(userId);
      return { mustResetPassword: false };
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, email: true } });
    if (!user) throw new NotFoundException('Membre introuvable');
    await this.prisma.user.update({ where: { id: userId }, data: { mustResetPassword: true, sessionsValidAfter: new Date() } });
    forgetIdentity(userId);
    const r = await this.auth.sendResetMail(user, 24, ip, true);
    return { mustResetPassword: true, emailed: r.sent, link: r.sent ? null : r.link };
  }

  async warnUser(actor: Actor, userId: string, reason: string) {
    userId = await this.accountIdOf(userId);
    this.assertOutranks(actor, await this.loadTarget(userId));
    if (!reason?.trim()) throw new BadRequestException('Motif requis');
    return this.prisma.warning.create({ data: { userId, reason: reason.trim(), issuedBy: actor.username } });
  }

  /**
   * Suppression définitive d'un compte : réservée aux administrateurs, sur un membre de rang inférieur, après avoir saisi son propre
   * mot de passe (+ code 2FA si activée) et le pseudo exact du compte visé. Irréversible : préfère le bannissement quand c'est possible.
   */
  async deleteMember(actor: Actor, userId: string, body: { password?: string; totpToken?: string; confirmUsername?: string }, ip?: string | null) {
    // Action irréversible : on relit le rôle en base (le jeton peut dater de plusieurs jours).
    const fresh = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { role: true, status: true } });
    if (!fresh || fresh.status !== 'ACTIVE' || !['ADMIN', 'OWNER'].includes(fresh.role)) throw new ForbiddenException('Réservé aux administrateurs');
    actor = { ...actor, role: fresh.role };
    userId = await this.accountIdOf(userId);
    if (userId === DELETED_USER_ID) throw new BadRequestException('Ce compte système ne peut pas être supprimé');
    const target = await this.loadTarget(userId);
    this.assertOutranks(actor, target);
    if (String(body.confirmUsername ?? '').trim() !== target.username) throw new BadRequestException('Pseudo de confirmation incorrect');
    await this.auth.assertStaffReauth(actor.userId, String(body.password ?? ''), body.totpToken, ip);
    const snapshot = await this.deletionSnapshot(userId); // relevé AVANT l'effacement : c'est tout ce qui restera du compte dans le journal
    const summary = await this.deletion.deleteAccount(userId);
    return { deleted: true, username: target.username, snapshot, ...summary };
  }

  /** Ce qu'il faut savoir d'un compte avant sa suppression (journal d'audit) : profil, activité, et la liste de ses torrents, qui passent au compte « supprimé ». */
  private async deletionSnapshot(userId: string) {
    const kids = await this.prisma.user.findMany({ where: { parentId: userId }, select: { id: true, username: true } });
    const ids = [userId, ...kids.map((k) => k.id)];
    const [u, torrents, approved, comments, posts, warnings, bans, team] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { username: true, email: true, role: true, status: true, createdAt: true, lastSeenAt: true, uploaded: true, downloaded: true, bonusPoints: true, memberClass: true } }),
      this.prisma.torrent.findMany({ where: { uploaderId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, name: true, status: true } }),
      this.prisma.torrent.count({ where: { uploaderId: { in: ids }, status: 'APPROVED' } }),
      this.prisma.torrentComment.count({ where: { authorId: { in: ids } } }),
      this.prisma.forumPost.count({ where: { authorId: { in: ids } } }),
      this.prisma.warning.count({ where: { userId: { in: ids } } }),
      this.prisma.ban.count({ where: { userId: { in: ids } } }),
      this.prisma.teamMember.findFirst({ where: { userId }, include: { team: { select: { name: true } } } }),
    ]);
    const up = Number(u?.uploaded ?? 0), down = Number(u?.downloaded ?? 0);
    return {
      role: u?.role, status: u?.status, memberClass: u?.memberClass ?? null, createdAt: u?.createdAt ?? null, lastSeenAt: u?.lastSeenAt ?? null,
      uploaded: up, downloaded: down, ratio: down > 0 ? Math.round((up / down) * 100) / 100 : null, bonusPoints: Math.round(Number(u?.bonusPoints ?? 0)),
      profiles: kids.map((k) => k.username), team: team?.team?.name ?? null,
      counts: { torrents: torrents.length >= 100 ? '100+' : torrents.length, torrentsApproved: approved, torrentComments: comments, forumPosts: posts, warnings, bans },
      torrents: torrents.map((t) => ({ id: t.id, name: t.name, status: t.status })),
    };
  }

  /** Active à la main un compte dont le courriel n'a jamais été confirmé (courriel perdu, boîte pleine...). */
  async activateMember(actor: Actor, userId: string) {
    if (!['ADMIN', 'OWNER'].includes(actor.role)) throw new ForbiddenException('Réservé aux administrateurs');
    userId = await this.accountIdOf(userId);
    const ok = await this.auth.activate(userId);
    if (!ok) throw new BadRequestException("Ce compte n'attend pas de confirmation");
    return { activated: true };
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
      this.prisma.user.count({ where: { profileType: { not: 'BOT' } } }),
      this.prisma.torrent.count({ where: { status: 'APPROVED' } }),
      this.prisma.peer.count(),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]).then(([users, torrents, activePeers, openReports]) => ({ users, torrents, activePeers, openReports }));
  }
}
