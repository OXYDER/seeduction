import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { detectReleaseGroup, groupSlug } from '../common/utils/release-group';

const STAFF = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const MAX_PENDING = 3;
const PAGE_SIZE = 24;
const USER_SELECT = { id: true, username: true, avatarUrl: true, memberClass: true, role: true } as const;

export interface Viewer { accountId: string; role: string }

/**
 * Teams : des équipes de membres (uploaders, releasers, traducteurs...) que l'on peut consulter et auxquelles on peut
 * postuler. Deux origines :
 *  • créées par l'administration, avec leur chef ;
 *  • DÉTECTÉES AUTOMATIQUEMENT dans le nom des releases partagées (« ...x264-TOXIC » → team TOXIC) : sans propriétaire tant
 *    qu'un vrai membre de la team n'a pas prouvé qu'il en fait partie ; le premier candidat accepté par l'administration en
 *    devient le propriétaire (chef), puis il gère lui-même les candidatures.
 * Un compte ne fait partie que d'une seule team à la fois. Tout se fait au niveau du COMPTE (pas des profils famille).
 */
@Injectable()
export class TeamsService implements OnModuleInit {
  private log = new Logger('Teams');

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ------------------------------------------------------------------ détection automatique

  onModuleInit() {
    // Rattrape les torrents déjà présents (une seule fois : ceux qui ont été examinés sont marqués), sans bloquer le démarrage.
    setTimeout(() => { void this.backfill().catch((err) => this.log.warn(`Détection des teams interrompue : ${err?.message}`)); }, 20_000);
  }

  /** Une release partagée : retrouve (ou crée) sa team et compte la release. Renvoie la clé à garder sur le torrent ('' si aucune team). */
  async noteRelease(name: string): Promise<string> {
    const group = detectReleaseGroup(name);
    const slug = group ? groupSlug(group) : '';
    if (!group || !slug) return '';
    try {
      await this.prisma.team.upsert({
        where: { slug },
        update: { releaseCount: { increment: 1 } },
        create: { name: group, slug, auto: true, leaderId: null, recruiting: true, description: '', releaseCount: 1 },
      });
    } catch {
      // Course entre deux envois de la même team, ou nom déjà pris par une autre team : la release garde sa clé, le compteur se rattrape plus tard.
    }
    return slug;
  }

  private async backfill() {
    let total = 0;
    for (;;) {
      const rows = await this.prisma.torrent.findMany({ where: { releaseGroup: null }, select: { id: true, name: true }, take: 2000 });
      if (rows.length === 0) break;
      const bySlug = new Map<string, { name: string; ids: string[] }>();
      const none: string[] = [];
      for (const r of rows) {
        const g = detectReleaseGroup(r.name);
        const slug = g ? groupSlug(g) : '';
        if (!g || !slug) { none.push(r.id); continue; }
        const e = bySlug.get(slug) ?? { name: g, ids: [] };
        e.ids.push(r.id);
        bySlug.set(slug, e);
      }
      if (none.length) await this.prisma.torrent.updateMany({ where: { id: { in: none } }, data: { releaseGroup: '' } });
      for (const [slug, e] of bySlug) {
        try {
          await this.prisma.team.upsert({ where: { slug }, update: { releaseCount: { increment: e.ids.length } }, create: { name: e.name, slug, auto: true, leaderId: null, recruiting: true, description: '', releaseCount: e.ids.length } });
        } catch { /* nom déjà pris par une autre team : on marque quand même les torrents */ }
        await this.prisma.torrent.updateMany({ where: { id: { in: e.ids } }, data: { releaseGroup: slug } });
      }
      total += rows.length;
    }
    if (total) this.log.log(`${total} torrent(s) examiné(s) pour détecter les teams`);
  }

  // ------------------------------------------------------------------ outils

  private slugify(name: string) { return groupSlug(name) || 'team'; }
  private clean(v: unknown, max: number) { return String(v ?? '').trim().slice(0, max); }

