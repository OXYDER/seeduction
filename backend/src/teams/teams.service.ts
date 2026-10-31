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
    await Promise.all(staff.map((s) => this.notifications.notify({ userId: s.id, type: 'SYSTEM', category: 'social', title, body, link }).catch(() => undefined)));
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
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { ...USER_SELECT, anonymousTeam: true, uploaded: true, downloaded: true, createdAt: true, _count: { select: { torrentsUploaded: true } } } });
    const uById = new Map(users.map((u) => [u.id, u]));
    const order = { LEADER: 0, OFFICER: 1, MEMBER: 2 } as Record<string, number>;
    const members = rows.map((r) => {
      const u = uById.get(r.userId);
      // Anonyme dans la team : par choix du membre ou du chef. Seuls le chef, les officiers, l'administration et le membre lui-même voient qui c'est.
      const anon = !!(r.anonymous || u?.anonymousTeam);
      const hide = anon && !manage && r.userId !== v.accountId;
      if (hide) return { userId: `anon-${r.id}`, role: r.role, joinedAt: r.joinedAt, anonymous: true, user: { id: `anon-${r.id}`, username: 'Anonyme', avatarUrl: null, memberClass: 'MEMBRE', role: 'USER' }, uploaded: 0, torrents: 0 };
      return { userId: r.userId, role: r.role, joinedAt: r.joinedAt, anonymous: anon, anonymousByLeader: r.anonymous, user: u ? { id: u.id, username: u.username, avatarUrl: u.avatarUrl, memberClass: u.memberClass, role: u.role } : null, uploaded: Number(u?.uploaded ?? 0), torrents: u?._count.torrentsUploaded ?? 0 };
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
      id: team.id, name: team.name, tag: team.tag, description: team.description, requirements: team.requirements, logoUrl: team.logoUrl, bannerUrl: team.bannerUrl, slogan: team.slogan, accent: team.accent, monthlyGoal: team.monthlyGoal, recruiting: team.recruiting, createdAt: team.createdAt,
      auto: team.auto, hasOwner: !!team.leaderId, releaseCount: team.releaseCount, releases: releases.map((r) => ({ ...r, size: Number(r.size) })),
      myRole, isMember: !!myRole || STAFF.includes(v.role), canManage: manage, canDelete: STAFF.includes(v.role), inOtherTeam: !!mineTeam && mineTeam.teamId !== id, myApplicationId: mineApp?.id ?? null,
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
    await this.notifications.notify({ userId: leader.id, type: 'SYSTEM', category: 'social', title: `Tu diriges la team ${name}`, body: 'Tu peux examiner les candidatures et gérer les membres depuis la page de ta team.', link: `/teams/${teamId}` }).catch(() => undefined);
    return { id: teamId };
  }

  async update(id: string, v: Viewer, body: { name?: string; tag?: string | null; description?: string; requirements?: string | null; recruiting?: boolean; logoUrl?: string | null; bannerUrl?: string | null; slogan?: string | null; accent?: string | null; monthlyGoal?: number }) {
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
    if (body.bannerUrl !== undefined) {
      if (body.bannerUrl && !/^\/api\/covers\/[\w.-]+$/.test(body.bannerUrl)) throw new BadRequestException('Bannière invalide');
      data.bannerUrl = body.bannerUrl || null;
    }
    if (body.slogan !== undefined) data.slogan = this.clean(body.slogan, 120) || null;
    if (body.accent !== undefined) { if (body.accent && !/^#[0-9a-fA-F]{6}$/.test(body.accent)) throw new BadRequestException('Couleur invalide (#rrggbb)'); data.accent = body.accent || null; }
    if (body.monthlyGoal !== undefined) data.monthlyGoal = Math.max(0, Math.min(10000, Math.floor(Number(body.monthlyGoal) || 0)));
    await this.prisma.team.update({ where: { id }, data });
    return { ok: true };
  }

  // ------------------------------------------------------------------ annonces et nouvelles de la team

  private async asMember(id: string, v: Viewer) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team introuvable');
    const role = await this.roleIn(id, v.accountId);
    return { team, role, member: !!role || STAFF.includes(v.role), manage: this.canManage(team, role, v) };
  }

  /** Les annonces : les membres de la team voient tout, les autres seulement celles publiées « pour tout le site ». */
  async listPosts(id: string, v: Viewer) {
    const { member, manage } = await this.asMember(id, v);
    const rows = await this.prisma.teamPost.findMany({ where: { teamId: id, ...(member ? {} : { publicPost: true }) }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 50 });
    const authors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, username: true, avatarUrl: true, anonymousTeam: true } });
    const byId = new Map(authors.map((a) => [a.id, a]));
    return { canPost: manage, items: rows.map((r) => { const a = byId.get(r.authorId); const hide = !!a?.anonymousTeam && !manage && a.id !== v.accountId; return { id: r.id, kind: r.kind, title: r.title, content: r.content, pinned: r.pinned, publicPost: r.publicPost, createdAt: r.createdAt, updatedAt: r.updatedAt, author: a && !hide ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: null, username: 'Anonyme', avatarUrl: null } }; }) };
  }

  private postData(body: any) {
    const kinds = ['ANNOUNCEMENT', 'NEWS', 'RECRUITING', 'EVENT'];
    const title = this.clean(body?.title, 160), content = this.clean(body?.content, 8000);
    if (title.length < 2 || content.length < 2) throw new BadRequestException('Titre et contenu requis');
    return { title, content, kind: kinds.includes(body?.kind) ? body.kind : 'ANNOUNCEMENT', pinned: !!body?.pinned, publicPost: !!body?.publicPost };
  }

  async createPost(id: string, v: Viewer, body: any) {
    const { team, manage } = await this.asMember(id, v);
    if (!manage) throw new ForbiddenException('Réservé au chef et aux officiers');
    const data = this.postData(body);
    const post = await this.prisma.teamPost.create({ data: { ...data, teamId: id, authorId: v.accountId } });
    if (body?.notify !== false) {
      const members = await this.prisma.teamMember.findMany({ where: { teamId: id, userId: { not: v.accountId } }, select: { userId: true } });
      await Promise.all(members.map((m) => this.notifications.notify({ userId: m.userId, type: 'SYSTEM', category: 'social', title: `${team.name} : ${data.title}`, body: data.content.slice(0, 160), link: `/teams/${id}` }).catch(() => undefined)));
    }
    return { id: post.id };
  }

  async updatePost(id: string, postId: string, v: Viewer, body: any) {
    const { manage } = await this.asMember(id, v);
    if (!manage) throw new ForbiddenException('Réservé au chef et aux officiers');
    const post = await this.prisma.teamPost.findFirst({ where: { id: postId, teamId: id } });
    if (!post) throw new NotFoundException('Annonce introuvable');
    await this.prisma.teamPost.update({ where: { id: postId }, data: this.postData(body) });
    return { ok: true };
  }

  async deletePost(id: string, postId: string, v: Viewer) {
    const { manage } = await this.asMember(id, v);
    if (!manage) throw new ForbiddenException('Réservé au chef et aux officiers');
    await this.prisma.teamPost.deleteMany({ where: { id: postId, teamId: id } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ anonymat d'un membre (choisi par le chef, lui compris)

  async setMemberAnonymous(id: string, v: Viewer, userId: string, anonymous: boolean) {
    const { team, role } = await this.asMember(id, v);
    if (!(role === 'LEADER' || STAFF.includes(v.role)) || !team) throw new ForbiddenException('Réservé au chef de la team');
    const m = await this.prisma.teamMember.findFirst({ where: { teamId: id, userId } });
    if (!m) throw new NotFoundException('Ce membre ne fait pas partie de la team');
    await this.prisma.teamMember.update({ where: { id: m.id }, data: { anonymous: !!anonymous } });
    return { ok: true, anonymous: !!anonymous };
  }

  // ------------------------------------------------------------------ tableau de bord de la team (membres seulement)

  async dashboard(id: string, v: Viewer) {
    const { team, role, member, manage } = await this.asMember(id, v);
    if (!member) throw new ForbiddenException('Réservé aux membres de la team');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await this.prisma.teamMember.findMany({ where: { teamId: id }, select: { id: true, userId: true, role: true, joinedAt: true, anonymous: true } });
    const ids = rows.map((r) => r.userId);
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatarUrl: true, lastSeenAt: true, anonymousTeam: true } });
    const uById = new Map(users.map((u) => [u.id, u]));
    const hidden = (userId: string) => { const r = rows.find((x) => x.userId === userId); return !!(r?.anonymous || uById.get(userId)?.anonymousTeam) && !manage && userId !== v.accountId; };
    const nameOf = (userId: string) => (hidden(userId) ? 'Anonyme' : uById.get(userId)?.username ?? '(ancien membre)');
    const base = { releaseGroup: team.slug, status: 'APPROVED' as const };
    const [monthRel, monthAgg, seedAgg, byUploader, recent, weak] = await Promise.all([
      this.prisma.torrent.count({ where: { ...base, createdAt: { gte: monthStart } } }),
      this.prisma.torrent.aggregate({ where: { ...base, createdAt: { gte: monthStart } }, _sum: { size: true } }),
      this.prisma.torrent.aggregate({ where: base, _sum: { seeders: true, leechers: true } }),
      this.prisma.torrent.groupBy({ by: ['uploaderId'], where: { ...base, createdAt: { gte: monthStart }, uploaderId: { in: ids } }, _count: { _all: true }, _sum: { size: true }, orderBy: { _count: { uploaderId: 'desc' } }, take: 10 }),
      this.prisma.torrent.findMany({ where: base, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, name: true, createdAt: true, uploaderId: true, anonymousUpload: true } }),
      manage ? this.prisma.torrent.findMany({ where: { ...base, seeders: { lte: 2 } }, orderBy: { seeders: 'asc' }, take: 8, select: { id: true, name: true, seeders: true, leechers: true } }) : Promise.resolve([] as { id: string; name: string; seeders: number; leechers: number }[]),
    ]);
    const posts = await this.prisma.teamPost.findMany({ where: { teamId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, kind: true, createdAt: true } });
    const online = users.filter((u) => u.lastSeenAt && now.getTime() - u.lastSeenAt.getTime() < 15 * 60_000).length;
    // fil d'activité : releases, arrivées et annonces, les plus récentes d'abord
    const activity = [
      ...recent.map((t) => ({ at: t.createdAt, icon: '📦', text: `Release : ${t.name}`, link: `/torrents/${t.id}`, who: t.anonymousUpload || !t.uploaderId ? 'Anonyme' : nameOf(t.uploaderId) })),
      ...rows.filter((r) => now.getTime() - r.joinedAt.getTime() < 30 * 86_400_000).map((r) => ({ at: r.joinedAt, icon: '👋', text: `${nameOf(r.userId)} a rejoint la team`, link: null as string | null, who: '' })),
      ...posts.map((p) => ({ at: p.createdAt, icon: '📣', text: `Annonce : ${p.title}`, link: null as string | null, who: '' })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);
    // santé (chef et officiers) : hit & run ouverts des membres, membres inactifs
    let health: { weakReleases: typeof weak; hnr: { name: string; count: number }[]; inactive: { name: string; days: number }[] } | null = null;
    if (manage) {
      const hnr = await this.prisma.snatch.groupBy({ by: ['userId'], where: { userId: { in: ids }, hnr: true, satisfied: false }, _count: { _all: true } });
      health = {
        weakReleases: weak,
        hnr: hnr.map((h) => ({ name: nameOf(h.userId), count: h._count._all })).sort((a, b) => b.count - a.count),
        inactive: users.filter((u) => !u.lastSeenAt || now.getTime() - u.lastSeenAt.getTime() > 30 * 86_400_000).map((u) => ({ name: nameOf(u.id), days: u.lastSeenAt ? Math.floor((now.getTime() - u.lastSeenAt.getTime()) / 86_400_000) : 999 })),
      };
    }
    return {
      myRole: role, canSeeHealth: manage,
      overview: { members: rows.length, online, releasesMonth: monthRel, volumeMonth: Number(monthAgg._sum.size ?? 0), seeders: seedAgg._sum.seeders ?? 0, leechers: seedAgg._sum.leechers ?? 0, goal: { target: team.monthlyGoal, done: monthRel } },
      contributions: byUploader.map((b) => ({ name: nameOf(b.uploaderId), releases: b._count._all, volume: Number(b._sum.size ?? 0) })),
      activity, health,
    };
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
      await Promise.all(leads.map((l) => this.notifications.notify({ userId: l.userId, type: 'SYSTEM', category: 'social', title: `Nouvelle candidature pour ${team.name}`, body: `${user?.username ?? 'Un membre'} souhaite rejoindre la team.`, link: `/teams/${id}` }).catch(() => undefined)));
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
      userId: app.userId, type: 'SYSTEM', category: 'social',
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
    await this.notifications.notify({ userId, type: 'SYSTEM', category: 'social', title: 'Tu as été retiré d\'une team', link: '/teams' }).catch(() => undefined);
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
