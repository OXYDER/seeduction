import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const BATCH = 500;

/**
 * Recopie dans le moteur Messenger les messages des anciens chats — le chat public (ChatMessage, devenu le canal
 * « Général ») et le chat privé (PrivateMessage « dm-… », devenus des conversations 1 à 1) — sans rien supprimer des
 * anciennes tables. Incrémental et idempotent : chaque message recopié garde son identifiant d'origine (`legacyChatId`
 * / `legacyPmId`, uniques), et on ne reprend qu'à partir du dernier message déjà recopié. On peut donc le relancer à
 * chaque démarrage : ce qui a été écrit dans les anciens chats entre deux déploiements est rattrapé.
 */
@Injectable()
export class MessengerMigrationService implements OnModuleInit {
  private readonly logger = new Logger(MessengerMigrationService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Jamais bloquant : un échec ici ne doit pas empêcher le site de démarrer (les anciens chats restent en place).
    try {
      await this.run();
    } catch (err: any) {
      this.logger.error(`Migration du chat échouée (sans conséquence sur le reste du site) : ${err?.message}`);
    }
  }

  async run() {
    const general = await this.ensureGeneralChannel();
    const chat = await this.copyPublicChat(general.id);
    const direct = await this.copyDirectMessages();
    if (chat || direct) this.logger.log(`Messenger : ${chat} message(s) du chat public et ${direct} message(s) privés recopiés`);
  }

  private async ensureGeneralChannel() {
    const existing = await this.prisma.conversation.findUnique({ where: { slug: 'general' } });
    if (existing) return existing;
    return this.prisma.conversation.create({
      data: { type: 'CHANNEL', name: 'Général', slug: 'general', description: 'La discussion de toute la communauté', position: 0 },
    });
  }

  private async copyPublicChat(channelId: string) {
    const last = await this.prisma.message.findFirst({
      where: { legacyChatId: { not: null } }, orderBy: [{ createdAt: 'desc' }, { legacyChatId: 'desc' }], select: { createdAt: true, legacyChatId: true },
    });
    let cursor: { createdAt: Date; id: string } | null = last ? { createdAt: last.createdAt, id: last.legacyChatId as string } : null;
    let copied = 0;
    for (;;) {
      const rows = await this.prisma.chatMessage.findMany({
        where: cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {},
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
        include: { reactions: true },
      });
      if (rows.length === 0) break;
      const res = await this.prisma.message.createMany({
        skipDuplicates: true,
        data: rows.map((r) => ({
          id: r.id, legacyChatId: r.id, conversationId: channelId, senderId: r.userId,
          type: r.imageUrl ? ('IMAGE' as const) : r.fileUrl ? ('FILE' as const) : ('TEXT' as const),
          content: r.content, imageUrl: r.imageUrl, fileUrl: r.fileUrl, fileName: r.fileName, fileSize: r.fileSize, createdAt: r.createdAt,
        })),
      });
      copied += res.count;
      const reactions = rows.flatMap((r) => r.reactions.map((x) => ({ messageId: r.id, userId: x.userId, emoji: x.emoji, createdAt: x.createdAt })));
      if (reactions.length) await this.prisma.messageReaction.createMany({ data: reactions, skipDuplicates: true });
      const tail = rows[rows.length - 1];
      cursor = { createdAt: tail.createdAt, id: tail.id };
      if (rows.length < BATCH) break;
    }
    if (copied > 0) {
      const newest = await this.prisma.message.findFirst({ where: { conversationId: channelId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (newest) await this.prisma.conversation.update({ where: { id: channelId }, data: { lastMessageAt: newest.createdAt } });
    }
    return copied;
  }

  private async copyDirectMessages() {
    const last = await this.prisma.message.findFirst({
      where: { legacyPmId: { not: null } }, orderBy: [{ createdAt: 'desc' }, { legacyPmId: 'desc' }], select: { createdAt: true, legacyPmId: true },
    });
    let cursor: { createdAt: Date; id: string } | null = last ? { createdAt: last.createdAt, id: last.legacyPmId as string } : null;
    const conversations = new Map<string, string>(); // directKey -> conversationId
    let copied = 0;

    for (;;) {
      const rows = await this.prisma.privateMessage.findMany({
        where: {
          threadId: { startsWith: 'dm-' },
          ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
        select: { id: true, senderId: true, recipientId: true, content: true, read: true, createdAt: true },
      });
      if (rows.length === 0) break;

      const readUpTo = new Map<string, { conversationId: string; userId: string; at: Date }>(); // jusqu'où chacun a lu
      const newest = new Map<string, Date>();
      const data: { id: string; legacyPmId: string; conversationId: string; senderId: string; content: string; createdAt: Date }[] = [];

      for (const r of rows) {
        const key = [r.senderId, r.recipientId].sort().join(':');
        let conversationId = conversations.get(key);
        if (!conversationId) {
          const found = await this.prisma.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
          conversationId = found?.id ?? (await this.prisma.conversation.create({
            data: {
              type: 'DIRECT', directKey: key, createdById: r.senderId, createdAt: r.createdAt, lastMessageAt: r.createdAt,
              // lastReadAt à l'époque : tout est « non lu » tant qu'on n'a pas établi jusqu'où chacun a lu (ci-dessous).
              members: { create: [{ userId: r.senderId, lastReadAt: new Date(0) }, { userId: r.recipientId, lastReadAt: new Date(0) }] },
            },
            select: { id: true },
          })).id;
          conversations.set(key, conversationId);
        }
        data.push({ id: r.id, legacyPmId: r.id, conversationId, senderId: r.senderId, content: r.content, createdAt: r.createdAt });
        // L'expéditeur a forcément lu jusque-là ; le destinataire seulement si le message était marqué lu.
        const mark = (userId: string) => {
          const k = `${conversationId}:${userId}`;
          const prev = readUpTo.get(k);
          if (!prev || prev.at < r.createdAt) readUpTo.set(k, { conversationId: conversationId as string, userId, at: r.createdAt });
        };
        mark(r.senderId);
        if (r.read) mark(r.recipientId);
        const n = newest.get(conversationId);
        if (!n || n < r.createdAt) newest.set(conversationId, r.createdAt);
      }

      const res = await this.prisma.message.createMany({ data, skipDuplicates: true });
      copied += res.count;
      for (const m of readUpTo.values()) {
        await this.prisma.conversationMember.updateMany({ where: { conversationId: m.conversationId, userId: m.userId, lastReadAt: { lt: m.at } }, data: { lastReadAt: m.at } });
      }
      for (const [conversationId, at] of newest) {
        await this.prisma.conversation.updateMany({ where: { id: conversationId, lastMessageAt: { lt: at } }, data: { lastMessageAt: at } });
      }
      const tail = rows[rows.length - 1];
      cursor = { createdAt: tail.createdAt, id: tail.id };
      if (rows.length < BATCH) break;
    }
    return copied;
  }
}
