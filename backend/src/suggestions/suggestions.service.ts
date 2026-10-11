import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import {
  ACTIVE_STATUSES, CLOSED_STATUSES, LIMITS, SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, SuggestionStatus,
  isCategory, isStatus, keywordsOf, similarityScore, statusLabel,
} from './suggestion-meta';

export interface Actor { userId: string; username: string; role: string }
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
export const isStaff = (role?: string) => STAFF.includes(role ?? '');
const AUTHOR = { select: { id: true, username: true, avatarUrl: true, role: true } } as const;
const PAGE = 20;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max + 1) : '');

/**
 * Suggestions des membres avec vote : un membre propose, les autres votent (un vote par compte, retirable). Les plus votées montent en tête ;
 * au seuil réglé par les administrateurs, une suggestion encore « proposée » passe automatiquement « à l'étude » et le staff est prévenu.
 * Le staff la fait ensuite avancer ; chaque changement notifie l'auteur et ceux qui ont voté.
 */
@Injectable()
export class SuggestionsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private settings: SettingsService) {}

  async threshold(): Promise<number> {
    const cfg = await this.settings.get<{ threshold?: number }>('suggestions');
    const n = Number(cfg?.threshold);
    return Number.isFinite(n) ? Math.min(LIMITS.thresholdMax, Math.max(LIMITS.thresholdMin, Math.round(n))) : LIMITS.defaultThreshold;
  }

  async setThreshold(value: unknown) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < LIMITS.thresholdMin || n > LIMITS.thresholdMax) throw new BadRequestException(`Le seuil doit être entre ${LIMITS.thresholdMin} et ${LIMITS.thresholdMax} votes`);
    await this.settings.set('suggestions', { threshold: n });
    return { threshold: n };
  }

  async meta() {
    return { categories: SUGGESTION_CATEGORIES, statuses: SUGGESTION_STATUSES, threshold: await this.threshold(), limits: LIMITS };
  }

  // ------------------------------------------------------------------ lecture

  private view(s: any, voted: boolean, threshold: number) {
    return {
      id: s.id, title: s.title, category: s.category, status: s.status, voteCount: s.voteCount, commentCount: s.commentCount,
      excerpt: s.body.length > 220 ? s.body.slice(0, 220).trimEnd() + '…' : s.body,
      statusNote: s.statusNote && s.statusNote.length > 240 ? s.statusNote.slice(0, 240).trimEnd() + '…' : s.statusNote, statusAt: s.statusAt, duplicateOfId: s.duplicateOfId,
      createdAt: s.createdAt, author: s.author, voted, threshold,
    };
  }

  async list(viewerId: string, q: { view?: string; status?: string; category?: string; q?: string; sort?: string; scope?: string; page?: number }) {
    const where: Prisma.SuggestionWhereInput = {};
    if (isStatus(q.status)) where.status = q.status;
    else if (q.view === 'done') where.status = 'DONE';
    else if (q.view === 'closed') where.status = { in: CLOSED_STATUSES };
    else if (q.view !== 'all') where.status = { in: ACTIVE_STATUSES };
    if (isCategory(q.category)) where.category = q.category;
    if (q.scope === 'mine') where.authorId = viewerId;
    if (q.scope === 'voted') where.votes = { some: { userId: viewerId } };
    const text = clean(q.q, 80);
    if (text) where.OR = [{ title: { contains: text, mode: 'insensitive' } }, { body: { contains: text, mode: 'insensitive' } }];
    const orderBy: Prisma.SuggestionOrderByWithRelationInput[] =
      q.sort === 'new' ? [{ createdAt: 'desc' }] : q.sort === 'comments' ? [{ commentCount: 'desc' }, { voteCount: 'desc' }] : [{ voteCount: 'desc' }, { createdAt: 'desc' }];
    const page = Math.max(1, Math.floor(Number(q.page) || 1));
    const [rows, total, groups, threshold] = await Promise.all([
      this.prisma.suggestion.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { author: AUTHOR } }),
      this.prisma.suggestion.count({ where }),
      this.prisma.suggestion.groupBy({ by: ['status'], _count: { _all: true } }),
      this.threshold(),
    ]);
    const mine = new Set((await this.prisma.suggestionVote.findMany({ where: { userId: viewerId, suggestionId: { in: rows.map((r) => r.id) } }, select: { suggestionId: true } })).map((v) => v.suggestionId));
    const count = (ids: string[]) => groups.filter((g) => ids.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
    return {
      items: rows.map((r) => this.view(r, mine.has(r.id), threshold)),
      total, page, pageSize: PAGE,
      totals: { active: count(ACTIVE_STATUSES), done: count(['DONE']), closed: count(CLOSED_STATUSES) },
    };
  }

  /** Suggestions qui ressemblent à un texte en cours de saisie : évite les doublons avant même de poster. */
  async similar(text: string) {
    const words = keywordsOf(clean(text, 200));
    if (!words.length) return [];
    const rows = await this.prisma.suggestion.findMany({
      where: { status: { not: 'DUPLICATE' }, OR: words.flatMap((w) => [{ title: { contains: w, mode: 'insensitive' as const } }, { body: { contains: w, mode: 'insensitive' as const } }]) },
      take: 40, select: { id: true, title: true, body: true, status: true, voteCount: true },
    });
    return rows
      .map((r) => ({ id: r.id, title: r.title, status: r.status, voteCount: r.voteCount, score: similarityScore(words, r) }))
      .sort((a, b) => b.score - a.score || b.voteCount - a.voteCount)
      .slice(0, 5);
  }

  async get(viewerId: string, id: string) {
    const s = await this.prisma.suggestion.findUnique({ where: { id }, include: { author: AUTHOR, comments: { orderBy: { createdAt: 'asc' }, take: 300, include: { user: AUTHOR } } } });
    if (!s) throw new NotFoundException('Suggestion introuvable');
    const [voted, threshold, dup, statusBy] = await Promise.all([
      this.prisma.suggestionVote.findUnique({ where: { suggestionId_userId: { suggestionId: id, userId: viewerId } }, select: { id: true } }),
      this.threshold(),
      s.duplicateOfId ? this.prisma.suggestion.findUnique({ where: { id: s.duplicateOfId }, select: { id: true, title: true } }) : null,
      s.statusById ? this.prisma.user.findUnique({ where: { id: s.statusById }, select: { id: true, username: true } }) : null,
    ]);
    return {
      ...this.view(s, !!voted, threshold), statusNote: s.statusNote, body: s.body, duplicateOf: dup, statusBy,
      comments: s.comments.map((c) => ({ id: c.id, content: c.content, staff: c.staff, createdAt: c.createdAt, user: c.user })),
    };
  }

  // ------------------------------------------------------------------ écriture (membres)

  async create(actor: Actor, body: any) {
    const title = clean(body?.title, LIMITS.titleMax), text = clean(body?.body, LIMITS.bodyMax);
    if (title.length < LIMITS.titleMin) throw new BadRequestException(`Le titre est trop court (${LIMITS.titleMin} caractères minimum)`);
    if (title.length > LIMITS.titleMax) throw new BadRequestException(`Le titre est trop long (${LIMITS.titleMax} caractères maximum)`);
    if (text.length < LIMITS.bodyMin) throw new BadRequestException(`Explique ton idée un peu plus (${LIMITS.bodyMin} caractères minimum)`);
    if (text.length > LIMITS.bodyMax) throw new BadRequestException(`Le texte est trop long (${LIMITS.bodyMax} caractères maximum)`);
    const category = isCategory(body?.category) ? body.category : 'OTHER';
    if (!isStaff(actor.role)) {
      const day = await this.prisma.suggestion.count({ where: { authorId: actor.userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
      if (day >= LIMITS.perDay) throw new ForbiddenException(`Tu as déjà proposé ${LIMITS.perDay} suggestions aujourd'hui : reviens demain, ou vote pour celles des autres`);
      const open = await this.prisma.suggestion.count({ where: { authorId: actor.userId, status: { in: ACTIVE_STATUSES } } });
      if (open >= LIMITS.openPerMember) throw new ForbiddenException(`Tu as déjà ${LIMITS.openPerMember} suggestions en cours : attends qu'elles avancent`);
    }
    const created = await this.prisma.suggestion.create({
      data: { title, body: text, category, authorId: actor.userId, voteCount: 1, votes: { create: { userId: actor.userId } } },
    });
    return this.get(actor.userId, created.id);
  }

  async update(actor: Actor, id: string, body: any) {
    const s = await this.prisma.suggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Suggestion introuvable');
    const staff = isStaff(actor.role);
    if (!staff && (s.authorId !== actor.userId || s.status !== 'OPEN')) throw new ForbiddenException('Tu ne peux modifier que ta suggestion tant qu\'elle est « proposée »');
    const data: Prisma.SuggestionUpdateInput = {};
    if (body?.title !== undefined) {
      const t = clean(body.title, LIMITS.titleMax);
      if (t.length < LIMITS.titleMin || t.length > LIMITS.titleMax) throw new BadRequestException(`Le titre doit faire entre ${LIMITS.titleMin} et ${LIMITS.titleMax} caractères`);
      data.title = t;
    }
    if (body?.body !== undefined) {
      const t = clean(body.body, LIMITS.bodyMax);
      if (t.length < LIMITS.bodyMin || t.length > LIMITS.bodyMax) throw new BadRequestException(`Le texte doit faire entre ${LIMITS.bodyMin} et ${LIMITS.bodyMax} caractères`);
      data.body = t;
    }
    if (body?.category !== undefined) { if (!isCategory(body.category)) throw new BadRequestException('Catégorie inconnue'); data.category = body.category; }
    await this.prisma.suggestion.update({ where: { id }, data });
    return this.get(actor.userId, id);
  }

  async remove(actor: Actor, id: string) {
    const s = await this.prisma.suggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Suggestion introuvable');
    if (!isStaff(actor.role)) {
      if (s.authorId !== actor.userId) throw new ForbiddenException('Tu ne peux pas supprimer cette suggestion');
      if (s.status !== 'OPEN' || s.voteCount > 1 || s.commentCount > 0) throw new ForbiddenException('Une suggestion qui a déjà des votes ou des commentaires ne peut plus être supprimée');
    }
    await this.prisma.suggestion.delete({ where: { id } });
    return { ok: true };
  }

  /** Voter ou retirer son vote. Au seuil, une suggestion « proposée » passe « à l'étude » et le staff est prévenu. */
  async toggleVote(actor: Actor, id: string) {
    const s = await this.prisma.suggestion.findUnique({ where: { id }, select: { id: true, status: true, title: true, authorId: true } });
    if (!s) throw new NotFoundException('Suggestion introuvable');
    if (!ACTIVE_STATUSES.includes(s.status as SuggestionStatus)) throw new BadRequestException('Les votes sont clos pour cette suggestion');
    const key = { suggestionId_userId: { suggestionId: id, userId: actor.userId } };
    const existing = await this.prisma.suggestionVote.findUnique({ where: key });
    let voted: boolean;
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.suggestionVote.delete({ where: key }),
        this.prisma.suggestion.update({ where: { id }, data: { voteCount: { decrement: 1 } } }),
      ]);
      voted = false;
    } else {
      try {
        await this.prisma.$transaction([
          this.prisma.suggestionVote.create({ data: { suggestionId: id, userId: actor.userId } }),
          this.prisma.suggestion.update({ where: { id }, data: { voteCount: { increment: 1 } } }),
        ]);
      } catch (e: any) {
        if (e?.code === 'P2002') return this.voteState(id, true); // double clic : le vote existe déjà
        throw e;
      }
      voted = true;
      await this.maybeEscalate(id, s.title, s.authorId);
    }
    return this.voteState(id, voted);
  }

  private async voteState(id: string, voted: boolean) {
    const s = await this.prisma.suggestion.findUnique({ where: { id }, select: { voteCount: true, status: true } });
    return { voted, voteCount: s?.voteCount ?? 0, status: s?.status ?? 'OPEN' };
  }

  private async maybeEscalate(id: string, title: string, authorId: string) {
    const threshold = await this.threshold();
    const moved = await this.prisma.suggestion.updateMany({
      where: { id, status: 'OPEN', voteCount: { gte: threshold } },
      data: { status: 'REVIEW', statusAt: new Date(), statusNote: `Plus de ${threshold - 1} membres la demandent : elle passe automatiquement à l'étude.` },
    });
    if (!moved.count) return;
    const link = `/suggestions/${id}`;
    const staff = await this.prisma.user.findMany({ where: { role: { in: STAFF as any }, status: 'ACTIVE', parentId: null }, select: { id: true } });
    const people = [...new Set([authorId, ...staff.map((u) => u.id)])];
    await this.prisma.notification.createMany({
      data: people.map((userId) => ({ userId, type: 'SYSTEM' as const, title: `💡 « ${title.slice(0, 80)} » a atteint ${threshold} votes`, body: 'Elle passe « à l\'étude » : à l\'équipe de la planifier ou de répondre.', link })),
    });
  }

  async addComment(actor: Actor, id: string, body: any) {
    const text = clean(body?.content, LIMITS.commentMax);
    if (text.length < LIMITS.commentMin) throw new BadRequestException('Commentaire vide');
    if (text.length > LIMITS.commentMax) throw new BadRequestException(`Commentaire trop long (${LIMITS.commentMax} caractères maximum)`);
    const s = await this.prisma.suggestion.findUnique({ where: { id }, select: { id: true, title: true, authorId: true } });
    if (!s) throw new NotFoundException('Suggestion introuvable');
    if (!isStaff(actor.role)) {
      const hour = await this.prisma.suggestionComment.count({ where: { userId: actor.userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
      if (hour >= LIMITS.commentsPerHour) throw new ForbiddenException('Trop de commentaires en peu de temps : patiente un peu');
    }
    const [c] = await this.prisma.$transaction([
      this.prisma.suggestionComment.create({ data: { suggestionId: id, userId: actor.userId, content: text, staff: isStaff(actor.role) }, include: { user: AUTHOR } }),
      this.prisma.suggestion.update({ where: { id }, data: { commentCount: { increment: 1 } } }),
    ]);
    if (s.authorId !== actor.userId) {
      await this.notifications.notify({ userId: s.authorId, type: 'SYSTEM', title: `💬 ${actor.username} a commenté ta suggestion`, body: s.title.slice(0, 120), link: `/suggestions/${id}` }).catch(() => undefined);
    }
    return { id: c.id, content: c.content, staff: c.staff, createdAt: c.createdAt, user: c.user };
  }

  async removeComment(actor: Actor, commentId: string) {
    const c = await this.prisma.suggestionComment.findUnique({ where: { id: commentId } });
    if (!c) throw new NotFoundException('Commentaire introuvable');
    if (c.userId !== actor.userId && !isStaff(actor.role)) throw new ForbiddenException('Tu ne peux pas supprimer ce commentaire');
    await this.prisma.$transaction([
      this.prisma.suggestionComment.delete({ where: { id: commentId } }),
      this.prisma.suggestion.update({ where: { id: c.suggestionId }, data: { commentCount: { decrement: 1 } } }),
    ]);
    return { ok: true };
  }

  // ------------------------------------------------------------------ équipe

  /** Le staff fait avancer une suggestion ; l'auteur et les votants sont prévenus. Un doublon transfère ses votes à la suggestion retenue. */
  async setStatus(actor: Actor, id: string, body: any) {
    if (!isStaff(actor.role)) throw new ForbiddenException('Réservé à l\'équipe');
    const s = await this.prisma.suggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Suggestion introuvable');
    const status = body?.status;
    if (!isStatus(status)) throw new BadRequestException('Statut inconnu');
    const note = clean(body?.note, LIMITS.noteMax) || null;
    if (note && note.length > LIMITS.noteMax) throw new BadRequestException(`Le message est trop long (${LIMITS.noteMax} caractères maximum)`);
    if (status === 'DECLINED' && !note) throw new BadRequestException('Explique en une phrase pourquoi elle est refusée : les membres qui ont voté seront prévenus');
    let duplicateOfId: string | null = null;
    if (status === 'DUPLICATE') {
      duplicateOfId = String(body?.duplicateOfId ?? '');
      if (!duplicateOfId || duplicateOfId === id) throw new BadRequestException('Indique la suggestion qui la remplace');
      const target = await this.prisma.suggestion.findUnique({ where: { id: duplicateOfId }, select: { id: true, status: true } });
      if (!target) throw new BadRequestException('La suggestion de remplacement est introuvable');
      if (target.status === 'DUPLICATE') throw new BadRequestException('Cette suggestion est elle-même un doublon : choisis celle qu\'elle remplace');
      await this.mergeVotes(id, duplicateOfId);
    }
    await this.prisma.suggestion.update({ where: { id }, data: { status, statusNote: note, statusAt: new Date(), statusById: actor.userId, duplicateOfId } });
    await this.notifyFollowers(s, status, note, actor.userId, duplicateOfId);
    return this.get(actor.userId, id);
  }

  /** Les votants d'un doublon votent aussi pour la suggestion retenue (sans double vote). */
  private async mergeVotes(fromId: string, toId: string) {
    const [from, to] = await Promise.all([
      this.prisma.suggestionVote.findMany({ where: { suggestionId: fromId }, select: { userId: true } }),
      this.prisma.suggestionVote.findMany({ where: { suggestionId: toId }, select: { userId: true } }),
    ]);
    const have = new Set(to.map((v) => v.userId));
    const add = from.filter((v) => !have.has(v.userId));
    if (add.length) await this.prisma.suggestionVote.createMany({ data: add.map((v) => ({ suggestionId: toId, userId: v.userId })), skipDuplicates: true });
    const total = await this.prisma.suggestionVote.count({ where: { suggestionId: toId } });
    await this.prisma.suggestion.update({ where: { id: toId }, data: { voteCount: total } });
    const target = await this.prisma.suggestion.findUnique({ where: { id: toId }, select: { title: true, authorId: true } });
    if (target) await this.maybeEscalate(toId, target.title, target.authorId);
  }

  private async notifyFollowers(s: { id: string; title: string; authorId: string; status: string }, status: string, note: string | null, actorId: string, duplicateOfId: string | null) {
    if (status === s.status && !note) return;
    const voters = await this.prisma.suggestionVote.findMany({ where: { suggestionId: s.id }, select: { userId: true }, take: 1000 });
    const people = [...new Set([s.authorId, ...voters.map((v) => v.userId)])].filter((id) => id !== actorId);
    if (!people.length) return;
    const link = `/suggestions/${duplicateOfId ?? s.id}`;
    const body = status === 'DUPLICATE' ? 'Ton vote a été transféré sur la suggestion qui la remplace.' : note ? (note.length > 300 ? note.slice(0, 300).trimEnd() + '…' : note) : undefined;
    await this.prisma.notification.createMany({
      data: people.map((userId) => ({ userId, type: 'SYSTEM' as const, title: `💡 « ${s.title.slice(0, 80)} » : ${statusLabel(status).toLowerCase()}`, body, link })),
    });
  }
}
