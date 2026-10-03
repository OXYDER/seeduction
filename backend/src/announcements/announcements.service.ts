import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export const NEWS_KINDS = ['NEWS', 'UPDATE', 'EVENT', 'MAINTENANCE', 'IMPORTANT'] as const;
export const NEWS_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥'];
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const COMMENTS_PER_PAGE = 20;
const COMMENT_MAX = 3000;

const AUTHOR = { select: { id: true, username: true, avatarUrl: true } } as const;
const COUNTS = { select: { comments: true, reactions: true, views: true } } as const;
const KIND_PREFIX: Record<string, string> = { NEWS: '📯', UPDATE: '🆕', EVENT: '🎉', MAINTENANCE: '🛠️', IMPORTANT: '⚠️' };

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  private cleanKind(v: unknown): string | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string' || !(NEWS_KINDS as readonly string[]).includes(v)) throw new BadRequestException('Type de nouvelle invalide');
    return v;
  }

  list(limit = 5) {
    return this.prisma.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { author: AUTHOR, _count: COUNTS },
    });
  }

  /** Les nouvelles les plus récentes, épinglées ou non (accueil). */
  latest(limit = 3) {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(10, Math.max(1, limit || 3)),
      include: { author: AUTHOR, _count: COUNTS },
    });
  }

  /** Fil des nouvelles, paginé (les épinglées d'abord, puis les plus récentes), filtrable par type et par mot. */
  async feed(page: number, pageSize = 10, opts: { kind?: string; q?: string } = {}) {
    const safePage = Math.max(1, page || 1);
    const where: any = {};
    if (opts.kind && (NEWS_KINDS as readonly string[]).includes(opts.kind)) where.kind = opts.kind;
    const q = opts.q?.trim();
    if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { content: { contains: q, mode: 'insensitive' } }];
    const [total, items] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: (safePage - 1) * pageSize,
        take: pageSize,
        include: { author: AUTHOR, _count: COUNTS },
      }),
    ]);
    return { items, total, page: safePage, pageSize };
  }

  /** Une nouvelle avec ses réactions, ses lecteurs, sa voisine précédente / suivante et d'autres à lire. Compte la lecture du membre. */
  async findOne(id: string, viewerId?: string) {
    if (viewerId && (await this.prisma.announcement.count({ where: { id } }))) {
      await this.prisma.announcementView.createMany({ data: [{ announcementId: id, userId: viewerId }], skipDuplicates: true }).catch(() => {});
    }
    const item = await this.prisma.announcement.findUnique({ where: { id }, include: { author: AUTHOR, _count: COUNTS } });
    if (!item) throw new NotFoundException('Nouvelle introuvable');

    const [grouped, mine, older, newer, more] = await Promise.all([
      this.prisma.announcementReaction.groupBy({ by: ['emoji'], where: { announcementId: id }, _count: { _all: true } }),
      viewerId ? this.prisma.announcementReaction.findUnique({ where: { announcementId_userId: { announcementId: id, userId: viewerId } } }) : null,
      this.prisma.announcement.findFirst({ where: { createdAt: { lt: item.createdAt } }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true } }),
      this.prisma.announcement.findFirst({ where: { createdAt: { gt: item.createdAt } }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true } }),
      this.prisma.announcement.findMany({ where: { id: { not: id } }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, imageUrl: true, kind: true, createdAt: true } }),
    ]);
    const counts = Object.fromEntries(NEWS_REACTIONS.map((e) => [e, grouped.find((g) => g.emoji === e)?._count._all ?? 0]));
    return { ...item, reactionCounts: counts, myReaction: mine?.emoji ?? null, older, newer, more, reactionChoices: NEWS_REACTIONS };
  }

  // ------------------------------------------------------------------ réactions

  async react(id: string, userId: string, emoji: string) {
    if (!NEWS_REACTIONS.includes(emoji)) throw new BadRequestException('Réaction inconnue');
    if (!(await this.prisma.announcement.count({ where: { id } }))) throw new NotFoundException('Nouvelle introuvable');
    await this.prisma.announcementReaction.upsert({
      where: { announcementId_userId: { announcementId: id, userId } },
      update: { emoji }, create: { announcementId: id, userId, emoji },
    });
    return { ok: true };
  }

  async unreact(id: string, userId: string) {
    await this.prisma.announcementReaction.deleteMany({ where: { announcementId: id, userId } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ commentaires

  async comments(id: string, page: number) {
    const safePage = Math.max(1, page || 1);
    const where = { announcementId: id };
    const [total, rows] = await Promise.all([
      this.prisma.announcementComment.count({ where }),
      this.prisma.announcementComment.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (safePage - 1) * COMMENTS_PER_PAGE, take: COMMENTS_PER_PAGE }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } },
      select: { id: true, username: true, role: true, memberClass: true, avatarUrl: true, parentId: true, profileName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return { total, page: safePage, pageSize: COMMENTS_PER_PAGE, items: rows.map((r) => ({ ...r, author: byId.get(r.authorId) ?? null })) };
  }

  async addComment(id: string, user: { userId: string; username: string }, content: string) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Commentaire vide');
    if (text.length > COMMENT_MAX) throw new BadRequestException(`Commentaire trop long (${COMMENT_MAX} caractères maximum)`);
    const news = await this.prisma.announcement.findUnique({ where: { id }, select: { id: true, title: true, authorId: true, commentsLocked: true } });
    if (!news) throw new NotFoundException('Nouvelle introuvable');
    if (news.commentsLocked) throw new ForbiddenException('Les commentaires sont fermés pour cette nouvelle');
    const comment = await this.prisma.announcementComment.create({ data: { announcementId: id, authorId: user.userId, content: text } });
    if (news.authorId !== user.userId) {
      await this.notifications.notify({ userId: news.authorId, type: 'ANNOUNCEMENT', title: `${user.username} a commenté ta nouvelle`, body: news.title, link: `/news/${id}#commentaires` });
    }
    return comment;
  }

  async editComment(cid: string, viewer: { userId: string; role: string }, content: string) {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Commentaire vide');
    if (text.length > COMMENT_MAX) throw new BadRequestException(`Commentaire trop long (${COMMENT_MAX} caractères maximum)`);
    const c = await this.prisma.announcementComment.findUnique({ where: { id: cid } });
    if (!c) throw new NotFoundException('Commentaire introuvable');
    if (c.authorId !== viewer.userId && !STAFF.includes(viewer.role)) throw new ForbiddenException('Tu ne peux modifier que tes commentaires');
    return this.prisma.announcementComment.update({ where: { id: cid }, data: { content: text, editedAt: new Date() } });
  }

  async removeComment(cid: string, viewer: { userId: string; role: string }) {
    const c = await this.prisma.announcementComment.findUnique({ where: { id: cid } });
    if (!c) throw new NotFoundException('Commentaire introuvable');
    if (c.authorId !== viewer.userId && !STAFF.includes(viewer.role)) throw new ForbiddenException('Tu ne peux supprimer que tes commentaires');
    await this.prisma.announcementComment.delete({ where: { id: cid } });
    return { deleted: true };
  }

  // ------------------------------------------------------------------ rédaction (staff)

  private cleanImage(v: unknown): string | null | undefined {
    if (v === undefined) return undefined;
    if (!v) return null;
    if (typeof v !== 'string' || !/^\/api\/covers\/[\w.-]+$/.test(v)) throw new BadRequestException('Image invalide : téléverse-la depuis le site');
    return v;
  }

  async update(id: string, data: { title?: string; content?: string; pinned?: boolean; summary?: string | null; imageUrl?: string | null; kind?: string; commentsLocked?: boolean }) {
    const payload: any = {};
    if (data.summary !== undefined) payload.summary = (data.summary ?? '').trim().slice(0, 300) || null;
    const img = this.cleanImage(data.imageUrl);
    if (img !== undefined) payload.imageUrl = img;
    const kind = this.cleanKind(data.kind);
    if (kind) payload.kind = kind;
    if (data.title?.trim()) payload.title = data.title.trim();
    if (data.content?.trim()) payload.content = data.content;
    if (typeof data.pinned === 'boolean') payload.pinned = data.pinned;
    if (typeof data.commentsLocked === 'boolean') payload.commentsLocked = data.commentsLocked;
    if (Object.keys(payload).length === 0) throw new BadRequestException('Aucune modification');
    return this.prisma.announcement.update({ where: { id }, data: payload });
  }

  async create(authorId: string, title: string, content: string, pinned = false, extra: { summary?: string | null; imageUrl?: string | null; kind?: string; commentsLocked?: boolean } = {}) {
    if (!title?.trim() || !content?.trim()) throw new BadRequestException('Titre et contenu requis');
    const kind = this.cleanKind(extra.kind) ?? 'NEWS';
    const announcement = await this.prisma.announcement.create({
      data: {
        title: title.trim(), content, pinned, kind, commentsLocked: !!extra.commentsLocked,
        summary: (extra.summary ?? '').trim().slice(0, 300) || null, imageUrl: this.cleanImage(extra.imageUrl) ?? null, author: { connect: { id: authorId } },
      },
    });
    // La notification affiche un extrait sans balises de mise en forme.
    await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `${KIND_PREFIX[kind]} ${title}`, body: content.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140), link: `/news/${announcement.id}` });
    return announcement;
  }

  delete(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}
