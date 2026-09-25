import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const MAX_LENGTH = 500;
const USER_SELECT = { id: true, username: true, role: true, avatarUrl: true };

export interface ChatAttachment {
  content?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async list(limit = 50) {
    const rows = await this.prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { user: { select: USER_SELECT }, reactions: { select: { emoji: true, userId: true } } },
    });
    return rows.reverse().map((r) => ({ ...r, reactions: this.groupReactions(r.reactions) }));
  }

  create(userId: string, body: ChatAttachment) {
    const content = (body.content ?? '').trim();
    if (!content && !body.imageUrl && !body.fileUrl) throw new BadRequestException('Message vide');
    if (content.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (max ${MAX_LENGTH} caractères)`);
    if (body.imageUrl && !/^\/api\/covers\/[\w.-]+$/.test(body.imageUrl)) throw new BadRequestException('Image invalide');
    if (body.fileUrl && !/^\/api\/chat\/files\//.test(body.fileUrl)) throw new BadRequestException('Fichier invalide');

    return this.prisma.chatMessage.create({
      data: {
        userId, content,
        imageUrl: body.imageUrl || null,
        fileUrl: body.fileUrl || null,
        fileName: body.fileName ? body.fileName.slice(0, 200) : null,
        fileSize: body.fileSize ?? null,
      },
      include: { user: { select: USER_SELECT } },
    }).then((m) => ({ ...m, reactions: [] as { emoji: string; userIds: string[] }[] }));
  }

  async delete(id: string, requester: { userId: string; role: string }) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id }, select: { userId: true } });
    if (!message) return;
    const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(requester.role);
    if (message.userId !== requester.userId && !isStaff) throw new ForbiddenException('Tu ne peux supprimer que tes propres messages');
    await this.prisma.chatMessage.delete({ where: { id } });
  }

  /** Choisir une nouvelle réaction remplace la précédente du même membre ; recliquer la même la retire. */
  async react(userId: string, messageId: string, emoji: string) {
    const clean = (emoji ?? '').trim().slice(0, 8);
    if (!clean) throw new BadRequestException('Émoji manquant');
    if (!(await this.prisma.chatMessage.findUnique({ where: { id: messageId }, select: { id: true } }))) {
      throw new BadRequestException('Message introuvable');
    }
    const existing = await this.prisma.chatReaction.findUnique({ where: { messageId_userId: { messageId, userId } } });
    if (existing?.emoji === clean) {
      await this.prisma.chatReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.chatReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { emoji: clean },
        create: { messageId, userId, emoji: clean },
      });
    }
    const rows = await this.prisma.chatReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
    return this.groupReactions(rows);
  }

  private groupReactions(rows: { emoji: string; userId: string }[]) {
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.userId]);
    return [...map.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
  }
}
