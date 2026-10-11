import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

const ROLE_RANK: Record<string, number> = { USER: 0, UPLOADER: 1, TRUSTED: 2, MODERATOR: 3, SUPER_MODERATOR: 4, ADMIN: 5, OWNER: 6 };
const rank = (role?: string | null) => ROLE_RANK[role ?? 'USER'] ?? 0;
const isStaffRole = (role?: string | null) => rank(role) >= rank('MODERATOR');
const MAX_MINUTES = 365 * 24 * 60;

interface Actor { userId: string; username: string; role?: string }

/** Durée en minutes (null = définitif / sans limite) → date de fin. */
function expiryFrom(minutes: number | null | undefined): Date | null {
  if (minutes === null || minutes === undefined) return null;
  const n = Math.floor(Number(minutes));
  if (!Number.isFinite(n) || n < 1) throw new BadRequestException('Durée invalide');
  return new Date(Date.now() + Math.min(n, MAX_MINUTES) * 60_000);
}

export const describeExpiry = (d: Date | null) => (d ? `jusqu'au ${d.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })}` : 'définitivement');

/**
 * Modération du chat : bannissement d'un membre par la modération (d'un canal ou de tous les canaux publics, avec motif et durée), mise en sourdine
 * d'un membre par n'importe quel membre (ses messages disparaissent de son affichage, pour une durée), et signalement d'un message au staff.
 */
