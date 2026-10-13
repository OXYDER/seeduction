import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { AccessCtx, FlatForum, ForumAccess, canRead, describeDenied, describeRule, isStaffRole, normalizeAccess, readBlocker, writeDenied } from '../common/utils/forum-access';

export interface Viewer { userId: string; role: string }

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const TOPICS_PER_PAGE = 20;
const POSTS_PER_PAGE = 15;
const UNREAD_WINDOW_MS = 30 * 86400_000; // au-delà, un sujet n'est plus signalé « non lu »

const isStaff = (viewer?: Viewer) => !!viewer && STAFF.includes(viewer.role);
import { SUGGESTED_FORUMS, SuggestedForum, planStructure } from './forum-suggested';

@Injectable()
export class ForumService implements OnModuleInit {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private badges: BadgesService) {}

  /**
   * Avant la distinction catégorie / forum, un forum principal pouvait avoir des
   * sous-forums : ceux qui en ont (et sans sujets propres) deviennent des catégories.
   */
  async onModuleInit() {
    await this.prisma.forumCategory.updateMany({
      where: { parentId: null, isCategory: false, children: { some: {} }, topics: { none: {} } },
      data: { isCategory: true },
    });
  }

  // ------------------------------------------------------------------ structure (administration)

  listCategories() {
    return this.prisma.forumCategory.findMany({
      where: { parentId: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        topics: { select: { id: true } },
        children: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          include: { topics: { select: { id: true } }, children: { orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { topics: { select: { id: true } } } } },
        },
      },
    });
  }

  /**
   * Règles : une catégorie est au premier niveau ; un forum est seul, dans une
   * catégorie, ou sous-forum d'un forum (trois niveaux au maximum).
   */
  private async assertPlacement(id: string | null, isCategory: boolean, parentId: string | null) {
    if (isCategory) {
      if (parentId) throw new BadRequestException('Une catégorie ne peut pas être placée dans une autre catégorie');
      return;
    }
    let parentIsForum = false;
    if (parentId) {
      if (parentId === id) throw new BadRequestException('Un forum ne peut pas être son propre parent');
      const parent = await this.prisma.forumCategory.findUnique({ where: { id: parentId }, include: { parent: true } });
      if (!parent) throw new BadRequestException('Parent introuvable');
      if (!parent.isCategory) {
        parentIsForum = true;
        if (parent.parent && !parent.parent.isCategory) throw new BadRequestException('Trois niveaux au maximum : catégorie › forum › sous-forum');
      }
    }
    if (id && parentIsForum) {
      const children = await this.prisma.forumCategory.count({ where: { parentId: id } });
      if (children > 0) throw new BadRequestException('Ce forum a déjà des sous-forums : il ne peut pas devenir lui-même un sous-forum');
    }
  }

  async createCategory(name: string, parentId?: string, isCategory = false, extra: ForumExtra = {}) {
    if (!name?.trim()) throw new BadRequestException('Nom requis');
    await this.assertPlacement(null, isCategory, parentId || null);
    const last = await this.prisma.forumCategory.aggregate({ where: { parentId: parentId || null }, _max: { position: true } });
    return this.prisma.forumCategory.create({
      data: {
        name: name.trim(), parentId: parentId || null, isCategory, position: (last._max.position ?? -1) + 1,
        description: extra.description?.trim() || null, icon: extra.icon?.trim() || null, staffOnly: !!extra.staffOnly, locked: !!extra.locked,
        archived: !!extra.archived, qa: !isCategory && !!extra.qa, rules: extra.rules?.trim() || null,
        access: (normalizeAccess(extra.access) ?? undefined) as any,
      },
    });
  }

  /** Ce que ferait « Appliquer la structure recommandée » (aperçu) : créé ou déjà présent, élément par élément. */
  async previewSuggested() {
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, parentId: true, name: true, isCategory: true } });
    return planStructure(all);
  }

  /** Ajoute la structure de forum recommandée (voir forum-suggested.ts) : ce qui existe déjà n'est pas recréé, rien n'est modifié. */
  async createSuggested() {
    const created: string[] = [];
    let skipped = 0;
    const addForum = async (f: SuggestedForum, parentId: string, path: string) => {
      let node = await this.prisma.forumCategory.findFirst({ where: { parentId, name: f.name } });
      if (node) skipped++;
      else { node = await this.createCategory(f.name, parentId, false, { description: f.description, icon: f.icon, locked: f.locked, qa: f.qa, rules: f.rules, access: f.access, staffOnly: f.staffOnly }); created.push(`${path} › ${f.name}`); }
      for (const sub of f.subforums ?? []) await addForum(sub, node.id, `${path} › ${f.name}`);
    };
    for (const cat of SUGGESTED_FORUMS) {
      let parent = await this.prisma.forumCategory.findFirst({ where: { parentId: null, isCategory: true, name: cat.name } });
      if (!parent) { parent = await this.createCategory(cat.name, undefined, true, { description: cat.description, icon: cat.icon, access: cat.access, staffOnly: cat.staffOnly }); created.push(cat.name); } else skipped++;
      for (const f of cat.forums) await addForum(f, parent.id, cat.name);
    }
    return { created, skipped };
  }

  async updateCategory(id: string, data: ForumExtra & { name?: string; parentId?: string | null; isCategory?: boolean; position?: number; description?: string | null; icon?: string | null; rules?: string | null }) {
    const current = await this.prisma.forumCategory.findUnique({ where: { id } });
    if (!current) throw new BadRequestException('Introuvable');
    const payload: any = {};
    if (data.name !== undefined && data.name.trim()) payload.name = data.name.trim();
    if (data.description !== undefined) payload.description = data.description?.trim() || null;
    if (data.icon !== undefined) payload.icon = data.icon?.trim() || null;
    if (data.rules !== undefined) payload.rules = data.rules?.trim() || null;
    if (typeof data.staffOnly === 'boolean') payload.staffOnly = data.staffOnly;
    if (typeof data.locked === 'boolean') payload.locked = data.locked;
    if (typeof data.qa === 'boolean') payload.qa = data.qa;
    if (data.access !== undefined) payload.access = (normalizeAccess(data.access) ?? Prisma.DbNull) as any;
    if (typeof data.position === 'number') payload.position = data.position;
    if (typeof data.archived === 'boolean') {
      // L'archivage s'applique aussi à tout ce que le forum contient.
      const ids = [id, ...(await this.descendantIds(id))];
      await this.prisma.forumCategory.updateMany({ where: { id: { in: ids } }, data: { archived: data.archived } });
      payload.archived = data.archived;
    }

    const isCategory = data.isCategory ?? current.isCategory;
    const parentId = data.parentId !== undefined ? data.parentId || null : current.parentId;
    if (isCategory && !current.isCategory) {
      const topics = await this.prisma.forumTopic.count({ where: { categoryId: id } });
      if (topics > 0) throw new BadRequestException(`Impossible : ce forum contient ${topics} sujet(s) — une catégorie ne peut pas en avoir`);
    }
    await this.assertPlacement(id, isCategory, parentId);
    payload.isCategory = isCategory;
    payload.parentId = parentId;
    if (isCategory) payload.qa = false;
    return this.prisma.forumCategory.update({ where: { id }, data: payload });
  }

  /** Tout ce qui est sous un forum (sous-forums), de proche en proche. */
  private async descendantIds(id: string): Promise<string[]> {
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, parentId: true } });
    const out: string[] = [];
    const walk = (pid: string) => { for (const c of all) if (c.parentId === pid) { out.push(c.id); walk(c.id); } };
    walk(id);
    return out;
  }

  /** Monte ou descend un forum parmi ses voisins (même parent). */
  async move(id: string, direction: 'up' | 'down') {
    const current = await this.prisma.forumCategory.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Introuvable');
    const siblings = await this.prisma.forumCategory.findMany({ where: { parentId: current.parentId }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
    const index = siblings.findIndex((s) => s.id === id);
    const swapWith = siblings[direction === 'up' ? index - 1 : index + 1];
    if (!swapWith) return { moved: false };
    const ordered = siblings.map((s) => s.id);
    [ordered[index], ordered[ordered.indexOf(swapWith.id)]] = [swapWith.id, id];
    await this.prisma.$transaction(ordered.map((sid, position) => this.prisma.forumCategory.update({ where: { id: sid }, data: { position } })));
    return { moved: true };
  }

  /**
   * Supprime un forum ou une catégorie. S'il y a du contenu, il faut dire où l'envoyer (`moveTo`) : pour un forum, ses sujets passent dans le forum de destination ;
   * pour une catégorie, ses forums passent dans la catégorie de destination (« root » = au premier niveau, sans catégorie). Rien n'est jamais perdu en silence.
   */
  async deleteCategory(id: string, moveTo?: string) {
    const item = await this.prisma.forumCategory.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Introuvable');
    const [topics, children] = await Promise.all([
      this.prisma.forumTopic.count({ where: { categoryId: id } }),
      this.prisma.forumCategory.count({ where: { parentId: id } }),
    ]);
    if (item.isCategory && children > 0) {
      if (!moveTo) throw new BadRequestException(`Cette catégorie contient ${children} forum(s) : choisis où les envoyer (ou déplace-les d'abord).`);
      if (moveTo !== 'root') {
        const target = await this.prisma.forumCategory.findUnique({ where: { id: moveTo } });
        if (!target || !target.isCategory || target.id === id) throw new BadRequestException('Choisis une autre catégorie comme destination');
      }
      await this.prisma.forumCategory.updateMany({ where: { parentId: id }, data: { parentId: moveTo === 'root' ? null : moveTo } });
    } else if (!item.isCategory) {
      if (children > 0) throw new BadRequestException(`Ce forum contient ${children} sous-forum(s) : déplace-les ou fusionne ce forum dans un autre.`);
      if (topics > 0) {
        if (!moveTo) throw new BadRequestException(`Ce forum contient ${topics} sujet(s) : choisis le forum où les envoyer.`);
        await this.assertForumTarget(id, moveTo);
        await this.prisma.forumTopic.updateMany({ where: { categoryId: id }, data: { categoryId: moveTo } });
      }
    }
    await this.prisma.forumCategory.delete({ where: { id } });
    return { name: item.name, movedTopics: item.isCategory ? 0 : topics, movedForums: item.isCategory ? children : 0 };
  }

  /** Vérifie qu'un forum peut recevoir des sujets venant de `sourceId` (un vrai forum, différent, qui n'est pas dans la source). */
  private async assertForumTarget(sourceId: string, targetId: string) {
    const target = await this.prisma.forumCategory.findUnique({ where: { id: targetId } });
    if (!target || target.isCategory) throw new BadRequestException('Choisis un forum (pas une catégorie) comme destination');
    if (target.id === sourceId) throw new BadRequestException('La destination doit être un autre forum');
    if ((await this.descendantIds(sourceId)).includes(targetId)) throw new BadRequestException('La destination ne peut pas être un sous-forum de la source');
    return target;
  }

  /** Déplace tous les sujets d'un forum vers un autre (le forum d'origine reste en place, vide). */
  async moveTopics(sourceId: string, targetId: string) {
    const source = await this.prisma.forumCategory.findUnique({ where: { id: sourceId } });
    if (!source || source.isCategory) throw new BadRequestException('Source invalide');
    await this.assertForumTarget(sourceId, targetId);
    const r = await this.prisma.forumTopic.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } });
    return { moved: r.count, from: source.name };
  }

  /** Fusionne un forum dans un autre : ses sujets (et ses sous-forums, si la destination peut en recevoir) passent dans la destination, puis il est supprimé. */
  async merge(sourceId: string, targetId: string) {
    const source = await this.prisma.forumCategory.findUnique({ where: { id: sourceId } });
    if (!source || source.isCategory) throw new BadRequestException('Seuls des forums peuvent être fusionnés');
    const target = await this.assertForumTarget(sourceId, targetId);
    const children = await this.prisma.forumCategory.findMany({ where: { parentId: sourceId } });
    if (children.length > 0) {
      const targetParent = target.parentId ? await this.prisma.forumCategory.findUnique({ where: { id: target.parentId } }) : null;
      if (targetParent && !targetParent.isCategory) throw new BadRequestException('La destination est déjà un sous-forum : elle ne peut pas recevoir les sous-forums de la source. Déplace-les d\'abord.');
      await this.prisma.forumCategory.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } });
    }
    const topics = await this.prisma.forumTopic.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } });
    await this.prisma.forumCategory.delete({ where: { id: sourceId } });
    return { merged: source.name, into: target.name, topics: topics.count, subforums: children.length };
  }

  /** Glisser-déposer : place un élément sous un parent (ou au premier niveau), à une position précise parmi ses nouveaux voisins. */
  async place(id: string, parentId: string | null, index: number) {
    const current = await this.prisma.forumCategory.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Introuvable');
    await this.assertPlacement(id, current.isCategory, parentId);
    if (parentId && (await this.descendantIds(id)).includes(parentId)) throw new BadRequestException('Un élément ne peut pas être placé dans ce qu\'il contient');
    const siblings = await this.prisma.forumCategory.findMany({ where: { parentId, id: { not: id } }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true } });
    const order = siblings.map((x) => x.id);
    order.splice(Math.max(0, Math.min(order.length, Number.isFinite(index) ? index : order.length)), 0, id);
    await this.prisma.$transaction(order.map((sid, position) => this.prisma.forumCategory.update({ where: { id: sid }, data: sid === id ? { parentId, position } : { position } })));
    return { placed: true };
  }

  /** Arbre complet pour l'administration : tous les niveaux, avec réglages, compteurs et ce qui est restreint. */
  async adminTree() {
    const [all, topicCounts, postCounts] = await Promise.all([
      this.prisma.forumCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.forumTopic.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.$queryRaw<{ categoryId: string; n: bigint }[]>`SELECT t."categoryId", COUNT(p.id) AS n FROM "ForumPost" p JOIN "ForumTopic" t ON t.id = p."topicId" GROUP BY t."categoryId"`,
    ]);
    const tc = new Map(topicCounts.map((t) => [t.categoryId, t._count._all]));
    const pc = new Map(postCounts.map((p) => [p.categoryId, Number(p.n)]));
    const build = (parentId: string | null): any[] => all.filter((x) => x.parentId === parentId).map((x) => {
      const kids = build(x.id);
      const access = normalizeAccess(x.access);
      return {
        id: x.id, name: x.name, description: x.description, icon: x.icon, rules: x.rules, isCategory: x.isCategory, parentId: x.parentId, position: x.position,
        staffOnly: x.staffOnly, locked: x.locked, archived: x.archived, qa: x.qa, access,
        readLabel: x.staffOnly ? "l'équipe" : describeRule(access?.read), writeLabel: describeRule(access?.write),
        topics: tc.get(x.id) ?? 0, posts: pc.get(x.id) ?? 0,
        totalTopics: (tc.get(x.id) ?? 0) + kids.reduce((n, k) => n + k.totalTopics, 0), totalPosts: (pc.get(x.id) ?? 0) + kids.reduce((n, k) => n + k.totalPosts, 0),
        children: kids,
      };
    });
    return build(null);
  }

  // ------------------------------------------------------------------ accès

  /** Ce qu'il faut savoir du visiteur pour appliquer les accès par rang (rang et statut donateur viennent du compte principal pour un profil famille). */
  private async ctxOf(viewer?: Viewer): Promise<AccessCtx | null> {
    if (!viewer) return null;
    const u = await this.prisma.user.findUnique({
      where: { id: viewer.userId },
      select: { memberClass: true, donorSince: true, showAdult: true, parent: { select: { memberClass: true, donorSince: true } } },
    });
    const main = u?.parent ?? u;
    return { role: viewer.role, memberClass: main?.memberClass ?? 'NOUVEAU', donor: !!main?.donorSince, adult: !!u?.showAdult };
  }

  private async flatForums(): Promise<Map<string, FlatForum>> {
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, parentId: true, isCategory: true, staffOnly: true, locked: true, archived: true, access: true } });
    return new Map(all.map((c) => [c.id, c]));
  }

  /** Identifiants des forums que ce visiteur n'a pas le droit de voir (réservés à un rang, aux donateurs, au 18+ ou à l'équipe, et tout ce qu'ils contiennent). */
  private async hiddenForumIds(viewer?: Viewer): Promise<string[]> {
    if (isStaff(viewer)) return [];
    const [byId, ctx] = await Promise.all([this.flatForums(), this.ctxOf(viewer)]);
    return [...byId.keys()].filter((id) => !canRead(id, byId, ctx));
  }

  private async assertCanSee(forumId: string, viewer?: Viewer) {
    if (isStaff(viewer)) return;
    const [byId, ctx] = await Promise.all([this.flatForums(), this.ctxOf(viewer)]);
    const blocker = readBlocker(forumId, byId, ctx);
    if (blocker) throw new ForbiddenException(blocker.type === 'STAFF' ? 'Ce forum est réservé au staff' : `Ce forum est réservé à ${describeRule(blocker)}.`);
  }

  /** Peut-il publier ici ? (rang, verrou, archive...) Sinon, refus avec la raison en clair. */
  private async assertCanWrite(forumId: string, viewer: Viewer) {
    const [byId, ctx] = await Promise.all([this.flatForums(), this.ctxOf(viewer)]);
    const denied = writeDenied(forumId, byId, ctx);
    if (denied) throw new ForbiddenException(describeDenied(denied));
  }

  private async ancestors(forumId: string) {
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, name: true, parentId: true, isCategory: true } });
    const byId = new Map(all.map((c) => [c.id, c]));
    const chain: { id: string; name: string; isCategory: boolean }[] = [];
    for (let cur = byId.get(forumId); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      chain.unshift({ id: cur.id, name: cur.name, isCategory: cur.isCategory });
    }
    return chain;
  }

  private async readMap(viewer?: Viewer) {
    if (!viewer) return new Map<string, Date>();
    const reads = await this.prisma.forumTopicRead.findMany({ where: { userId: viewer.userId }, select: { topicId: true, readAt: true } });
    return new Map(reads.map((r) => [r.topicId, r.readAt]));
  }

  // ------------------------------------------------------------------ index & forums

  /** Statistiques par forum (sujets, messages, dernier message, non-lu), sous-forums inclus, comme phpBB. */
  private async forumStats(viewer?: Viewer) {
    const [topicCounts, postCounts, lastPosts, recentTopics, reads] = await Promise.all([
      this.prisma.forumTopic.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.$queryRaw<{ categoryId: string; n: bigint }[]>`
        SELECT t."categoryId", COUNT(p.id) AS n FROM "ForumPost" p JOIN "ForumTopic" t ON t.id = p."topicId" GROUP BY t."categoryId"`,
      this.prisma.$queryRaw<{ categoryId: string; postId: string; createdAt: Date; authorId: string; topicId: string; title: string }[]>`
        SELECT DISTINCT ON (t."categoryId") t."categoryId", p.id AS "postId", p."createdAt", p."authorId", t.id AS "topicId", t.title
        FROM "ForumPost" p JOIN "ForumTopic" t ON t.id = p."topicId" ORDER BY t."categoryId", p."createdAt" DESC`,
      this.prisma.forumTopic.findMany({
        where: { lastPostAt: { gt: new Date(Date.now() - UNREAD_WINDOW_MS) } },
        select: { id: true, categoryId: true, lastPostAt: true },
      }),
      this.readMap(viewer),
    ]);
    const authors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(lastPosts.map((l) => l.authorId))] } }, select: { id: true, username: true } });
    const authorById = new Map(authors.map((a) => [a.id, a]));

    const own = new Map<string, { topics: number; posts: number; lastPost: any; unread: boolean; unreadCount: number }>();
    const get = (id: string) => {
      if (!own.has(id)) own.set(id, { topics: 0, posts: 0, lastPost: null, unread: false, unreadCount: 0 });
      return own.get(id)!;
    };
    topicCounts.forEach((t) => (get(t.categoryId).topics = t._count._all));
    postCounts.forEach((p) => (get(p.categoryId).posts = Number(p.n)));
    lastPosts.forEach((l) => (get(l.categoryId).lastPost = {
      postId: l.postId, createdAt: l.createdAt, topicId: l.topicId, topicTitle: l.title, author: authorById.get(l.authorId) ?? null,
    }));
    if (viewer) {
      for (const t of recentTopics) {
        const readAt = reads.get(t.id);
        if (!readAt || readAt < t.lastPostAt) { const g = get(t.categoryId); g.unread = true; g.unreadCount++; }
      }
    }
    return own;
  }

  private buildNode(forum: any, byParent: Map<string | null, any[]>, own: Map<string, any>, hidden: Set<string>): any {
    const children = (byParent.get(forum.id) ?? []).filter((c) => !hidden.has(c.id));
    const nodes = children.map((c) => this.buildNode(c, byParent, own, hidden));
    const mine = own.get(forum.id) ?? { topics: 0, posts: 0, lastPost: null, unread: false, unreadCount: 0 };
    let lastPost = mine.lastPost;
    let unread = mine.unread;
    let unreadCount = mine.unreadCount;
    let topics = mine.topics;
    let posts = mine.posts;
    for (const n of nodes) {
      topics += n.topics;
      posts += n.posts;
      unread = unread || n.unread;
      unreadCount += n.unreadCount;
      if (n.lastPost && (!lastPost || new Date(n.lastPost.createdAt) > new Date(lastPost.createdAt))) lastPost = n.lastPost;
    }
    const access = normalizeAccess(forum.access);
    return {
      id: forum.id, name: forum.name, description: forum.description, icon: forum.icon, isCategory: forum.isCategory,
      staffOnly: forum.staffOnly, locked: forum.locked, archived: forum.archived, qa: forum.qa,
      readLabel: forum.staffOnly ? "l'équipe" : describeRule(access?.read), writeLabel: describeRule(access?.write),
      topics, posts, lastPost, unread, unreadCount,
      subforums: nodes,
    };
  }

  private async tree(viewer?: Viewer) {
    const [all, own, hiddenIds] = await Promise.all([
      this.prisma.forumCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.forumStats(viewer),
      this.hiddenForumIds(viewer),
    ]);
    const byParent = new Map<string | null, any[]>();
    for (const c of all) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    const hidden = new Set(hiddenIds);
    return {
      all,
      roots: (byParent.get(null) ?? []).filter((c) => !hidden.has(c.id)).map((c) => this.buildNode(c, byParent, own, hidden)),
    };
  }

  /** Page d'accueil du forum : catégories › forums (avec leurs sous-forums, compteurs et dernier message) + statistiques globales. */
  async index(viewer?: Viewer) {
    const [{ roots }, topics, posts, members, newest] = await Promise.all([
      this.tree(viewer),
      this.prisma.forumTopic.count(),
      this.prisma.forumPost.count(),
      this.prisma.user.count({ where: { profileType: { not: 'BOT' } } }),
      this.prisma.user.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, username: true } }),
    ]);
    return { roots, stats: { topics, posts, members, newestMember: newest } };
  }

  /** Un forum : sous-forums + liste paginée des sujets (épinglés d'abord). `filter` : « unsolved » (entraide) ou « unread ». */
  async forumView(id: string, page: number, viewer?: Viewer, filter?: string) {
    await this.assertCanSee(id, viewer);
    const { roots } = await this.tree(viewer);
    const find = (nodes: any[]): any => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const sub = find(n.subforums);
        if (sub) return sub;
      }
      return null;
    };
    const node = find(roots);
    if (!node) throw new NotFoundException('Forum introuvable');

    const safePage = Math.max(1, page || 1);
    const reads = await this.readMap(viewer);
    const where: any = { categoryId: id };
    if (filter === 'unsolved') where.solvedPostId = null;
    if (filter === 'unread' && viewer) {
      where.lastPostAt = { gt: new Date(Date.now() - UNREAD_WINDOW_MS) };
      const recent = await this.prisma.forumTopic.findMany({ where, select: { id: true, lastPostAt: true } });
      const unreadIds = recent.filter((t) => { const r = reads.get(t.id); return !r || r < t.lastPostAt; }).map((t) => t.id);
      delete where.lastPostAt; where.id = { in: unreadIds.length ? unreadIds : ['-'] };
    }
    const [breadcrumb, total, topics, forumRow, byId, ctx] = await Promise.all([
      this.ancestors(id),
      this.prisma.forumTopic.count({ where }),
      this.prisma.forumTopic.findMany({
        where,
        orderBy: [{ sticky: 'desc' }, { lastPostAt: 'desc' }],
        skip: (safePage - 1) * TOPICS_PER_PAGE,
        take: TOPICS_PER_PAGE,
        include: {
          author: { select: { id: true, username: true } },
          _count: { select: { posts: true } },
          posts: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, createdAt: true, author: { select: { id: true, username: true } } } },
        },
      }),
      this.prisma.forumCategory.findUnique({ where: { id }, select: { rules: true } }),
      this.flatForums(),
      this.ctxOf(viewer),
    ]);
    const denied = writeDenied(id, byId, ctx);

    return {
      forum: node,
      rules: forumRow?.rules ?? null,
      breadcrumb,
      canPost: !denied,
      postBlockedReason: denied && denied.reason !== 'CATEGORY' ? describeDenied(denied) : null,
      filter: filter ?? null,
      page: safePage,
      pageSize: TOPICS_PER_PAGE,
      total,
      topics: topics.map(({ posts, _count, ...t }) => {
        const readAt = reads.get(t.id);
        return {
          ...t,
          solved: !!t.solvedPostId,
          replies: Math.max(0, _count.posts - 1),
          lastPost: posts[0] ?? null,
          unread: !!viewer && t.lastPostAt > new Date(Date.now() - UNREAD_WINDOW_MS) && (!readAt || readAt < t.lastPostAt),
        };
      }),
    };
  }

  // ------------------------------------------------------------------ sujets

  private async loadTopic(topicId: string) {
    const topic = await this.prisma.forumTopic.findUnique({ where: { id: topicId }, include: { category: true } });
    if (!topic) throw new NotFoundException('Sujet introuvable');
    return topic;
  }

  async createTopic(categoryId: string, authorId: string, role: string, title: string, firstPostContent: string) {
    const forum = await this.prisma.forumCategory.findUnique({ where: { id: categoryId } });
    if (!forum) throw new BadRequestException('Forum introuvable');
    if (forum.isCategory) throw new BadRequestException('Cette catégorie ne contient pas de sujets : choisis un de ses forums');
    await this.assertCanWrite(categoryId, { userId: authorId, role });
    if (!title?.trim() || !firstPostContent?.trim()) throw new BadRequestException('Titre et message requis');

    const topic = await this.prisma.forumTopic.create({
      data: {
        categoryId, authorId, title: title.trim().slice(0, 200),
        posts: { create: { authorId, content: firstPostContent } },
      },
      include: { posts: true },
    });
    await this.prisma.forumTopicRead.upsert({
      where: { userId_topicId: { userId: authorId, topicId: topic.id } },
      update: { readAt: new Date() },
      create: { userId: authorId, topicId: topic.id },
    });
    await this.badges.checkAndAward(authorId);
    const who = await this.prisma.user.findUnique({ where: { id: authorId }, select: { username: true } });
    await this.notifications.notifyMentions({
      text: `${title} ${firstPostContent}`, authorId, authorName: who?.username ?? 'Un membre', link: `/forum/topics/${topic.id}`, where: `dans le sujet « ${title.trim().slice(0, 80)} »`,
      canSee: (u) => !forum.staffOnly || STAFF.includes(u.role),
    }).catch(() => undefined);
    return topic;
  }

  private async postAuthorInfo(authorIds: string[]) {
    const [users, counts] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, username: true, role: true, memberClass: true, avatarUrl: true, signature: true, createdAt: true } }),
      this.prisma.forumPost.groupBy({ by: ['authorId'], where: { authorId: { in: authorIds } }, _count: { _all: true } }),
    ]);
    const countById = new Map(counts.map((c) => [c.authorId, c._count._all]));
    return new Map(users.map((u) => [u.id, { ...u, postCount: countById.get(u.id) ?? 0 }]));
  }

  async getTopic(topicId: string, page: number, viewer?: Viewer) {
    const topic = await this.loadTopic(topicId);
    await this.assertCanSee(topic.categoryId, viewer);
    const safePage = Math.max(1, page || 1);

    const [total, posts, breadcrumb] = await Promise.all([
      this.prisma.forumPost.count({ where: { topicId } }),
      this.prisma.forumPost.findMany({ where: { topicId }, orderBy: { createdAt: 'asc' }, skip: (safePage - 1) * POSTS_PER_PAGE, take: POSTS_PER_PAGE }),
      this.ancestors(topic.categoryId),
    ]);
    const authors = await this.postAuthorInfo([...new Set(posts.map((p) => p.authorId))]);
    const following = viewer ? !!(await this.prisma.forumTopicFollow.findUnique({ where: { userId_topicId: { userId: viewer.userId, topicId } } })) : false;

    await this.prisma.forumTopic.update({ where: { id: topicId }, data: { viewCount: { increment: 1 } } });
    const lastPostOnPage = posts[posts.length - 1];
    if (viewer && lastPostOnPage && safePage * POSTS_PER_PAGE >= total) {
      await this.prisma.forumTopicRead.upsert({
        where: { userId_topicId: { userId: viewer.userId, topicId } },
        update: { readAt: new Date() },
        create: { userId: viewer.userId, topicId },
      });
    }

    return {
      topic: {
        id: topic.id, title: topic.title, locked: topic.locked, sticky: topic.sticky, viewCount: topic.viewCount + 1,
        authorId: topic.authorId, createdAt: topic.createdAt, solvedPostId: topic.solvedPostId, following,
        forum: { id: topic.category.id, name: topic.category.name, locked: topic.category.locked, qa: topic.category.qa },
      },
      breadcrumb,
      page: safePage,
      pageSize: POSTS_PER_PAGE,
      total,
      posts: posts.map((p, i) => ({ ...p, number: (safePage - 1) * POSTS_PER_PAGE + i + 1, author: authors.get(p.authorId) ?? null })),
      canReply: !!viewer && (!topic.locked || isStaff(viewer)) && (await this.canWriteIn(topic.categoryId, viewer)),
      canMarkSolved: !!viewer && topic.category.qa && (viewer.userId === topic.authorId || isStaff(viewer)),
    };
  }

  async reply(topicId: string, authorId: string, role: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('Message vide');
    const topic = await this.loadTopic(topicId);
    await this.assertCanWrite(topic.categoryId, { userId: authorId, role });
    if (topic.locked && !STAFF.includes(role)) throw new ForbiddenException('Ce sujet est verrouillé');

    const post = await this.prisma.forumPost.create({ data: { topicId, authorId, content } });
    await this.prisma.forumTopic.update({ where: { id: topicId }, data: { lastPostAt: post.createdAt } });
    await this.prisma.forumTopicRead.upsert({
      where: { userId_topicId: { userId: authorId, topicId } },
      update: { readAt: new Date() },
      create: { userId: authorId, topicId },
    });
    {
      const [who, cat] = await Promise.all([this.prisma.user.findUnique({ where: { id: authorId }, select: { username: true } }), this.prisma.forumCategory.findUnique({ where: { id: topic.categoryId }, select: { staffOnly: true } })]);
      await this.notifications.notifyMentions({
        text: content, authorId, authorName: who?.username ?? 'Un membre', link: `/forum/topics/${topicId}`, where: `dans le sujet « ${topic.title.slice(0, 80)} »`,
        skip: [topic.authorId], canSee: (u) => !cat?.staffOnly || STAFF.includes(u.role),
      }).catch(() => undefined);
    }
    if (topic.authorId !== authorId) {
      await this.notifications.notify({
        userId: topic.authorId,
        type: 'FORUM_REPLY',
        title: 'Nouvelle réponse à ton sujet',
        titleMany: '{n} nouvelles réponses à ton sujet',
        groupKey: `forum:${topicId}`,
        body: topic.title,
        link: `/forum/topics/${topicId}`,
      });
    }
    // Les membres qui suivent le sujet (🔔) sont prévenus aussi, sauf l'auteur du message et l'auteur du sujet (déjà prévenu ci-dessus).
    {
      const followers = await this.prisma.forumTopicFollow.findMany({ where: { topicId, userId: { notIn: [authorId, topic.authorId] } }, select: { userId: true, user: { select: { role: true } } } });
      for (const f of followers) {
        // Un membre qui n'a (plus) le droit de lire ce forum ne reçoit rien.
        if ((await this.hiddenForumIds({ userId: f.userId, role: f.user.role })).includes(topic.categoryId)) continue;
        await this.notifications.notify({
          userId: f.userId, type: 'FORUM_REPLY', title: 'Nouvelle réponse dans un sujet que tu suis', titleMany: '{n} nouvelles réponses dans un sujet que tu suis',
          groupKey: `forum:${topicId}`, body: topic.title, link: `/forum/topics/${topicId}`,
        }).catch(() => undefined);
      }
    }
    await this.badges.checkAndAward(authorId);
    const count = await this.prisma.forumPost.count({ where: { topicId } });
    return { ...post, page: Math.ceil(count / POSTS_PER_PAGE) };
  }

  async editPost(postId: string, viewer: Viewer, content: string) {
    if (!content?.trim()) throw new BadRequestException('Message vide');
    const post = await this.prisma.forumPost.findUnique({ where: { id: postId }, include: { topic: true } });
    if (!post) throw new NotFoundException('Message introuvable');
    if (post.authorId !== viewer.userId && !STAFF.includes(viewer.role)) throw new ForbiddenException('Tu ne peux modifier que tes propres messages');
    if (post.topic.locked && !STAFF.includes(viewer.role)) throw new ForbiddenException('Ce sujet est verrouillé');
    return this.prisma.forumPost.update({ where: { id: postId }, data: { content, editedAt: new Date() } });
  }

  async deletePost(postId: string, viewer: Viewer) {
    const post = await this.prisma.forumPost.findUnique({ where: { id: postId }, include: { topic: true } });
    if (!post) throw new NotFoundException('Message introuvable');
    const staff = STAFF.includes(viewer.role);
    if (post.authorId !== viewer.userId && !staff) throw new ForbiddenException('Tu ne peux supprimer que tes propres messages');
    const first = await this.prisma.forumPost.findFirst({ where: { topicId: post.topicId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (first?.id === postId) {
      if (!staff) throw new ForbiddenException('Seul le staff peut supprimer le premier message (donc le sujet entier)');
      await this.prisma.forumTopic.delete({ where: { id: post.topicId } });
      return { topicDeleted: true, forumId: post.topic.categoryId };
    }
    if (post.topic.locked && !staff) throw new ForbiddenException('Ce sujet est verrouillé');
    await this.prisma.forumPost.delete({ where: { id: postId } });
    if (post.topic.solvedPostId === postId) await this.prisma.forumTopic.update({ where: { id: post.topicId }, data: { solvedPostId: null } });
    const last = await this.prisma.forumPost.findFirst({ where: { topicId: post.topicId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (last) await this.prisma.forumTopic.update({ where: { id: post.topicId }, data: { lastPostAt: last.createdAt } });
    return { topicDeleted: false };
  }

  async moderateTopic(topicId: string, action: string, forumId?: string) {
    const topic = await this.loadTopic(topicId);
    switch (action) {
      case 'lock': return this.prisma.forumTopic.update({ where: { id: topicId }, data: { locked: true } });
      case 'unlock': return this.prisma.forumTopic.update({ where: { id: topicId }, data: { locked: false } });
      case 'sticky': return this.prisma.forumTopic.update({ where: { id: topicId }, data: { sticky: true } });
      case 'unsticky': return this.prisma.forumTopic.update({ where: { id: topicId }, data: { sticky: false } });
      case 'move': {
        const target = forumId ? await this.prisma.forumCategory.findUnique({ where: { id: forumId } }) : null;
        if (!target || target.isCategory) throw new BadRequestException('Choisis un forum de destination');
        return this.prisma.forumTopic.update({ where: { id: topic.id }, data: { categoryId: target.id } });
      }
      default: throw new BadRequestException('Action inconnue');
    }
  }

  async deleteTopic(topicId: string) {
    const topic = await this.loadTopic(topicId);
    await this.prisma.forumTopic.delete({ where: { id: topicId } });
    return { forumId: topic.categoryId, title: topic.title };
  }

  /** Liste plate de tous les forums (où on peut écrire) — pour déplacer un sujet. */
  async movableForums() {
    const all = await this.prisma.forumCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
    const byId = new Map(all.map((c) => [c.id, c]));
    const path = (c: any): string => (c.parentId ? `${path(byId.get(c.parentId))} › ${c.name}` : c.name);
    return all.filter((c) => !c.isCategory).map((c) => ({ id: c.id, name: path(c) }));
  }

  // ------------------------------------------------------------------ dernier messages & recherche

  async latest(viewer?: Viewer, unreadOnly = false) {
    const hidden = await this.hiddenForumIds(viewer);
    const reads = await this.readMap(viewer);
    const topics = await this.prisma.forumTopic.findMany({
      where: hidden.length ? { categoryId: { notIn: hidden } } : undefined,
      orderBy: { lastPostAt: 'desc' },
      take: unreadOnly ? 200 : 30,
      include: {
        category: { select: { id: true, name: true } },
        author: { select: { id: true, username: true } },
        _count: { select: { posts: true } },
        posts: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, author: { select: { id: true, username: true } } } },
      },
    });
    const rows = topics.map(({ posts, _count, ...t }) => {
      const readAt = reads.get(t.id);
      return { ...t, solved: !!t.solvedPostId, replies: Math.max(0, _count.posts - 1), lastPost: posts[0] ?? null, unread: !!viewer && (!readAt || readAt < t.lastPostAt) && t.lastPostAt > new Date(Date.now() - UNREAD_WINDOW_MS) };
    });
    return unreadOnly ? rows.filter((r) => r.unread) : rows;
  }

  async search(q: string, viewer?: Viewer) {
    const term = q?.trim();
    if (!term || term.length < 2) throw new BadRequestException('Saisis au moins 2 caractères');
    const hidden = await this.hiddenForumIds(viewer);
    const forumFilter = hidden.length ? { categoryId: { notIn: hidden } } : {};
    const [byTitle, byContent] = await Promise.all([
      this.prisma.forumTopic.findMany({ where: { ...forumFilter, title: { contains: term, mode: 'insensitive' } }, take: 30, orderBy: { lastPostAt: 'desc' }, select: { id: true } }),
      this.prisma.forumPost.findMany({ where: { content: { contains: term, mode: 'insensitive' }, topic: forumFilter }, take: 60, orderBy: { createdAt: 'desc' }, select: { topicId: true } }),
    ]);
    const ids = [...new Set([...byTitle.map((t) => t.id), ...byContent.map((p) => p.topicId)])].slice(0, 40);
    const topics = await this.prisma.forumTopic.findMany({
      where: { id: { in: ids } },
      orderBy: { lastPostAt: 'desc' },
      include: { category: { select: { id: true, name: true } }, author: { select: { id: true, username: true } }, _count: { select: { posts: true } } },
    });
    return topics.map(({ _count, ...t }) => ({ ...t, replies: Math.max(0, _count.posts - 1) }));
  }

  /** Marque tout le forum comme lu. */
  async markAllRead(userId: string) {
    const topics = await this.prisma.forumTopic.findMany({ where: { lastPostAt: { gt: new Date(Date.now() - UNREAD_WINDOW_MS) } }, select: { id: true } });
    const now = new Date();
    await this.prisma.$transaction(topics.map((t) => this.prisma.forumTopicRead.upsert({
      where: { userId_topicId: { userId, topicId: t.id } }, update: { readAt: now }, create: { userId, topicId: t.id },
    })));
    return { marked: topics.length };
  }

  // ------------------------------------------------------------------ « Résolu », suivi, non lus

  private async canWriteIn(forumId: string, viewer: Viewer) {
    const [byId, ctx] = await Promise.all([this.flatForums(), this.ctxOf(viewer)]);
    return !writeDenied(forumId, byId, ctx);
  }

  /** Marque (ou retire) la réponse qui règle le problème, dans un forum d'entraide : l'auteur du sujet ou l'équipe. */
  async markSolved(topicId: string, postId: string | null, viewer: Viewer) {
    const topic = await this.loadTopic(topicId);
    if (!topic.category.qa) throw new BadRequestException("Ce forum n'est pas un forum d'entraide");
    if (viewer.userId !== topic.authorId && !STAFF.includes(viewer.role)) throw new ForbiddenException("Seul l'auteur du sujet ou l'équipe peut marquer la solution");
    if (postId === null) return this.prisma.forumTopic.update({ where: { id: topicId }, data: { solvedPostId: null } });
    const post = await this.prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post || post.topicId !== topicId) throw new BadRequestException('Message introuvable dans ce sujet');
    const first = await this.prisma.forumPost.findFirst({ where: { topicId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (first?.id === postId) throw new BadRequestException("Le premier message est la question : choisis une réponse");
    const updated = await this.prisma.forumTopic.update({ where: { id: topicId }, data: { solvedPostId: postId } });
    if (post.authorId !== viewer.userId) {
      await this.notifications.notify({
        userId: post.authorId, type: 'FORUM_REPLY', title: 'Ta réponse a réglé un problème ✅', body: topic.title, link: `/forum/topics/${topicId}`, groupKey: `forum-solved:${topicId}`,
      }).catch(() => undefined);
    }
    return updated;
  }

  async follow(topicId: string, userId: string, on: boolean, role: string) {
    const topic = await this.loadTopic(topicId);
    await this.assertCanSee(topic.categoryId, { userId, role });
    if (on) await this.prisma.forumTopicFollow.upsert({ where: { userId_topicId: { userId, topicId } }, update: {}, create: { userId, topicId } });
    else await this.prisma.forumTopicFollow.deleteMany({ where: { userId, topicId } });
    return { following: on };
  }

  /** Marque comme lus tous les sujets d'un forum et de ses sous-forums. */
  async markForumRead(forumId: string, viewer: Viewer) {
    await this.assertCanSee(forumId, viewer);
    const ids = [forumId, ...(await this.descendantIds(forumId))];
    const topics = await this.prisma.forumTopic.findMany({ where: { categoryId: { in: ids }, lastPostAt: { gt: new Date(Date.now() - UNREAD_WINDOW_MS) } }, select: { id: true } });
    const now = new Date();
    await this.prisma.$transaction(topics.map((t) => this.prisma.forumTopicRead.upsert({
      where: { userId_topicId: { userId: viewer.userId, topicId: t.id } }, update: { readAt: now }, create: { userId: viewer.userId, topicId: t.id },
    })));
    return { marked: topics.length };
  }

  /** Nombre de sujets non lus dans les forums que ce visiteur peut voir (pastille du menu). */
  async unreadTotal(viewer: Viewer) {
    const [hidden, reads, recent] = await Promise.all([
      this.hiddenForumIds(viewer), this.readMap(viewer),
      this.prisma.forumTopic.findMany({ where: { lastPostAt: { gt: new Date(Date.now() - UNREAD_WINDOW_MS) } }, select: { id: true, categoryId: true, lastPostAt: true } }),
    ]);
    const hide = new Set(hidden);
    return { unread: recent.filter((t) => !hide.has(t.categoryId) && (!reads.get(t.id) || reads.get(t.id)! < t.lastPostAt)).length };
  }
}

/** Réglages communs d'un forum ou d'une catégorie (création et modification). */
export interface ForumExtra { description?: string | null; icon?: string | null; staffOnly?: boolean; locked?: boolean; archived?: boolean; qa?: boolean; rules?: string | null; access?: ForumAccess | null }