  /** Rôle du visiteur dans cette team (chef / officier / membre / aucun). */
  private async roleIn(teamId: string, accountId: string) {
    return (await this.prisma.teamMember.findFirst({ where: { teamId, userId: accountId } }))?.role ?? null;
  }

  /** Une team sans chef est gérée par l'administration ; sinon par son chef et ses officiers (et l'administration). */
  private canManage(team: { leaderId: string | null }, role: string | null, v: Viewer) {
    if (STAFF.includes(v.role)) return true;
    return !!team.leaderId && (role === 'LEADER' || role === 'OFFICER');
  }

  private async notifyStaff(title: string, body: string, link: string) {
    const staff = await this.prisma.user.findMany({ where: { role: { in: STAFF as any }, parentId: null, status: 'ACTIVE' }, select: { id: true } });
    await Promise.all(staff.map((s) => this.notifications.notify({ userId: s.id, type: 'SYSTEM', title, body, link }).catch(() => undefined)));
  }

  // ------------------------------------------------------------------ lecture

  async list(v: Viewer, opts: { q?: string; filter?: string; page?: number } = {}) {
    const page = Math.max(1, Math.floor(Number(opts.page) || 1));
    const mine = await this.prisma.teamMember.findFirst({ where: { userId: v.accountId } });
    const and: any[] = [];
    const q = this.clean(opts.q, 40);
    if (q) and.push({ name: { contains: q, mode: 'insensitive' } });
    if (opts.filter === 'recruiting') and.push({ recruiting: true });
    if (opts.filter === 'unowned') and.push({ leaderId: null });
    if (opts.filter === 'owned') and.push({ leaderId: { not: null } });
    if (opts.filter === 'mine') and.push({ id: mine?.teamId ?? '__none__' });
    const where = and.length ? { AND: and } : {};
    const [total, teams, totalAll, totalUnowned] = await Promise.all([
      this.prisma.team.count({ where }),
      this.prisma.team.findMany({
        where, orderBy: [{ leaderId: { sort: 'asc', nulls: 'last' } }, { releaseCount: 'desc' }, { name: 'asc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.team.count(),
      this.prisma.team.count({ where: { leaderId: null } }),
    ]);
    const members = await this.prisma.teamMember.findMany({ where: { teamId: { in: teams.map((t) => t.id) } }, select: { teamId: true, userId: true } });
    const ids = [...new Set([...members.map((m) => m.userId), ...teams.map((t) => t.leaderId).filter((x): x is string => !!x)])];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatarUrl: true, uploaded: true } }) : [];
    const uById = new Map(users.map((u) => [u.id, u]));
    const apps = await this.prisma.teamApplication.findMany({ where: { userId: v.accountId, status: 'PENDING' }, select: { teamId: true } });
    const applied = new Set(apps.map((a) => a.teamId));
    return {
      myTeamId: mine?.teamId ?? null, pending: apps.length, maxPending: MAX_PENDING, page, pageSize: PAGE_SIZE, total, counts: { all: totalAll, unowned: totalUnowned },
      teams: teams.map((t) => {
        const upload = members.filter((m) => m.teamId === t.id).reduce((n, m) => n + Number(uById.get(m.userId)?.uploaded ?? 0n), 0);
        const leader = t.leaderId ? uById.get(t.leaderId) : null;
        return {
          id: t.id, name: t.name, tag: t.tag, slug: t.slug, description: t.description, logoUrl: t.logoUrl, recruiting: t.recruiting, createdAt: t.createdAt,
          auto: t.auto, hasOwner: !!t.leaderId, releaseCount: t.releaseCount, memberCount: t._count.members, totalUpload: upload,
          leader: leader ? { id: leader.id, username: leader.username, avatarUrl: leader.avatarUrl } : null, applied: applied.has(t.id), mine: mine?.teamId === t.id,
        };
      }),
    };
  }

  /** Retrouve l'identifiant d'une team à partir de son nom normalisé (lien depuis le nom d'une release). */
  async idBySlug(slug: string) {
    const t = await this.prisma.team.findUnique({ where: { slug: groupSlug(slug) }, select: { id: true } });
    if (!t) throw new NotFoundException('Team introuvable');
    return t;
  }

  async get(id: string, v: Viewer) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    const myRole = await this.roleIn(id, v.accountId);
    const manage = this.canManage(team, myRole, v);
    const rows = await this.prisma.teamMember.findMany({ where: { teamId: id }, orderBy: [{ joinedAt: 'asc' }] });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { ...USER_SELECT, uploaded: true, downloaded: true, createdAt: true, _count: { select: { torrentsUploaded: true } } } });
    const uById = new Map(users.map((u) => [u.id, u]));
    const order = { LEADER: 0, OFFICER: 1, MEMBER: 2 } as Record<string, number>;
    const members = rows.map((r) => {
      const u = uById.get(r.userId);
      return { userId: r.userId, role: r.role, joinedAt: r.joinedAt, user: u ? { id: u.id, username: u.username, avatarUrl: u.avatarUrl, memberClass: u.memberClass, role: u.role } : null, uploaded: Number(u?.uploaded ?? 0), torrents: u?._count.torrentsUploaded ?? 0 };
    }).sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
    const mineApp = await this.prisma.teamApplication.findFirst({ where: { teamId: id, userId: v.accountId, status: 'PENDING' } });
    let applications: any[] = [];
    if (manage) {
      const apps = await this.prisma.teamApplication.findMany({ where: { teamId: id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
      const au = apps.length ? await this.prisma.user.findMany({ where: { id: { in: apps.map((a) => a.userId) } }, select: { ...USER_SELECT, uploaded: true, downloaded: true, createdAt: true, _count: { select: { torrentsUploaded: true } } } }) : [];
      const auById = new Map(au.map((u) => [u.id, u]));
      applications = apps.map((a) => {
        const u = auById.get(a.userId);
        return { id: a.id, message: a.message, proof: a.proof, createdAt: a.createdAt, user: u ? { id: u.id, username: u.username, avatarUrl: u.avatarUrl, memberClass: u.memberClass } : null, uploaded: Number(u?.uploaded ?? 0), downloaded: Number(u?.downloaded ?? 0), torrents: u?._count.torrentsUploaded ?? 0, memberSince: u?.createdAt ?? null };
      });
    }
    const releases = await this.prisma.torrent.findMany({ where: { releaseGroup: team.slug, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, name: true, size: true, seeders: true, leechers: true, createdAt: true, coverImage: true, resolution: true } });
    const mineTeam = await this.prisma.teamMember.findFirst({ where: { userId: v.accountId } });
    return {
      id: team.id, name: team.name, tag: team.tag, description: team.description, requirements: team.requirements, logoUrl: team.logoUrl, recruiting: team.recruiting, createdAt: team.createdAt,
      auto: team.auto, hasOwner: !!team.leaderId, releaseCount: team.releaseCount, releases: releases.map((r) => ({ ...r, size: Number(r.size) })),
      myRole, canManage: manage, canDelete: STAFF.includes(v.role), inOtherTeam: !!mineTeam && mineTeam.teamId !== id, myApplicationId: mineApp?.id ?? null,
      members, applications,
    };
  }

  // ------------------------------------------------------------------ administration

  async create(v: Viewer, input: { name: string; tag?: string; description?: string; requirements?: string; leaderUsername: string; logoUrl?: string | null }) {
    if (!STAFF.includes(v.role)) throw new ForbiddenException('Seule l\'administration crée une team');
    const name = this.clean(input.name, 40);
    if (name.length < 2) throw new BadRequestException('Donne un nom à la team (2 caractères minimum)');
    const slug = this.slugify(name);
    const leader = await this.prisma.user.findFirst({ where: { username: { equals: this.clean(input.leaderUsername, 40), mode: 'insensitive' }, parentId: null }, select: { id: true, username: true } });
    if (!leader) throw new BadRequestException('Chef introuvable : écris son pseudo exact (celui du compte)');
    if (await this.prisma.teamMember.findFirst({ where: { userId: leader.id } })) throw new BadRequestException('Ce membre fait déjà partie d\'une team');
    const logoUrl = input.logoUrl && /^\/api\/covers\/[\w.-]+$/.test(input.logoUrl) ? input.logoUrl : null;
    const existing = await this.prisma.team.findFirst({ where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] } });
    let teamId: string;
    if (existing) {
      // Une team détectée automatiquement, sans propriétaire : l'administration la remet à son vrai chef.
      if (existing.leaderId) throw new BadRequestException('Une team porte déjà ce nom');
      await this.prisma.$transaction([
        this.prisma.team.update({ where: { id: existing.id }, data: { leaderId: leader.id, auto: false, description: this.clean(input.description, 3000) || existing.description, requirements: this.clean(input.requirements, 2000) || existing.requirements, tag: this.clean(input.tag, 8).toUpperCase() || existing.tag, ...(logoUrl ? { logoUrl } : {}) } }),
        this.prisma.teamMember.create({ data: { teamId: existing.id, userId: leader.id, role: 'LEADER' } }),
      ]);
      teamId = existing.id;
    } else {
      const team = await this.prisma.team.create({
        data: { name, slug, tag: this.clean(input.tag, 8).toUpperCase() || null, description: this.clean(input.description, 3000), requirements: this.clean(input.requirements, 2000) || null, leaderId: leader.id, logoUrl, members: { create: { userId: leader.id, role: 'LEADER' } } },
      });
      teamId = team.id;
    }
    await this.prisma.teamApplication.updateMany({ where: { userId: leader.id, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
    await this.notifications.notify({ userId: leader.id, type: 'SYSTEM', title: `Tu diriges la team ${name}`, body: 'Tu peux examiner les candidatures et gérer les membres depuis la page de ta team.', link: `/teams/${teamId}` }).catch(() => undefined);
    return { id: teamId };
  }

  async update(id: string, v: Viewer, body: { name?: string; tag?: string | null; description?: string; requirements?: string | null; recruiting?: boolean; logoUrl?: string | null }) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    const role = await this.roleIn(id, v.accountId);
    if (!(role === 'LEADER' || STAFF.includes(v.role))) throw new ForbiddenException('Réservé au chef de la team');
    const data: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = this.clean(body.name, 40);
      if (name.length < 2) throw new BadRequestException('Nom trop court');
      if (name.toLowerCase() !== team.name.toLowerCase() && await this.prisma.team.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } }, select: { id: true } })) throw new BadRequestException('Une team porte déjà ce nom');
      // Le nom d'une team qui reçoit des releases détectées doit rester celui de sa clé : seule la casse peut changer.
      if (team.releaseCount > 0 && this.slugify(name) !== team.slug) throw new BadRequestException('Cette team reçoit des releases sous son nom actuel : seule la casse du nom peut être modifiée');
      data.name = name;
    }
    if (body.tag !== undefined) data.tag = this.clean(body.tag, 8).toUpperCase() || null;
    if (body.description !== undefined) data.description = this.clean(body.description, 3000);
    if (body.requirements !== undefined) data.requirements = this.clean(body.requirements, 2000) || null;
    if (typeof body.recruiting === 'boolean') data.recruiting = body.recruiting;
    if (body.logoUrl !== undefined) {
      if (body.logoUrl && !/^\/api\/covers\/[\w.-]+$/.test(body.logoUrl)) throw new BadRequestException('Logo invalide');
      data.logoUrl = body.logoUrl || null;
    }
    await this.prisma.team.update({ where: { id }, data });
    return { ok: true };
  }

  async remove(id: string, v: Viewer) {
    if (!STAFF.includes(v.role)) throw new ForbiddenException('Réservé à l\'administration');
    await this.prisma.teamMember.deleteMany({ where: { teamId: id } });
    await this.prisma.teamApplication.deleteMany({ where: { teamId: id } });
    await this.prisma.team.delete({ where: { id } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ candidatures

  async apply(id: string, v: Viewer, message: string, proof?: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    if (!team.recruiting && team.leaderId) throw new BadRequestException('Cette team ne recrute pas pour le moment');
    if (await this.prisma.teamMember.findFirst({ where: { userId: v.accountId } })) throw new BadRequestException('Tu fais déjà partie d\'une team : quitte-la avant de postuler ailleurs');
    const text = this.clean(message, 1000);
    if (text.length < 10) throw new BadRequestException('Présente-toi et explique ce que tu apporterais (10 caractères minimum)');
    const proofText = this.clean(proof, 1500);
    // Une team sans propriétaire ne donne la place de chef que sur preuve : lien vers l'annonce de la team, NFO signé, capture, etc.
    if (!team.leaderId && proofText.length < 10) throw new BadRequestException('Cette team n\'a pas de propriétaire : joins une preuve que tu en fais vraiment partie (lien vers une annonce, un NFO, une capture…)');
    if (await this.prisma.teamApplication.findFirst({ where: { teamId: id, userId: v.accountId, status: 'PENDING' }, select: { id: true } })) throw new BadRequestException('Tu as déjà postulé à cette team');
    if ((await this.prisma.teamApplication.count({ where: { userId: v.accountId, status: 'PENDING' } })) >= MAX_PENDING) throw new BadRequestException(`Tu as déjà ${MAX_PENDING} candidatures en attente : retires-en une avant d'en envoyer une autre`);
    const app = await this.prisma.teamApplication.create({ data: { teamId: id, userId: v.accountId, message: text, proof: proofText || null } });
    const user = await this.prisma.user.findUnique({ where: { id: v.accountId }, select: { username: true } });
    if (team.leaderId) {
      const leads = await this.prisma.teamMember.findMany({ where: { teamId: id, role: { in: ['LEADER', 'OFFICER'] } }, select: { userId: true } });
      await Promise.all(leads.map((l) => this.notifications.notify({ userId: l.userId, type: 'SYSTEM', title: `Nouvelle candidature pour ${team.name}`, body: `${user?.username ?? 'Un membre'} souhaite rejoindre la team.`, link: `/teams/${id}` }).catch(() => undefined)));
    } else {
      await this.notifyStaff(`Revendication de la team ${team.name}`, `${user?.username ?? 'Un membre'} affirme faire partie de cette team (preuve jointe).`, `/teams/${id}`);
    }
    return { id: app.id };
  }

  async withdraw(id: string, v: Viewer) {
    const res = await this.prisma.teamApplication.updateMany({ where: { teamId: id, userId: v.accountId, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
    if (res.count === 0) throw new NotFoundException('Aucune candidature en attente');
    return { ok: true };
  }

  async decide(applicationId: string, v: Viewer, accept: boolean) {
    const app = await this.prisma.teamApplication.findUnique({ where: { id: applicationId } });
    if (!app || app.status !== 'PENDING') throw new NotFoundException('Candidature introuvable ou déjà traitée');
    const team = await this.prisma.team.findUnique({ where: { id: app.teamId } });
    if (!team) throw new NotFoundException('Team introuvable');
    if (!this.canManage(team, await this.roleIn(team.id, v.accountId), v)) throw new ForbiddenException(team.leaderId ? 'Réservé au chef et aux officiers' : 'Une team sans propriétaire est gérée par l\'administration');
    const claiming = accept && !team.leaderId;
    if (accept) {
      if (await this.prisma.teamMember.findFirst({ where: { userId: app.userId } })) {
        await this.prisma.teamApplication.update({ where: { id: app.id }, data: { status: 'DECLINED', decidedAt: new Date(), decidedById: v.accountId } });
        throw new BadRequestException('Ce membre a rejoint une autre team entre-temps');
      }
      await this.prisma.$transaction([
        this.prisma.teamMember.create({ data: { teamId: team.id, userId: app.userId, role: claiming ? 'LEADER' : 'MEMBER' } }),
        ...(claiming ? [this.prisma.team.update({ where: { id: team.id }, data: { leaderId: app.userId, auto: false } })] : []),
        this.prisma.teamApplication.update({ where: { id: app.id }, data: { status: 'ACCEPTED', decidedAt: new Date(), decidedById: v.accountId } }),
        this.prisma.teamApplication.updateMany({ where: { userId: app.userId, status: 'PENDING', id: { not: app.id } }, data: { status: 'WITHDRAWN', decidedAt: new Date() } }),
      ]);
    } else {
      await this.prisma.teamApplication.update({ where: { id: app.id }, data: { status: 'DECLINED', decidedAt: new Date(), decidedById: v.accountId } });
    }
    await this.notifications.notify({
      userId: app.userId, type: 'SYSTEM',
      title: accept ? (claiming ? `Tu es le propriétaire de la team ${team.name} !` : `Bienvenue dans la team ${team.name} !`) : `Candidature refusée : ${team.name}`,
      body: accept ? (claiming ? 'Ta preuve a été validée : tu diriges la team et gères ses candidatures.' : 'Ta candidature a été acceptée.') : 'Ta candidature n\'a pas été retenue cette fois.', link: `/teams/${team.id}`,
    }).catch(() => undefined);
    return { ok: true };
  }

  // ------------------------------------------------------------------ membres

  async setRole(id: string, v: Viewer, userId: string, role: string) {
    if (!['OFFICER', 'MEMBER'].includes(role)) throw new BadRequestException('Rôle invalide');
    const mine = await this.roleIn(id, v.accountId);
    if (!(mine === 'LEADER' || STAFF.includes(v.role))) throw new ForbiddenException('Réservé au chef de la team');
    const target = await this.prisma.teamMember.findFirst({ where: { teamId: id, userId } });
    if (!target) throw new NotFoundException('Membre introuvable');
    if (target.role === 'LEADER') throw new BadRequestException('Le chef garde son rôle');
    await this.prisma.teamMember.update({ where: { id: target.id }, data: { role } });
    return { ok: true };
  }

  async removeMember(id: string, v: Viewer, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    const mine = await this.roleIn(id, v.accountId);
    if (!this.canManage(team, mine, v)) throw new ForbiddenException('Réservé au chef et aux officiers');
    const target = await this.prisma.teamMember.findFirst({ where: { teamId: id, userId } });
    if (!target) throw new NotFoundException('Membre introuvable');
    if (target.role === 'LEADER' && !STAFF.includes(v.role)) throw new BadRequestException('Le chef ne peut pas être retiré');
    if (target.role === 'OFFICER' && mine === 'OFFICER' && !STAFF.includes(v.role)) throw new ForbiddenException('Un officier ne peut pas retirer un autre officier');
    await this.prisma.teamMember.delete({ where: { id: target.id } });
    // L'administration retire le chef : la team redevient sans propriétaire.
    if (target.role === 'LEADER') await this.prisma.team.update({ where: { id }, data: { leaderId: null } });
    await this.notifications.notify({ userId, type: 'SYSTEM', title: 'Tu as été retiré d\'une team', link: '/teams' }).catch(() => undefined);
    return { ok: true };
  }

  async leave(id: string, v: Viewer) {
    const me = await this.prisma.teamMember.findFirst({ where: { teamId: id, userId: v.accountId } });
    if (!me) throw new NotFoundException('Tu ne fais pas partie de cette team');
    if (me.role === 'LEADER') throw new BadRequestException('Le chef ne peut pas quitter sa team : demande à l\'administration de nommer un autre chef');
    await this.prisma.teamMember.delete({ where: { id: me.id } });
    return { ok: true };
  }

  /** La team d'un compte (affichée sur son profil). */
  teamOf(accountId: string) {
    return this.prisma.teamMember.findFirst({ where: { userId: accountId }, include: { team: { select: { id: true, name: true, tag: true } } } }).then((m) => (m ? { ...m.team, role: m.role } : null));
  }
}
