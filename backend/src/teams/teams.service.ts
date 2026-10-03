import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const STAFF = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const MAX_PENDING = 3;
const USER_SELECT = { id: true, username: true, avatarUrl: true, memberClass: true, role: true } as const;

export interface Viewer { accountId: string; role: string }

/**
 * Teams : des équipes de membres (uploaders, releasers, traducteurs...) que l'on peut consulter et auxquelles on peut
 * postuler. L'administration crée une team et nomme son chef ; le chef et ses officiers examinent les candidatures et gèrent
 * les membres. Un membre fait partie d'une seule team à la fois. Tout se fait au niveau du COMPTE (pas des profils famille).
 */
@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  private slugify(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'team';
  }

  private clean(v: unknown, max: number) { return String(v ?? '').trim().slice(0, max); }

  /** Rôle du visiteur dans cette team (chef / officier / membre / aucun). */
  private async roleIn(teamId: string, accountId: string) {
    return (await this.prisma.teamMember.findFirst({ where: { teamId, userId: accountId } }))?.role ?? null;
  }

  private canManage(role: string | null, v: Viewer) { return role === 'LEADER' || role === 'OFFICER' || STAFF.includes(v.role); }

  // ------------------------------------------------------------------ lecture

  async list(v: Viewer) {
    const teams = await this.prisma.team.findMany({ orderBy: [{ recruiting: 'desc' }, { name: 'asc' }], include: { _count: { select: { members: true } } } });
    const members = await this.prisma.teamMember.findMany({ where: { teamId: { in: teams.map((t) => t.id) } }, select: { teamId: true, userId: true } });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set([...members.map((m) => m.userId), ...teams.map((t) => t.leaderId)])] } }, select: { id: true, username: true, avatarUrl: true, uploaded: true } });
    const uById = new Map(users.map((u) => [u.id, u]));
    const mine = await this.prisma.teamMember.findFirst({ where: { userId: v.accountId } });
    const apps = await this.prisma.teamApplication.findMany({ where: { userId: v.accountId, status: 'PENDING' }, select: { teamId: true, id: true } });
    const appByTeam = new Map(apps.map((a) => [a.teamId, a.id]));
    return {
      myTeamId: mine?.teamId ?? null,
      pending: apps.length,
      maxPending: MAX_PENDING,
      teams: teams.map((t) => {
        const ms = members.filter((m) => m.teamId === t.id);
        const upload = ms.reduce((n, m) => n + Number(uById.get(m.userId)?.uploaded ?? 0n), 0);
        return {
          id: t.id, name: t.name, tag: t.tag, slug: t.slug, description: t.description, logoUrl: t.logoUrl, recruiting: t.recruiting, createdAt: t.createdAt,
          memberCount: t._count.members, totalUpload: upload, leader: uById.get(t.leaderId) ? { id: t.leaderId, username: uById.get(t.leaderId)!.username, avatarUrl: uById.get(t.leaderId)!.avatarUrl } : null,
          applied: appByTeam.has(t.id), mine: mine?.teamId === t.id,
        };
      }),
    };
  }

  async get(id: string, v: Viewer) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    const myRole = await this.roleIn(id, v.accountId);
    const manage = this.canManage(myRole, v);
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
      const au = await this.prisma.user.findMany({ where: { id: { in: apps.map((a) => a.userId) } }, select: { ...USER_SELECT, uploaded: true, downloaded: true, createdAt: true, _count: { select: { torrentsUploaded: true } } } });
      const auById = new Map(au.map((u) => [u.id, u]));
      applications = apps.map((a) => {
        const u = auById.get(a.userId);
        return { id: a.id, message: a.message, createdAt: a.createdAt, user: u ? { id: u.id, username: u.username, avatarUrl: u.avatarUrl, memberClass: u.memberClass } : null, uploaded: Number(u?.uploaded ?? 0), downloaded: Number(u?.downloaded ?? 0), torrents: u?._count.torrentsUploaded ?? 0, memberSince: u?.createdAt ?? null };
      });
    }
    const mineTeam = await this.prisma.teamMember.findFirst({ where: { userId: v.accountId } });
    return {
      id: team.id, name: team.name, tag: team.tag, description: team.description, requirements: team.requirements, logoUrl: team.logoUrl, recruiting: team.recruiting, createdAt: team.createdAt,
      myRole, canManage: manage, canDelete: STAFF.includes(v.role), inOtherTeam: !!mineTeam && mineTeam.teamId !== id, myApplicationId: mineApp?.id ?? null,
      members, applications,
    };
  }

  // ------------------------------------------------------------------ administration

  async create(v: Viewer, input: { name: string; tag?: string; description?: string; requirements?: string; leaderUsername: string; logoUrl?: string | null }) {
    if (!['ADMIN', 'OWNER', 'SUPER_MODERATOR'].includes(v.role)) throw new ForbiddenException('Seule l\'administration crée une team');
    const name = this.clean(input.name, 40);
    if (name.length < 2) throw new BadRequestException('Donne un nom à la team (2 caractères minimum)');
    const slug = this.slugify(name);
    if (await this.prisma.team.findFirst({ where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] }, select: { id: true } })) throw new BadRequestException('Une team porte déjà ce nom');
    const leader = await this.prisma.user.findFirst({ where: { username: { equals: this.clean(input.leaderUsername, 40), mode: 'insensitive' }, parentId: null }, select: { id: true, username: true } });
    if (!leader) throw new BadRequestException('Chef introuvable : écris son pseudo exact (celui du compte)');
    if (await this.prisma.teamMember.findFirst({ where: { userId: leader.id } })) throw new BadRequestException('Ce membre fait déjà partie d\'une team');
    const logoUrl = input.logoUrl && /^\/api\/covers\/[\w.-]+$/.test(input.logoUrl) ? input.logoUrl : null;
    const team = await this.prisma.team.create({
      data: { name, slug, tag: this.clean(input.tag, 8).toUpperCase() || null, description: this.clean(input.description, 3000), requirements: this.clean(input.requirements, 2000) || null, leaderId: leader.id, logoUrl, members: { create: { userId: leader.id, role: 'LEADER' } } },
    });
    await this.prisma.teamApplication.updateMany({ where: { userId: leader.id, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
    await this.notifications.notify({ userId: leader.id, type: 'SYSTEM', title: `Tu diriges la team ${name}`, body: 'Tu peux examiner les candidatures et gérer les membres depuis la page de ta team.', link: `/teams/${team.id}` }).catch(() => undefined);
    return { id: team.id };
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

  async apply(id: string, v: Viewer, message: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    if (!team.recruiting) throw new BadRequestException('Cette team ne recrute pas pour le moment');
    if (await this.prisma.teamMember.findFirst({ where: { userId: v.accountId } })) throw new BadRequestException('Tu fais déjà partie d\'une team : quitte-la avant de postuler ailleurs');
    const text = this.clean(message, 1000);
    if (text.length < 10) throw new BadRequestException('Présente-toi et explique ce que tu apporterais (10 caractères minimum)');
    if (await this.prisma.teamApplication.findFirst({ where: { teamId: id, userId: v.accountId, status: 'PENDING' }, select: { id: true } })) throw new BadRequestException('Tu as déjà postulé à cette team');
    if ((await this.prisma.teamApplication.count({ where: { userId: v.accountId, status: 'PENDING' } })) >= MAX_PENDING) throw new BadRequestException(`Tu as déjà ${MAX_PENDING} candidatures en attente : retires-en une avant d'en envoyer une autre`);
    const app = await this.prisma.teamApplication.create({ data: { teamId: id, userId: v.accountId, message: text } });
    const user = await this.prisma.user.findUnique({ where: { id: v.accountId }, select: { username: true } });
    const leads = await this.prisma.teamMember.findMany({ where: { teamId: id, role: { in: ['LEADER', 'OFFICER'] } }, select: { userId: true } });
    await Promise.all(leads.map((l) => this.notifications.notify({ userId: l.userId, type: 'SYSTEM', title: `Nouvelle candidature pour ${team.name}`, body: `${user?.username ?? 'Un membre'} souhaite rejoindre la team.`, link: `/teams/${id}` }).catch(() => undefined)));
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
    if (!this.canManage(await this.roleIn(team.id, v.accountId), v)) throw new ForbiddenException('Réservé au chef et aux officiers');
    if (accept) {
      if (await this.prisma.teamMember.findFirst({ where: { userId: app.userId } })) {
        await this.prisma.teamApplication.update({ where: { id: app.id }, data: { status: 'DECLINED', decidedAt: new Date(), decidedById: v.accountId } });
        throw new BadRequestException('Ce membre a rejoint une autre team entre-temps');
      }
      await this.prisma.$transaction([
        this.prisma.teamMember.create({ data: { teamId: team.id, userId: app.userId, role: 'MEMBER' } }),
        this.prisma.teamApplication.update({ where: { id: app.id }, data: { status: 'ACCEPTED', decidedAt: new Date(), decidedById: v.accountId } }),
        this.prisma.teamApplication.updateMany({ where: { userId: app.userId, status: 'PENDING', id: { not: app.id } }, data: { status: 'WITHDRAWN', decidedAt: new Date() } }),
      ]);
    } else {
      await this.prisma.teamApplication.update({ where: { id: app.id }, data: { status: 'DECLINED', decidedAt: new Date(), decidedById: v.accountId } });
    }
    await this.notifications.notify({ userId: app.userId, type: 'SYSTEM', title: accept ? `Bienvenue dans la team ${team.name} !` : `Candidature refusée : ${team.name}`, body: accept ? 'Ta candidature a été acceptée.' : 'Ta candidature n\'a pas été retenue cette fois.', link: `/teams/${team.id}` }).catch(() => undefined);
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
    const mine = await this.roleIn(id, v.accountId);
    if (!this.canManage(mine, v)) throw new ForbiddenException('Réservé au chef et aux officiers');
    const target = await this.prisma.teamMember.findFirst({ where: { teamId: id, userId } });
    if (!target) throw new NotFoundException('Membre introuvable');
    if (target.role === 'LEADER') throw new BadRequestException('Le chef ne peut pas être retiré');
    if (target.role === 'OFFICER' && mine === 'OFFICER') throw new ForbiddenException('Un officier ne peut pas retirer un autre officier');
    await this.prisma.teamMember.delete({ where: { id: target.id } });
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