@Injectable()
export class ChatModerationService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private audit: AuditService) {}

  // ------------------------------------------------------------------ bannissements

  /** Bannissement actif qui empêche ce membre d'écrire dans ce canal (le plus long en premier). */
  async activeBanFor(userId: string, conversationId: string) {
    const now = new Date();
    const rows = await this.prisma.chatBan.findMany({
      where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], AND: [{ OR: [{ conversationId: null }, { conversationId }] }] },
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) return null;
    return rows.find((r) => r.expiresAt === null) ?? rows.sort((a, b) => b.expiresAt!.getTime() - a.expiresAt!.getTime())[0];
  }

  /** Tous les bannissements actifs d'un membre (pour décorer la liste de ses conversations). */
  activeBansOf(userId: string) {
    return this.prisma.chatBan.findMany({
      where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { conversationId: true, reason: true, expiresAt: true },
    });
  }

  async ban(actor: Actor, input: { userId: string; conversationId?: string | null; reason: string; minutes?: number | null }, ip?: string | null) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Réservé à l'équipe");
    const reason = (input.reason ?? '').trim();
    if (reason.length < 3) throw new BadRequestException('Indique la raison du bannissement (3 caractères minimum)');
    if (reason.length > 500) throw new BadRequestException('Raison trop longue (500 caractères maximum)');
    if (input.userId === actor.userId) throw new BadRequestException('Tu ne peux pas te bannir toi-même');
    const target = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, username: true, role: true } });
    if (!target) throw new NotFoundException('Membre introuvable');
    if (rank(target.role) >= rank(actor.role)) throw new ForbiddenException("Tu ne peux pas bannir un membre de rang égal ou supérieur au tien");
    let conversationName: string | null = null;
    if (input.conversationId) {
      const conv = await this.prisma.conversation.findUnique({ where: { id: input.conversationId }, select: { id: true, type: true, name: true } });
      if (!conv || conv.type !== 'CHANNEL') throw new BadRequestException('Seuls les canaux publics peuvent bannir un membre');
      conversationName = conv.name;
    }
    const expiresAt = expiryFrom(input.minutes);
    const row = await this.prisma.chatBan.create({
      data: { userId: target.id, conversationId: input.conversationId ?? null, reason, issuedById: actor.userId, issuedByName: actor.username, expiresAt },
    });
    const scope = conversationName ? `du canal #${conversationName}` : 'de tous les canaux publics';
    await this.notifications.notify({
      userId: target.id, type: 'SYSTEM', title: `Tu es banni ${scope} ${describeExpiry(expiresAt)}`, body: `Raison : ${reason}`, link: '/chat',
    }).catch(() => undefined);
    await this.audit.log(actor.userId, 'CHAT_BAN', { userId: target.id, username: target.username, scope: conversationName ? `#${conversationName}` : 'tous les canaux', reason, expiresAt: expiresAt?.toISOString() ?? 'définitif' }, ip);
    return { id: row.id };
  }

  async unban(actor: Actor, banId: string, ip?: string | null) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Réservé à l'équipe");
    const ban = await this.prisma.chatBan.findUnique({ where: { id: banId }, include: { user: { select: { username: true } } } });
    if (!ban || ban.revokedAt) throw new NotFoundException('Bannissement introuvable');
    await this.prisma.chatBan.update({ where: { id: banId }, data: { revokedAt: new Date() } });
    await this.notifications.notify({ userId: ban.userId, type: 'SYSTEM', title: "Ton bannissement du chat a été levé", body: 'Tu peux de nouveau écrire dans les canaux publics.', link: '/chat' }).catch(() => undefined);
    await this.audit.log(actor.userId, 'CHAT_UNBAN', { userId: ban.userId, username: ban.user.username }, ip);
    return { ok: true };
  }

  /** Bannissements en cours (staff). */
  async listBans(actor: Actor) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Réservé à l'équipe");
    const rows = await this.prisma.chatBan.findMany({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
    const convIds = [...new Set(rows.map((r) => r.conversationId).filter((x): x is string => !!x))];
    const convs = convIds.length ? await this.prisma.conversation.findMany({ where: { id: { in: convIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(convs.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id, user: r.user, reason: r.reason, issuedByName: r.issuedByName, expiresAt: r.expiresAt, createdAt: r.createdAt,
      scope: r.conversationId ? `#${names.get(r.conversationId) ?? 'canal'}` : 'Tous les canaux publics',
    }));
  }

  // ------------------------------------------------------------------ sourdine (entre membres)

  /** Les membres actuellement en sourdine pour ce membre (les sourdines échues sont ignorées). */
  async mutedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.chatMute.findMany({ where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { targetId: true } });
    return rows.map((r) => r.targetId);
  }

  /** Parmi ces destinataires, ceux qui ont mis `senderId` en sourdine. */
  async mutersAmong(senderId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.chatMute.findMany({
      where: { targetId: senderId, userId: { in: userIds }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  async listMutes(userId: string) {
    const rows = await this.prisma.chatMute.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      include: { target: { select: { id: true, username: true, avatarUrl: true } } },
    });
    return rows.map((r) => ({ userId: r.target.id, username: r.target.username, avatarUrl: r.target.avatarUrl, expiresAt: r.expiresAt, createdAt: r.createdAt }));
  }

  async mute(actor: Actor, targetId: string, minutes: number | null | undefined) {
    if (!targetId || targetId === actor.userId) throw new BadRequestException('Tu ne peux pas te mettre toi-même en sourdine');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('Membre introuvable');
    const expiresAt = expiryFrom(minutes);
    await this.prisma.chatMute.upsert({
      where: { userId_targetId: { userId: actor.userId, targetId } },
      update: { expiresAt, createdAt: new Date() },
      create: { userId: actor.userId, targetId, expiresAt },
    });
    return { ok: true, expiresAt };
  }

  async unmute(actor: Actor, targetId: string) {
    await this.prisma.chatMute.deleteMany({ where: { userId: actor.userId, targetId } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ signalement d'un message

  async reportMessage(actor: Actor, messageId: string, reasonRaw: string) {
    const reason = (reasonRaw ?? '').trim();
    if (reason.length < 5) throw new BadRequestException('Explique brièvement le problème (5 caractères minimum)');
    if (reason.length > 1000) throw new BadRequestException('Motif trop long (1000 caractères maximum)');
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { select: { id: true, type: true, name: true } }, sender: { select: { id: true, username: true } } },
    });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message introuvable');
    if (msg.type === 'SYSTEM') throw new BadRequestException('Ce message ne peut pas être signalé');
    if (msg.senderId === actor.userId) throw new BadRequestException('Tu ne peux pas signaler ton propre message');
    // Il faut avoir accès à la conversation : les canaux sont ouverts à tous, le reste demande d'en être membre.
    if (msg.conversation.type !== 'CHANNEL') {
      const member = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: msg.conversationId, userId: actor.userId } }, select: { id: true } });
      if (!member) throw new ForbiddenException('Tu ne fais pas partie de cette conversation');
    }
    const already = await this.prisma.report.findFirst({ where: { reporterId: actor.userId, targetType: 'chatMessage', targetId: messageId, status: 'OPEN' }, select: { id: true } });
    if (already) throw new BadRequestException('Tu as déjà signalé ce message : le staff va le traiter.');
    const open = await this.prisma.report.count({ where: { reporterId: actor.userId, status: 'OPEN' } });
    if (open >= 10) throw new BadRequestException('Trop de signalements en attente : patiente le temps que le staff les traite.');
    const snapshot = JSON.stringify({
      text: (msg.content || (msg.imageUrl ? '[image]' : msg.fileName ? `[fichier] ${msg.fileName}` : '[message sans texte]')).slice(0, 1000),
      senderId: msg.sender.id, senderUsername: msg.sender.username, conversationId: msg.conversation.id, conversationType: msg.conversation.type,
      conversationName: msg.conversation.name, at: msg.createdAt.toISOString(),
    });
    await this.prisma.report.create({ data: { reporterId: actor.userId, targetType: 'chatMessage', targetId: messageId, reason, snapshot } });
    return { reported: true };
  }
}
