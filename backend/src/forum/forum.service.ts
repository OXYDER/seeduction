import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';

export interface Viewer { userId: string; role: string }

const STAFF = ['MODERATOR', 'ADMIN', 'OWNER'];
const TOPICS_PER_PAGE = 20;
const POSTS_PER_PAGE = 15;
const UNREAD_WINDOW_MS = 30 * 86400_000; // au-delà, un sujet n'est plus signalé « non lu »

const isStaff = (viewer?: Viewer) => !!viewer && STAFF.includes(viewer.role);

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

  async createCategory(name: string, parentId?: string, isCategory = false, extra: { description?: string; icon?: string; staffOnly?: boolean; locked?: boolean } = {}) {
    if (!name?.trim()) throw new BadRequestException('Nom requis');
    await this.assertPlacement(null, isCategory, parentId || null);
    const last = await this.prisma.forumCategory.aggregate({ where: { parentId: parentId || null }, _max: { position: true } });
    return this.prisma.forumCategory.create({
      data: {
        name: name.trim(), parentId: parentId || null, isCategory, position: (last._max.position ?? -1) + 1,
        description: extra.description?.trim() || null, icon: extra.icon?.trim() || null, staffOnly: !!extra.staffOnly, locked: !!extra.locked,
      },
    });
  }

  async updateCategory(id: string, data: { name?: string; parentId?: string | null; isCategory?: boolean; description?: string | null; icon?: string | null; staffOnly?: boolean; locked?: boolean; position?: number }) {
    const current = await this.prisma.forumCategory.findUnique({ where: { id } });
    if (!current) throw new BadRequestException('Introuvable');
    const payload: any = {};
    if (data.name !== undefined && data.name.trim()) payload.name = data.name.trim();
    if (data.description !== undefined) payload.description = data.description?.trim() || null;
    if (data.icon !== undefined) payload.icon = data.icon?.trim() || null;
    if (typeof data.staffOnly === 'boolean') payload.staffOnly = data.staffOnly;
    if (typeof data.locked === 'boolean') payload.locked = data.locked;
    if (typeof data.position === 'number') payload.position = data.position;

    const isCategory = data.isCategory ?? current.isCategory;
    const parentId = data.parentId !== undefined ? data.parentId || null : current.parentId;
    if (isCategory && !current.isCategory) {
      const topics = await this.prisma.forumTopic.count({ where: { categoryId: id } });
      if (topics > 0) throw new BadRequestException(`Impossible : ce forum contient ${topics} sujet(s) — une catégorie ne peut pas en avoir`);
    }
    await this.assertPlacement(id, isCategory, parentId);
    payload.isCategory = isCategory;
    payload.parentId = parentId;
    return this.prisma.forumCategory.update({ where: { id }, data: payload });
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

  async deleteCategory(id: string) {
    const [topics, children] = await Promise.all([
      this.prisma.forumTopic.count({ where: { categoryId: id } }),
      this.prisma.forumCategory.count({ where: { parentId: id } }),
    ]);
    if (topics > 0) throw new BadRequestException(`Impossible : ${topics} sujet(s) dans ce forum`);
    if (children > 0) throw new BadRequestException(`Impossible : ${children} élément(s) à supprimer d'abord à l'intérieur`);
    return this.prisma.forumCategory.delete({ where: { id } });
  }

  // ------------------------------------------------------------------ accès

  /** Identifiants des forums que ce visiteur n'a pas le droit de voir (forums « staff » et tout ce qu'ils contiennent). */
  private async hiddenForumIds(viewer?: Viewer): Promise<string[]> {
    if (isStaff(viewer)) return [];
    const all = await this.prisma.forumCategory.findMany({ select: { id: true, parentId: true, staffOnly: true } });
    const byId = new Map(all.map((c) => [c.id, c]));
    const hidden = (c: { id: string; parentId: string | null; staffOnly: boolean }): boolean =>
      c.staffOnly || (c.parentId ? hidden(byId.get(c.parentId)!) : false);
    return all.filter(hidden).map((c) => c.id);
  }

  private async assertCanSee(forumId: string, viewer?: Viewer) {
    if ((await this.hiddenForumIds(viewer)).includes(forumId)) throw new ForbiddenException('Ce forum est réservé au staff');
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

    const own = new Map<string, { topics: number; posts: number; lastPost: any; unread: boolean }>();
    const get = (id: string) => {
      if (!own.has(id)) own.set(id, { topics: 0, posts: 0, lastPost: null, unread: false });
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
        if (!readAt || readAt < t.lastPostAt) get(t.categoryId).unread = true;
      }
    }
    return own;
  }

  private buildNode(forum: any, byParent: Map<string | null, any[]>, own: Map<string, any>, hidden: Set<string>): any {
    const children = (byParent.get(forum.id) ?? []).filter((c) => !hidden.has(c.id));
    const nodes = children.map((c) => this.buildNode(c, byParent, own, hidden));
    const mine = own.get(forum.id) ?? { topics: 0, posts: 0, lastPost: null, unread: false };
    let lastPost = mine.lastPost;
    let unread = mine.unread;
    let topics = mine.topics;
    let posts = mine.posts;
    for (const n of nodes) {
      topics += n.topics;
      posts += n.posts;
      unread = unread || n.unread;
      if (n.lastPost && (!lastPost || new Date(n.lastPost.createdAt) > new Date(lastPost.createdAt))) lastPost = n.lastPost;
    }
    return {
      id: forum.id, name: forum.name, description: forum.description, icon: forum.icon, isCategory: forum.isCategory,
      staffOnly: forum.staffOnly, locked: forum.locked, topics, posts, lastPost, unread,
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
      this.prisma.user.count(),
      this.prisma.user.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, username: true } }),
    ]);
    return { roots, stats: { topics, posts, members, newestMember: newest } };
  }

  /** Un forum : sous-forums + liste paginée des sujets (épinglés d'abord). */
  async forumView(id: string, page: number, viewer?: Viewer) {
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
    const [breadcrumb, total, topics, reads] = await Promise.all([
      this.ancestors(id),
      this.prisma.forumTopic.count({ where: { categoryId: id } }),
      this.prisma.forumTopic.findMany({
        where: { categoryId: id },
        orderBy: [{ sticky: 'desc' }, { lastPostAt: 'desc' }],
        skip: (safePage - 1) * TOPICS_PER_PAGE,
        take: TOPICS_PER_PAGE,
        include: {
          author: { select: { id: true, username: true } },
          _count: { select: { posts: true } },
          posts: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, createdAt: true, author: { select: { id: true, username: true } } } },
        },
      }),
      this.readMap(viewer),
    ]);

    return {
      forum: node,
      breadcrumb,
      canPost: !!viewer && (!node.isCategory && (!node.locked || isStaff(viewer))),
      page: safePage,
      pageSize: TOPICS_PER_PAGE,
      total,
      topics: topics.map(({ posts, _count, ...t }) => {
        const readAt = reads.get(t.id);
        return {
          ...t,
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
    await this.assertCanSee(categoryId, { userId: authorId, role });
    if (forum.locked && !STAFF.includes(role)) throw new ForbiddenException('Ce forum est verrouillé : seul le staff peut y créer des sujets');
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
        authorId: topic.authorId, createdAt: topic.createdAt, forum: { id: topic.category.id, name: topic.category.name, locked: topic.category.locked },
      },
      breadcrumb,
      page: safePage,
      pageSize: POSTS_PER_PAGE,
      total,
      posts: posts.map((p, i) => ({ ...p, number: (safePage - 1) * POSTS_PER_PAGE + i + 1, author: authors.get(p.authorId) ?? null })),
      canReply: !!viewer && (!topic.locked || isStaff(viewer)),
    };
  }

  async reply(topicId: string, authorId: string, role: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('Message vide');
    const topic = await this.loadTopic(topicId);
    await this.assertCanSee(topic.categoryId, { userId: authorId, role });
    if (topic.locked && !STAFF.includes(role)) throw new ForbiddenException('Ce sujet est verrouillé');

    const post = await this.prisma.forumPost.create({ data: { topicId, authorId, content } });
    await this.prisma.forumTopic.update({ where: { id: topicId }, data: { lastPostAt: post.createdAt } });
    await this.prisma.forumTopicRead.upsert({
      where: { userId_topicId: { userId: authorId, topicId } },
      update: { readAt: new Date() },
      create: { userId: authorId, topicId },
    });
    if (topic.authorId !== authorId) {
      await this.notifications.notify({
        userId: topic.authorId,
        type: 'FORUM_REPLY',
        title: 'Nouvelle réponse à ton sujet',
        body: topic.title,
        link: `/forum/topics/${topicId}`,
      });
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

  async latest(viewer?: Viewer) {
    const hidden = await this.hiddenForumIds(viewer);
    const reads = await this.readMap(viewer);
    const topics = await this.prisma.forumTopic.findMany({
      where: hidden.length ? { categoryId: { notIn: hidden } } : undefined,
      orderBy: { lastPostAt: 'desc' },
      take: 30,
      include: {
        category: { select: { id: true, name: true } },
        author: { select: { id: true, username: true } },
        _count: { select: { posts: true } },
        posts: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, author: { select: { id: true, username: true } } } },
      },
    });
    return topics.map(({ posts, _count, ...t }) => {
      const readAt = reads.get(t.id);
      return { ...t, replies: Math.max(0, _count.posts - 1), lastPost: posts[0] ?? null, unread: !!viewer && (!readAt || readAt < t.lastPostAt) && t.lastPostAt > new Date(Date.now() - UNREAD_WINDOW_MS) };
    });
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
}
