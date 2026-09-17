import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const MAX_LENGTH = 500;
const USER_SELECT = { id: true, username: true, role: true };

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async list(limit = 50) {
    const rows = await this.prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { user: { select: USER_SELECT } },
    });
    return rows.reverse();
  }

  create(userId: string, content: string) {
    const trimmed = content?.trim();
    if (!trimmed) throw new BadRequestException('Message vide');
    if (trimmed.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (max ${MAX_LENGTH} caractères)`);
    return this.prisma.chatMessage.create({
      data: { userId, content: trimmed },
      include: { user: { select: USER_SELECT } },
    });
  }

  delete(id: string) {
    return this.prisma.chatMessage.delete({ where: { id } });
  }
}
