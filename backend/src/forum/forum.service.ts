import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

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

  updateCategory(id: string, name: string) {
    return this.prisma.forumCategory.update({ where: { id }, data: { name } });
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

  createTopic(categoryId: string, authorId: string, title: string, firstPostContent: string) {
    return this.prisma.forumTopic.create({
      data: {
        categoryId,
        authorId,
        title,
        posts: { create: { authorId, content: firstPostContent } },
      },
      include: { posts: true },
    });
  }

  getTopic(topicId: string) {
    return this.prisma.forumTopic.findUnique({
      where: { id: topicId },
      include: { posts: { include: { author: { select: { username: true } } }, orderBy: { createdAt: 'asc' } } },
    });
  }

  reply(topicId: string, authorId: string, content: string) {
    return this.prisma.forumPost.create({ data: { topicId, authorId, content } });
  }
}
