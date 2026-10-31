import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdultService } from '../adult/adult.service';
import { BadgesService } from '../badges/badges.service';
import {
  WALL_COMMENTS_PER_DAY, WALL_POSTS_PER_DAY, WALL_PROFILE_VISIBILITY, WALL_TEAM_VISIBILITY,
  canSeeWallPost, cleanWallImage, cleanWallLink, isWallReaction,
} from '../common/utils/wall';

export interface WallViewer { accountId: string; role: string }

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const PAGE = 15;
const DAY = 86_400_000;
const ANON_AUTHOR = { id: null, username: 'Anonyme', avatarUrl: null };

type PostRow = { id: string; authorId: string; teamId: string | null; content: string; imageUrl: string | null; linkUrl: string | null; torrentId: string | null; visibility: string; createdAt: Date };

/**
 * Le Mur : publications sur le profil d'un membre et sur la page d'une team, avec réactions et commentaires. Tout est réservé aux membres du site : rien n'est jamais public.
 * L'anonymat est respecté (site : masqué par l'intercepteur global ; team : géré ici pour les publications de team).
 */
@Injectable()
export class WallService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private adult: AdultService, private badges: BadgesService) {}

  // ------------------------------------------------------------------ aides

  private isStaff(v: WallViewer) { return STAFF.includes(v.role); }

  private async friendIds(accountId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: accountId }, { addresseeId: accountId }] }, select: { requesterId: true, addresseeId: true } });
    return rows.map((r) => (r.requesterId === accountId ? r.addresseeId : r.requesterId));
  }

  private async isFriend(a: string, b: string) {
    return !!(await this.prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] }, select: { id: true } }));
  }

  private async teamRole(teamId: string, accountId: string) {
    return (await this.prisma.teamMember.findFirst({ where: { teamId, userId: accountId }, select: { role: true } }))?.role ?? null;
  }

  /** Ce que le membre peut faire sur une publication (la lire, la supprimer). */
  private async access(post: PostRow, v: WallViewer) {
    const staff = this.isStaff(v);
    const role = post.teamId ? await this.teamRole(post.teamId, v.accountId) : null;
    const isAuthor = post.authorId === v.accountId;
    const isFriend = !post.teamId && post.visibility === 'FRIENDS' && !isAuthor ? await this.isFriend(post.authorId, v.accountId) : false;
    const see = canSeeWallPost(post, { isAuthor, isFriend, isTeamMember: !!role, isStaff: staff });
    const manage = staff || isAuthor || role === 'LEADER' || role === 'OFFICER';
    return { see, manage, role, staff, isAuthor };
  }

  private async load(postId: string, v: WallViewer) {
    const post = await this.prisma.wallPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Publication introuvable');
    const a = await this.access(post, v);
    if (!a.see) throw new NotFoundException('Publication introuvable');
    return { post, ...a };
  }

  /** Membres qui apparaissent « Anonyme » dans cette team (choix du chef ou du membre), pour tous sauf le staff, les gestionnaires et eux-mêmes. */
  private async teamHidden(teamIds: string[]) {
    const out = new Map<string, Set<string>>();
    if (teamIds.length === 0) return out;
    const rows = await this.prisma.teamMember.findMany({ where: { teamId: { in: teamIds } }, select: { teamId: true, userId: true, anonymous: true } });
    const flags = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] }, anonymousTeam: true }, select: { id: true } });
    const anonTeam = new Set(flags.map((f) => f.id));
    for (const r of rows) if (r.anonymous || anonTeam.has(r.userId)) { const s = out.get(r.teamId) ?? new Set<string>(); s.add(r.userId); out.set(r.teamId, s); }
    return out;
  }

  /** Les auteurs affichables, avec le masquage propre aux teams. */
  private async authorsOf(items: { authorId: string; teamId: string | null }[], v: WallViewer) {
    const ids = [...new Set(items.map((i) => i.authorId))];
    const teamIds = [...new Set(items.map((i) => i.teamId).filter((x): x is string => !!x))];
    const [users, hidden, mine] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatarUrl: true } }),
      this.teamHidden(teamIds),
      teamIds.length ? this.prisma.teamMember.findMany({ where: { teamId: { in: teamIds }, userId: v.accountId }, select: { teamId: true, role: true } }) : Promise.resolve([] as { teamId: string; role: string }[]),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const myRole = new Map(mine.map((m) => [m.teamId, m.role]));
    const staff = this.isStaff(v);
    return (item: { authorId: string; teamId: string | null }) => {
      const u = byId.get(item.authorId);
      if (!u) return { id: item.authorId, username: '(ancien membre)', avatarUrl: null };
      const manager = staff || ['LEADER', 'OFFICER'].includes(myRole.get(item.teamId ?? '') ?? '');
      if (item.teamId && hidden.get(item.teamId)?.has(u.id) && !manager && u.id !== v.accountId) return ANON_AUTHOR;
      return { id: u.id, username: u.username, avatarUrl: u.avatarUrl };
    };
  }

  /** Les publications telles que le site les affiche : auteur, torrent partagé, réactions, nombre de commentaires. */
  private async decorate(rows: PostRow[], v: WallViewer) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const torrentIds = [...new Set(rows.map((r) => r.torrentId).filter((x): x is string => !!x))];
    const [author, reacts, mine, comments, torrents, hiddenCats, roles] = await Promise.all([
      this.authorsOf(rows, v),
      this.prisma.wallReaction.groupBy({ by: ['postId', 'type'], where: { postId: { in: ids } }, _count: { _all: true } }),
      this.prisma.wallReaction.findMany({ where: { postId: { in: ids }, userId: v.accountId }, select: { postId: true, type: true } }),
      this.prisma.wallComment.groupBy({ by: ['postId'], where: { postId: { in: ids } }, _count: { _all: true } }),
      this.prisma.torrent.findMany({ where: { id: { in: torrentIds }, status: 'APPROVED' }, select: { id: true, name: true, coverImage: true, size: true, seeders: true, categoryId: true } }),
      this.adult.hiddenFor(v.accountId),
      this.prisma.teamMember.findMany({ where: { teamId: { in: [...new Set(rows.map((r) => r.teamId).filter((x): x is string => !!x))] }, userId: v.accountId }, select: { teamId: true, role: true } }),
    ]);
    const counts = new Map<string, Record<string, number>>();
    for (const r of reacts) counts.set(r.postId, { ...(counts.get(r.postId) ?? {}), [r.type]: r._count._all });
    const myReact = new Map(mine.map((m) => [m.postId, m.type]));
    const nComments = new Map(comments.map((c) => [c.postId, c._count._all]));
    const tById = new Map(torrents.map((t) => [t.id, t]));
    const roleOf = new Map(roles.map((r) => [r.teamId, r.role]));
    const staff = this.isStaff(v);
    return rows.map((r) => {
      const t = r.torrentId ? tById.get(r.torrentId) : null;
      const manage = staff || r.authorId === v.accountId || ['LEADER', 'OFFICER'].includes(roleOf.get(r.teamId ?? '') ?? '');
      return {
        kind: 'POST' as const, id: r.id, createdAt: r.createdAt, content: r.content, imageUrl: r.imageUrl, linkUrl: r.linkUrl, visibility: r.visibility, teamId: r.teamId,
        // Torrent partagé : retiré depuis (ou catégorie adulte non activée) → on dit seulement qu'il n'est plus disponible.
        torrent: r.torrentId ? (t && !hiddenCats.includes(t.categoryId) ? { id: t.id, name: t.name, coverImage: t.coverImage, size: Number(t.size), seeders: t.seeders } : { unavailable: true }) : null,
        author: author(r),
        reactions: { counts: counts.get(r.id) ?? {}, mine: myReact.get(r.id) ?? null },
        commentCount: nComments.get(r.id) ?? 0,
        canDelete: manage,
      };
    });
  }

  // ------------------------------------------------------------------ lire les murs

  private page<T extends { createdAt: Date }>(items: T[]) {
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const hasMore = items.length > PAGE;
    const slice = items.slice(0, PAGE);
    return { items: slice, hasMore, next: hasMore ? slice[slice.length - 1].createdAt.toISOString() : null };
  }

  private beforeOf(before?: string) {
    const d = before ? new Date(before) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }

  /** Le mur d'un membre : ses publications que le visiteur a le droit de lire, mêlées à ce qui s'est passé (envois, badges, arrivée en team). */
  async userWall(targetId: string, v: WallViewer, beforeRaw?: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, anonymousSelf: true, anonymous: true, anonymousTeam: true, deletedAt: true } });
    const self = targetId === v.accountId, staff = this.isStaff(v);
    if (!target || ((target.anonymousSelf || target.anonymous) && !self && !staff)) throw new NotFoundException('Membre introuvable');
    const before = this.beforeOf(beforeRaw);
    const friend = !self && !staff ? await this.isFriend(targetId, v.accountId) : false;
    const visibility = self || staff ? [...WALL_PROFILE_VISIBILITY] : friend ? ['MEMBERS', 'FRIENDS'] : ['MEMBERS'];
    const [posts, uploads, badges, joins, hiddenCats] = await Promise.all([
      this.prisma.wallPost.findMany({ where: { authorId: targetId, teamId: null, visibility: { in: visibility }, ...(before ? { createdAt: { lt: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: PAGE + 1 }),
      this.prisma.torrent.findMany({ where: { uploaderId: targetId, anonymousUpload: false, status: 'APPROVED', approvedAt: { not: null, ...(before ? { lt: before } : {}) } }, orderBy: { approvedAt: 'desc' }, take: PAGE + 1, select: { id: true, name: true, coverImage: true, categoryId: true, approvedAt: true } }),
      this.prisma.userBadge.findMany({ where: { userId: targetId, ...(before ? { awardedAt: { lt: before } } : {}) }, orderBy: { awardedAt: 'desc' }, take: PAGE + 1 }),
      this.prisma.teamRoleLog.findMany({ where: { targetId, action: { in: target.anonymousTeam ? [] : ['JOIN', 'LEADER'] }, ...(before ? { createdAt: { lt: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: PAGE + 1 }),
      this.adult.hiddenFor(v.accountId),
    ]);
    const catalog = new Map(this.badges.catalog().map((b: any) => [b.code, b]));
    const teams = await this.prisma.team.findMany({ where: { id: { in: joins.map((j) => j.teamId) } }, select: { id: true, name: true } });
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const events = [
      ...uploads.filter((t) => !hiddenCats.includes(t.categoryId)).map((t) => ({ kind: 'EVENT' as const, id: `up-${t.id}`, event: 'UPLOAD', createdAt: t.approvedAt as Date, torrent: { id: t.id, name: t.name, coverImage: t.coverImage } })),
      ...badges.filter((b) => catalog.has(b.code)).map((b) => { const c: any = catalog.get(b.code); return { kind: 'EVENT' as const, id: `bd-${b.id}`, event: 'BADGE', createdAt: b.awardedAt, badge: { code: b.code, name: c.name, icon: c.icon } }; }),
      ...joins.filter((j) => teamName.has(j.teamId)).map((j) => ({ kind: 'EVENT' as const, id: `tm-${j.id}`, event: j.action === 'LEADER' ? 'TEAM_LEADER' : 'TEAM_JOIN', createdAt: j.createdAt, team: { id: j.teamId, name: teamName.get(j.teamId) as string } })),
    ];
    const merged = this.page<any>([...(await this.decorate(posts, v)), ...events]);
    return { ...merged, canPost: self };
  }

  /** Le mur d'une team : les membres de la team voient tout, les autres membres du site seulement les publications « tout le site ». */
  async teamWall(teamId: string, v: WallViewer, beforeRaw?: string) {
    if (!(await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) throw new NotFoundException('Team introuvable');
    const role = await this.teamRole(teamId, v.accountId);
    const staff = this.isStaff(v);
    const before = this.beforeOf(beforeRaw);
    const rows = await this.prisma.wallPost.findMany({ where: { teamId, visibility: { in: role || staff ? [...WALL_TEAM_VISIBILITY] : ['MEMBERS'] }, ...(before ? { createdAt: { lt: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: PAGE + 1 });
    return { ...this.page(await this.decorate(rows, v)), canPost: !!role };
  }

  /** Mon fil : mes publications, celles de mes amis, de ma team et des teams que je suis. */
  async feed(v: WallViewer, beforeRaw?: string) {
    const before = this.beforeOf(beforeRaw);
    const [friends, mine, followed] = await Promise.all([
      this.friendIds(v.accountId),
      this.prisma.teamMember.findMany({ where: { userId: v.accountId }, select: { teamId: true } }),
      this.prisma.teamFollow.findMany({ where: { userId: v.accountId }, select: { teamId: true } }),
    ]);
    const myTeams = mine.map((m) => m.teamId), followedTeams = followed.map((f) => f.teamId).filter((t) => !myTeams.includes(t));
    const rows = await this.prisma.wallPost.findMany({
      where: {
        AND: [
          before ? { createdAt: { lt: before } } : {},
          { OR: [
            { teamId: null, authorId: v.accountId },
            { teamId: null, authorId: { in: friends }, visibility: { in: ['MEMBERS', 'FRIENDS'] } },
            { teamId: { in: myTeams }, visibility: { in: ['TEAM', 'MEMBERS'] } },
            { teamId: { in: followedTeams }, visibility: 'MEMBERS' },
          ] },
        ],
      },
      orderBy: { createdAt: 'desc' }, take: PAGE + 1,
    });
    return this.page(await this.decorate(rows, v));
  }

  // ------------------------------------------------------------------ publier, supprimer

  async create(v: WallViewer, body: any) {
    const content = String(body?.content ?? '').trim();
    if (content.length > 2000) throw new BadRequestException('Publication trop longue (2000 caractères maximum)');
    const imageUrl = body?.imageUrl ? cleanWallImage(body.imageUrl) : null;
    if (body?.imageUrl && !imageUrl) throw new BadRequestException('Image invalide : envoie-la depuis le site');
    const linkUrl = body?.linkUrl ? cleanWallLink(body.linkUrl) : null;
    if (body?.linkUrl && !linkUrl) throw new BadRequestException('Lien invalide : il doit commencer par http:// ou https://');
    const torrentId = body?.torrentId ? String(body.torrentId) : null;
    if (torrentId) {
      const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { status: true, categoryId: true } });
      if (!t || t.status !== 'APPROVED') throw new BadRequestException('Torrent introuvable');
      if ((await this.adult.hiddenFor(v.accountId)).includes(t.categoryId)) throw new BadRequestException('Ce contenu est réservé aux adultes : active-le dans ton profil.');
    }
    if (!content && !imageUrl && !linkUrl && !torrentId) throw new BadRequestException('Écris quelque chose, ou ajoute une image, un lien ou un torrent');

    const teamId = body?.teamId ? String(body.teamId) : null;
    if (teamId && !(await this.teamRole(teamId, v.accountId))) throw new ForbiddenException('Réservé aux membres de la team');
    const allowed: readonly string[] = teamId ? WALL_TEAM_VISIBILITY : WALL_PROFILE_VISIBILITY;
    const visibility = body?.visibility ? String(body.visibility) : teamId ? 'TEAM' : 'MEMBERS';
    if (!allowed.includes(visibility)) throw new BadRequestException('Visibilité invalide');

    if ((await this.prisma.wallPost.count({ where: { authorId: v.accountId, createdAt: { gt: new Date(Date.now() - DAY) } } })) >= WALL_POSTS_PER_DAY) {
      throw new BadRequestException(`Limite de ${WALL_POSTS_PER_DAY} publications par jour atteinte`);
    }
    const post = await this.prisma.wallPost.create({ data: { authorId: v.accountId, teamId, content, imageUrl, linkUrl, torrentId, visibility } });
    return (await this.decorate([post], v))[0];
  }

  async remove(postId: string, v: WallViewer) {
    const { post, manage } = await this.load(postId, v);
    if (!manage) throw new ForbiddenException('Tu ne peux pas supprimer cette publication');
    await this.prisma.wallPost.delete({ where: { id: post.id } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ réactions

  async react(postId: string, v: WallViewer, type: string | null) {
    const { post } = await this.load(postId, v);
    if (type === null) await this.prisma.wallReaction.deleteMany({ where: { postId: post.id, userId: v.accountId } });
    else {
      if (!isWallReaction(type)) throw new BadRequestException('Réaction invalide');
      await this.prisma.wallReaction.upsert({ where: { postId_userId: { postId: post.id, userId: v.accountId } }, create: { postId: post.id, userId: v.accountId, type }, update: { type } });
    }
    const grouped = await this.prisma.wallReaction.groupBy({ by: ['type'], where: { postId: post.id }, _count: { _all: true } });
    return { counts: Object.fromEntries(grouped.map((g) => [g.type, g._count._all])), mine: type };
  }

  // ------------------------------------------------------------------ commentaires

  async comments(postId: string, v: WallViewer) {
    const { post, manage } = await this.load(postId, v);
    const rows = await this.prisma.wallComment.findMany({ where: { postId: post.id }, orderBy: { createdAt: 'asc' }, take: 200 });
    const author = await this.authorsOf(rows.map((r) => ({ authorId: r.authorId, teamId: post.teamId })), v);
    return rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.createdAt, author: author({ authorId: r.authorId, teamId: post.teamId }), canDelete: manage || r.authorId === v.accountId }));
  }

  async addComment(postId: string, v: WallViewer, contentRaw: string) {
    const { post } = await this.load(postId, v);
    const content = String(contentRaw ?? '').trim();
    if (!content) throw new BadRequestException('Écris ton commentaire');
    if (content.length > 1000) throw new BadRequestException('Commentaire trop long (1000 caractères maximum)');
    if ((await this.prisma.wallComment.count({ where: { authorId: v.accountId, createdAt: { gt: new Date(Date.now() - DAY) } } })) >= WALL_COMMENTS_PER_DAY) {
      throw new BadRequestException(`Limite de ${WALL_COMMENTS_PER_DAY} commentaires par jour atteinte`);
    }
    const c = await this.prisma.wallComment.create({ data: { postId: post.id, authorId: v.accountId, content } });
    if (post.authorId !== v.accountId) {
      const me = await this.prisma.user.findUnique({ where: { id: v.accountId }, select: { username: true, anonymous: true, anonymousSelf: true, anonymousTeam: true } });
      const anon = !!me && (me.anonymous || me.anonymousSelf || (!!post.teamId && me.anonymousTeam));
      await this.notifications.notify({
        userId: post.authorId, type: 'SYSTEM', category: 'social', groupKey: `wall-${post.id}`,
        title: `💬 ${anon ? 'Un membre anonyme' : me?.username ?? 'Un membre'} a commenté ta publication`, titleMany: '💬 {n} nouveaux commentaires sur ta publication',
        body: content.slice(0, 160), link: post.teamId ? `/teams/${post.teamId}` : `/users/${post.authorId}`,
      }).catch(() => undefined);
    }
    const author = await this.authorsOf([{ authorId: v.accountId, teamId: post.teamId }], v);
    return { id: c.id, content: c.content, createdAt: c.createdAt, author: author({ authorId: v.accountId, teamId: post.teamId }), canDelete: true };
  }

  async removeComment(commentId: string, v: WallViewer) {
    const c = await this.prisma.wallComment.findUnique({ where: { id: commentId }, include: { post: true } });
    if (!c) throw new NotFoundException('Commentaire introuvable');
    const a = await this.access(c.post, v);
    if (!a.see) throw new NotFoundException('Commentaire introuvable');
    if (!(a.manage || c.authorId === v.accountId)) throw new ForbiddenException('Tu ne peux pas supprimer ce commentaire');
    await this.prisma.wallComment.delete({ where: { id: c.id } });
    return { ok: true };
  }
}
