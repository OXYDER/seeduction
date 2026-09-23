import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';

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

  listCategories() {
    return this.prisma.forumCategory.findMany({
      where: { parentId: null },
      orderBy: { position: 'asc' },
      include: {
        topics: { select: { id: true } },
        children: { orderBy: { position: 'asc' }, include: { topics: { select: { id: true } } } },
      },
    });
  }

  /** Règles : une catégorie est toujours au premier niveau ; un forum est seul ou dans une catégorie, et n'a pas de sous-forums. */
  private async assertPlacement(id: string | null, isCategory: boolean, parentId: string | null) {
    if (isCategory) {
      if (parentId) throw new BadRequestException('Une catégorie ne peut pas être placée dans une autre catégorie');
      return;
    }
    if (parentId) {
      if (parentId === id) throw new BadRequestException('Un forum ne peut pas être son propre parent');
      const parent = await this.prisma.forumCategory.findUnique({ where: { id: parentId } });
      if (!parent) throw new BadRequestException('Catégorie introuvable');
      if (!parent.isCategory) throw new BadRequestException('Un forum ne peut être placé que dans une catégorie (pas dans un autre forum)');
    }
    if (id) {
      const children = await this.prisma.forumCategory.count({ where: { parentId: id } });
      if (children > 0) throw new BadRequestException("Ce forum contient des sous-éléments : déplace-les ou supprime-les d'abord");
    }
  }

  async createCategory(name: string, parentId?: string, isCategory = false) {
    await this.assertPlacement(null, isCategory, parentId || null);
    return this.prisma.forumCategory.create({ data: { name, parentId: parentId || null, isCategory } });
  }

  async updateCategory(id: string, data: { name?: string; parentId?: string | null; isCategory?: boolean }) {
    const current = await this.prisma.forumCategory.findUnique({ where: { id } });
    if (!current) throw new BadRequestException('Introuvable');
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name;
    const isCategory = data.isCategory ?? current.isCategory;
    const parentId = data.parentId !== undefined ? data.parentId || null : current.parentId;
    if (isCategory && !current.isCategory) {
      const topics = await this.prisma.forumTopic.count({ where: { categoryId: id } });
      if (topics > 0) throw new BadRequestException(`Impossible : ce forum contient ${topics} sujet(s) — une catégorie ne peut pas en avoir`);
    }
    if (!isCategory && current.isCategory) {
      const children = await this.prisma.forumCategory.count({ where: { parentId: id } });
      if (children > 0) throw new BadRequestException("Cette catégorie contient des forums : déplace-les ou supprime-les d'abord");
    }
    await this.assertPlacement(id, isCategory, parentId);
    payload.isCategory = isCategory;
    payload.parentId = parentId;
    return this.prisma.forumCategory.update({ where: { id }, data: payload });
  }

  async deleteCategory(id: string) {
    const [topics, children] = await Promise.all([
      this.prisma.forumTopic.count({ where: { categoryId: id } }),
      this.prisma.forumCategory.count({ where: { parentId: id } }),
    ]);
    if (topics > 0) throw new BadRequestException(`Impossible : ${topics} sujet(s) dans cette catégorie`);
    if (children > 0) throw new BadRequestException(`Impossible : ${children} sous-catégorie(s) à supprimer d'abord`);
    return this.prisma.forumCategory.delete({ where: { id } });
  }

  listTopics(categoryId: string) {
    return this.prisma.forumTopic.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { username: true } }, _count: { select: { posts: true } } },
    });
  }

  async createTopic(categoryId: string, authorId: string, title: string, firstPostContent: string) {
    const forum = await this.prisma.forumCategory.findUnique({ where: { id: categoryId }, select: { isCategory: true } });
    if (!forum) throw new BadRequestException('Forum introuvable');
    if (forum.isCategory) throw new BadRequestException('Cette catégorie ne contient pas de sujets : choisis un de ses forums');
    const topic = await this.prisma.forumTopic.create({
      data: {
        categoryId,
        authorId,
        title,
        posts: { create: { authorId, content: firstPostContent } },
      },
      include: { posts: true },
    });
    await this.badges.checkAndAward(authorId);
    return topic;
  }

  getTopic(topicId: string) {
    return this.prisma.forumTopic.findUnique({
      where: { id: topicId },
      include: { posts: { include: { author: { select: { username: true } } }, orderBy: { createdAt: 'asc' } } },
    });
  }

  async reply(topicId: string, authorId: string, content: string) {
    const post = await this.prisma.forumPost.create({ data: { topicId, authorId, content } });
    const topic = await this.prisma.forumTopic.findUnique({ where: { id: topicId } });
    if (topic && topic.authorId !== authorId) {
      await this.notifications.notify({
        userId: topic.authorId,
        type: 'FORUM_REPLY',
        title: 'Nouvelle réponse à ton sujet',
        body: topic.title,
        link: `/forum/topics/${topicId}`,
      });
    }
    await this.badges.checkAndAward(authorId);
    return post;
  }
}
