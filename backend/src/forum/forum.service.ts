import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

  listCategories() {
    return this.prisma.forumCategory.findMany({ include: { topics: { select: { id: true } } } });
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
