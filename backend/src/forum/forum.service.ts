import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private badges: BadgesService) {}

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

  createCategory(name: string, parentId?: string) {
    return this.prisma.forumCategory.create({ data: { name, parentId: parentId || null } });
  }

  async updateCategory(id: string, data: { name?: string; parentId?: string | null }) {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.parentId !== undefined) {
      const newParentId = data.parentId || null;
      if (newParentId === id) throw new BadRequestException('Une catégorie ne peut pas être son propre parent');
      if (newParentId) {
        const hasChildren = await this.prisma.forumCategory.count({ where: { parentId: id } });
        if (hasChildren > 0) {
          throw new BadRequestException('Cette catégorie a des sous-catégories : elle ne peut pas devenir elle-même une sous-catégorie');
        }
        const parent = await this.prisma.forumCategory.findUnique({ where: { id: newParentId } });
        if (!parent) throw new BadRequestException('Catégorie parente introuvable');
        if (parent.parentId) throw new BadRequestException('Impossible de créer plus de deux niveaux de catégories');
      }
      payload.parentId = newParentId;
    }
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
