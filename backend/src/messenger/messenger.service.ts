import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { loadPerms } from '../common/utils/family-perms';
import { EventEmitter } from 'events';
import { Prisma } from '@prisma/client';
import { KLIPY_MEDIA } from './messenger-gifs.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../presence/presence.service';

const ROLE_ORDER = ['USER', 'UPLOADER', 'MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const rank = (r?: string | null) => (r ? ROLE_ORDER.indexOf(r) : -1);
export const isStaff = (role?: string | null) => rank(role) >= rank('MODERATOR');

const USER_SELECT = { id: true, username: true, avatarUrl: true, role: true } as const;
const MAX_LENGTH = 4000;
const MAX_GROUP_MEMBERS = 50;
const MAX_PINS = 25;
const MOTD_MAX = 1000;
const PAGE_SIZE = 40;

export interface Actor { userId: string; username: string; role: string }

export interface SendInput {
  content?: string;
  type?: string;
  replyToId?: string | null;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mime?: string | null;
  durationMs?: number | null;
  torrentId?: string | null;
}

const MESSAGE_INCLUDE = {
  sender: { select: USER_SELECT },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { select: { id: true, type: true, content: true, fileName: true, deletedAt: true, sender: { select: { id: true, username: true } } } },
  torrent: {
    select: {
      id: true, name: true, coverImage: true, size: true, seeders: true, leechers: true, resolution: true, year: true,
      category: { select: { name: true, adult: true, parent: { select: { adult: true } } } },
    },
  },
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** Texte court affiché dans la liste des conversations et dans la citation d'une réponse. */
function previewOf(m: { type: string; content: string; fileName?: string | null; deletedAt?: Date | null }) {
  if (m.deletedAt) return 'Message supprimé';
  switch (m.type) {
    case 'IMAGE': return m.content ? `📷 ${m.content}`.slice(0, 100) : '📷 Photo';
    case 'GIF': return 'GIF';
    case 'VOICE': return '🎤 Message vocal';
    case 'FILE': return `📎 ${m.fileName ?? 'Fichier'}`.slice(0, 100);
    default: return m.content.replace(/\s+/g, ' ').slice(0, 100);
  }
}

function groupReactions(rows: { emoji: string; userId: string }[]) {
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.userId]);
  return [...map.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function messageToDto(m: MessageRow) {
  const deleted = !!m.deletedAt;
  const t = !deleted ? m.torrent : null;
  const adult = !!(t?.category?.adult || t?.category?.parent?.adult);
  return {
    id: m.id,
    conversationId: m.conversationId,
    type: m.type,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deleted,
    sender: m.sender,
    content: deleted ? '' : m.content,
    replyTo: m.replyTo ? { id: m.replyTo.id, type: m.replyTo.type, senderId: m.replyTo.sender.id, senderUsername: m.replyTo.sender.username, preview: previewOf(m.replyTo) } : null,
    imageUrl: deleted ? null : m.imageUrl,
    fileUrl: deleted ? null : m.fileUrl,
    fileName: deleted ? null : m.fileName,
    fileSize: deleted ? null : m.fileSize,
    mime: deleted ? null : m.mime,
    durationMs: deleted ? null : m.durationMs,
    mentionIds: deleted ? [] : m.mentionIds,
    // Un torrent adulte n'est jamais détaillé dans le message : le client demande sa fiche (refusée si le membre a masqué le contenu adulte).
    torrent: t
      ? (adult
        ? { id: t.id, adult: true }
        : { id: t.id, adult: false, name: t.name, coverImage: t.coverImage, size: Number(t.size), seeders: t.seeders, leechers: t.leechers, resolution: t.resolution, year: t.year, category: t.category?.name ?? null })
      : null,
    reactions: groupReactions(m.reactions),
  };
}
export type MessageDto = ReturnType<typeof messageToDto>;

export interface RealtimeEvent {
  event: string;
  payload: any;
  /** Destinataires nominatifs (1 à 1, groupes) ; sinon `channel` = tous ceux qui suivent ce canal. */
  userIds?: string[];
  channel?: string;
}

/**
 * Moteur de messagerie unique : conversations 1 à 1, groupes et canaux publics partagent les mêmes messages,
 * réactions, réponses, « lu / non lu » et droits. Les mutations publient des événements temps réel (voir
 * MessengerGateway) ; les routes REST et la websocket appellent exactement les mêmes méthodes.
 */
@Injectable()
export class MessengerService extends EventEmitter {
  private readonly logger = new Logger(MessengerService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService, private presence: PresenceService) {
    super();
    this.setMaxListeners(20);
  }

  // ------------------------------------------------------------------ accès et droits

  private async access(actor: Actor, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation introuvable');
    const key = { conversationId_userId: { conversationId, userId: actor.userId } };
    let member = await this.prisma.conversationMember.findUnique({ where: key });
    if (conv.type === 'CHANNEL') {
      if (conv.readRole && rank(actor.role) < rank(conv.readRole)) throw new ForbiddenException('Ce canal est réservé');
      if (!member) member = await this.prisma.conversationMember.create({ data: { conversationId, userId: actor.userId } });
    } else if (!member) {
      throw new ForbiddenException('Tu ne fais pas partie de cette conversation');
    }
    return { conv, member };
  }

  private assertCanWrite(actor: Actor, conv: { type: string; archived: boolean; writeRole: string | null }) {
    if (conv.archived) throw new ForbiddenException('Cette conversation est archivée');
    if (conv.type === 'CHANNEL' && conv.writeRole && rank(actor.role) < rank(conv.writeRole)) {
      throw new ForbiddenException("Tu n'as pas le droit d'écrire dans ce canal");
    }
  }

  async areFriends(a: string, b: string) {
    return !!(await this.prisma.friendship.findFirst({
      where: { status: 'ACCEPTED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
      select: { id: true },
    }));
  }

  /** Un 1 à 1 est permis selon la préférence du destinataire (tout le monde, ou ses amis seulement) ; jamais avec un blocage. */
  private async assertCanDirect(fromId: string, toId: string) {
    const [target, blocked] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: toId }, select: { dmPrivacy: true } }),
      this.prisma.friendship.findFirst({
        where: { status: 'BLOCKED', OR: [{ requesterId: fromId, addresseeId: toId }, { requesterId: toId, addresseeId: fromId }] },
        select: { id: true },
      }),
    ]);
    if (!target) throw new NotFoundException('Membre introuvable');
    if (blocked) throw new ForbiddenException("Tu ne peux pas écrire à ce membre");
    if (target.dmPrivacy === 'FRIENDS_ONLY' && !(await this.areFriends(fromId, toId))) {
      throw new ForbiddenException("Ce membre n'accepte les messages privés que de ses amis");
    }
  }

  private async memberIds(conversationId: string) {
    const rows = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async publish(conv: { id: string; type: string }, event: string, payload: any, extraUserIds: string[] = []) {
    if (conv.type === 'CHANNEL') this.emit('realtime', { event, payload, channel: conv.id } satisfies RealtimeEvent);
    else this.emit('realtime', { event, payload, userIds: [...new Set([...(await this.memberIds(conv.id)), ...extraUserIds])] } satisfies RealtimeEvent);
  }

  /** Fait rafraîchir la liste de conversations de ces membres (nouveau groupe, retrait, renommage...). */
  private notifyConversationChanged(conversationId: string, userIds: string[], reason: string) {
    this.emit('realtime', { event: 'conversation:changed', payload: { conversationId, reason }, userIds: [...new Set(userIds)] } satisfies RealtimeEvent);
  }

  // ------------------------------------------------------------------ conversations

  /** Les canaux lisibles par ce membre deviennent des conversations « suivies » (pour compter les non lus), sans historique non lu. */
  private async ensureChannelMembership(actor: Actor) {
    const channels = await this.prisma.conversation.findMany({ where: { type: 'CHANNEL', archived: false }, select: { id: true, readRole: true } });
    const readable = channels.filter((c) => !c.readRole || rank(actor.role) >= rank(c.readRole)).map((c) => c.id);
    if (readable.length === 0) return;
    const mine = new Set((await this.prisma.conversationMember.findMany({ where: { userId: actor.userId, conversationId: { in: readable } }, select: { conversationId: true } })).map((m) => m.conversationId));
    const missing = readable.filter((id) => !mine.has(id));
    if (missing.length) await this.prisma.conversationMember.createMany({ data: missing.map((conversationId) => ({ conversationId, userId: actor.userId })), skipDuplicates: true });
  }

  /** Canaux lisibles par un membre (pour que la websocket le rejoigne). */
  async readableChannelIds(actor: { role: string }) {
    const channels = await this.prisma.conversation.findMany({ where: { type: 'CHANNEL', archived: false }, select: { id: true, readRole: true } });
    return channels.filter((c) => !c.readRole || rank(actor.role) >= rank(c.readRole)).map((c) => c.id);
  }

  async list(actor: Actor, opts: { archived?: boolean } = {}) {
    await this.ensureChannelMembership(actor);
    const mine = await this.prisma.conversationMember.findMany({
      where: { userId: actor.userId, archived: !!opts.archived, conversation: { archived: false } },
      include: { conversation: true },
    });
    const visible = mine.filter((m) => m.conversation.type !== 'CHANNEL' || !m.conversation.readRole || rank(actor.role) >= rank(m.conversation.readRole));
    const ids = visible.map((m) => m.conversationId);
    if (ids.length === 0) return [];

    const [lasts, unreadRows, participants, pinRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; conversationId: string; type: string; content: string; fileName: string | null; senderId: string; createdAt: Date; deletedAt: Date | null; username: string }[]>`
        SELECT DISTINCT ON (m."conversationId") m.id, m."conversationId", m.type::text AS type, m.content, m."fileName", m."senderId", m."createdAt", m."deletedAt", u.username
        FROM "Message" m JOIN "User" u ON u.id = m."senderId"
        WHERE m."conversationId" = ANY(${ids}::text[])
        ORDER BY m."conversationId", m."createdAt" DESC`,
      this.prisma.$queryRaw<{ conversationId: string; n: number; mentions: number }[]>`
        SELECT m."conversationId", COUNT(*)::int AS n, COUNT(*) FILTER (WHERE ${actor.userId} = ANY(m."mentionIds"))::int AS mentions
        FROM "Message" m JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${actor.userId}
        WHERE m."createdAt" > cm."lastReadAt" AND m."senderId" <> ${actor.userId} AND m."deletedAt" IS NULL AND m."conversationId" = ANY(${ids}::text[])
        GROUP BY m."conversationId"`,
      this.prisma.conversationMember.findMany({
        where: { conversationId: { in: visible.filter((m) => m.conversation.type !== 'CHANNEL').map((m) => m.conversationId) } },
        include: { user: { select: USER_SELECT } },
      }),
      this.prisma.conversationPin.findMany({ where: { conversationId: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { conversationId: true, messageId: true } }),
    ]);
    const pinsBy = new Map<string, string[]>();
    for (const p of pinRows) pinsBy.set(p.conversationId, [...(pinsBy.get(p.conversationId) ?? []), p.messageId]);
    const lastBy = new Map(lasts.map((l) => [l.conversationId, l]));
    const unreadBy = new Map(unreadRows.map((u) => [u.conversationId, u]));
    const peopleBy = new Map<string, typeof participants>();
    for (const p of participants) peopleBy.set(p.conversationId, [...(peopleBy.get(p.conversationId) ?? []), p]);

    const result = visible.flatMap((m) => {
      const c = m.conversation;
      const last = lastBy.get(c.id) ?? null;
      if (c.type === 'DIRECT' && !last) return []; // une discussion jamais commencée n'encombre pas la liste
      const people = peopleBy.get(c.id) ?? [];
      const other = c.type === 'DIRECT' ? people.find((p) => p.userId !== actor.userId)?.user ?? null : null;
      const unread = unreadBy.get(c.id);
      return [{
        id: c.id,
        type: c.type,
        name: c.type === 'DIRECT' ? other?.username ?? 'Membre' : c.name,
        slug: c.slug,
        description: c.description,
        iconUrl: c.iconUrl,
        other: other ? { ...other, status: this.presence.publicStatus(other.id) } : null,
        members: c.type === 'GROUP' ? people.map((p) => ({ ...p.user, role: p.role })) : undefined,
        memberCount: c.type === 'CHANNEL' ? undefined : people.length,
        last: last ? { id: last.id, type: last.type, preview: previewOf({ type: last.type, content: last.content, fileName: last.fileName, deletedAt: last.deletedAt }), senderId: last.senderId, senderUsername: last.username, createdAt: last.createdAt } : null,
        unread: unread?.n ?? 0,
        mentions: unread?.mentions ?? 0,
        mutedUntil: m.mutedUntil,
        pinned: m.pinned,
        archived: m.archived,
        myRole: m.role,
        pinnedMessageIds: pinsBy.get(c.id) ?? [],
        motd: c.motd,
        motdAt: c.motdAt,
        writable: !(c.type === 'CHANNEL' && c.writeRole && rank(actor.role) < rank(c.writeRole)),
        position: c.position,
        lastMessageAt: last?.createdAt ?? c.lastMessageAt,
      }];
    });
    return result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.type === 'CHANNEL' && b.type === 'CHANNEL') return a.position - b.position;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  }

  async get(actor: Actor, conversationId: string) {
    await this.access(actor, conversationId);
    const all = await this.list(actor);
    const found = all.find((c) => c.id === conversationId);
    if (found) return found;
    // Une discussion tout juste ouverte (aucun message encore) n'est pas dans la liste : on la décrit directement.
    const conv = await this.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { members: { include: { user: { select: USER_SELECT } } } } });
    const other = conv.members.find((p) => p.userId !== actor.userId)?.user ?? null;
    return {
      id: conv.id, type: conv.type, name: conv.type === 'DIRECT' ? other?.username ?? 'Membre' : conv.name, slug: conv.slug, description: conv.description,
      iconUrl: conv.iconUrl, other: other ? { ...other, status: this.presence.publicStatus(other.id) } : null, members: undefined, memberCount: conv.members.length,
      last: null, unread: 0, mentions: 0, mutedUntil: null, pinned: false, archived: false, myRole: 'MEMBER', pinnedMessageIds: [] as string[], motd: conv.motd, motdAt: conv.motdAt, writable: true, position: conv.position, lastMessageAt: conv.lastMessageAt,
    };
  }

  /** Ouvre (ou crée) le 1 à 1 avec ce membre. */
  /** Compte famille : le profil principal peut retirer à un profil le droit à la messagerie (chat, appels). */
  async assertMessaging(userId: string) {
    if (!(await loadPerms(this.prisma, userId)).messaging) throw new ForbiddenException("Le profil principal n'autorise pas la messagerie pour ce profil");
  }

  async openDirect(actor: Actor, otherId: string) {
    await this.assertMessaging(actor.userId);
    if (!otherId || otherId === actor.userId) throw new BadRequestException("Tu ne peux pas t'écrire à toi-même");
    await this.assertCanDirect(actor.userId, otherId);
    const key = [actor.userId, otherId].sort().join(':');
    let conv = await this.prisma.conversation.findUnique({ where: { directKey: key } });
    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: { type: 'DIRECT', directKey: key, createdById: actor.userId, members: { create: [{ userId: actor.userId }, { userId: otherId }] } },
      });
    } else {
      await this.prisma.conversationMember.createMany({ data: [{ conversationId: conv.id, userId: actor.userId }, { conversationId: conv.id, userId: otherId }], skipDuplicates: true });
    }
    return this.get(actor, conv.id);
  }

  // ------------------------------------------------------------------ groupes

  private async assertFriendsWith(userId: string, otherIds: string[]) {
    if (otherIds.length === 0) return;
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId, addresseeId: { in: otherIds } }, { addresseeId: userId, requesterId: { in: otherIds } }] },
      select: { requesterId: true, addresseeId: true },
    });
    const friends = new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)));
    if (otherIds.some((id) => !friends.has(id))) throw new ForbiddenException('Tu ne peux ajouter à un groupe que des membres qui sont tes amis');
  }

  private async systemMessage(conversationId: string, senderId: string, text: string) {
    const row = await this.prisma.message.create({ data: { conversationId, senderId, type: 'SYSTEM', content: text }, include: MESSAGE_INCLUDE });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: row.createdAt } });
    await this.publish({ id: conversationId, type: 'GROUP' }, 'message:new', messageToDto(row));
  }

  /** Trace d'un appel dans la conversation (« Appel audio · 2 min 14 s », « Appel manqué »...). */
  async logCall(conversationId: string, callerId: string, text: string) {
    await this.systemMessage(conversationId, callerId, text);
  }

  /** Avec qui on appelle : seulement dans un 1 à 1 dont on est membre, et si les règles de message privé le permettent. */
  async callPeer(actor: Actor, conversationId: string): Promise<string> {
    const { conv } = await this.access(actor, conversationId);
    if (conv.type !== 'DIRECT') throw new BadRequestException('Les appels se font dans une conversation privée');
    const otherId = (await this.memberIds(conv.id)).find((id) => id !== actor.userId);
    if (!otherId) throw new BadRequestException('Interlocuteur introuvable');
    await this.assertCanDirect(actor.userId, otherId);
    return otherId;
  }

  async createGroup(actor: Actor, name: string, memberIds: string[]) {
    await this.assertMessaging(actor.userId);
    const title = (name ?? '').trim().slice(0, 80);
    if (!title) throw new BadRequestException('Donne un nom au groupe');
    const others = [...new Set((memberIds ?? []).filter((id) => id && id !== actor.userId))];
    if (others.length < 1) throw new BadRequestException('Ajoute au moins un ami au groupe');
    if (others.length + 1 > MAX_GROUP_MEMBERS) throw new BadRequestException(`Un groupe compte ${MAX_GROUP_MEMBERS} membres au maximum`);
    await this.assertFriendsWith(actor.userId, others);
    const conv = await this.prisma.conversation.create({
      data: { type: 'GROUP', name: title, createdById: actor.userId, members: { create: [{ userId: actor.userId, role: 'OWNER' }, ...others.map((userId) => ({ userId }))] } },
    });
    await this.systemMessage(conv.id, actor.userId, `${actor.username} a créé le groupe « ${title} »`);
    this.notifyConversationChanged(conv.id, [actor.userId, ...others], 'created');
    return this.get(actor, conv.id);
  }

  private async requireGroup(actor: Actor, conversationId: string, adminOnly: boolean) {
    const { conv, member } = await this.access(actor, conversationId);
    if (conv.type !== 'GROUP') throw new BadRequestException("Cette conversation n'est pas un groupe");
    if (adminOnly && member.role === 'MEMBER' && !isStaff(actor.role)) throw new ForbiddenException('Réservé aux administrateurs du groupe');
    return { conv, member };
  }

  async updateGroup(actor: Actor, conversationId: string, data: { name?: string; iconUrl?: string | null }) {
    const { conv } = await this.requireGroup(actor, conversationId, true);
    const patch: Prisma.ConversationUpdateInput = {};
    if (data.name !== undefined) {
      const name = data.name.trim().slice(0, 80);
      if (!name) throw new BadRequestException('Le nom ne peut pas être vide');
      patch.name = name;
    }
    if (data.iconUrl !== undefined) {
      if (data.iconUrl && !/^\/api\/covers\/[\w.-]+$/.test(data.iconUrl)) throw new BadRequestException('Image invalide');
      patch.iconUrl = data.iconUrl || null;
    }
    await this.prisma.conversation.update({ where: { id: conv.id }, data: patch });
    if (patch.name && patch.name !== conv.name) await this.systemMessage(conv.id, actor.userId, `${actor.username} a renommé le groupe « ${patch.name} »`);
    this.notifyConversationChanged(conv.id, await this.memberIds(conv.id), 'updated');
    return this.get(actor, conv.id);
  }

  async addMembers(actor: Actor, conversationId: string, userIds: string[]) {
    const { conv } = await this.requireGroup(actor, conversationId, true);
    const existing = new Set(await this.memberIds(conv.id));
    const fresh = [...new Set((userIds ?? []).filter((id) => id && !existing.has(id)))];
    if (fresh.length === 0) throw new BadRequestException('Ces membres sont déjà dans le groupe');
    if (existing.size + fresh.length > MAX_GROUP_MEMBERS) throw new BadRequestException(`Un groupe compte ${MAX_GROUP_MEMBERS} membres au maximum`);
    await this.assertFriendsWith(actor.userId, fresh);
    await this.prisma.conversationMember.createMany({ data: fresh.map((userId) => ({ conversationId: conv.id, userId })), skipDuplicates: true });
    const users = await this.prisma.user.findMany({ where: { id: { in: fresh } }, select: { username: true } });
    await this.systemMessage(conv.id, actor.userId, `${actor.username} a ajouté ${users.map((u) => u.username).join(', ')}`);
    this.notifyConversationChanged(conv.id, [...existing, ...fresh], 'members');
    return this.get(actor, conv.id);
  }

  /** Retirer un membre (administrateurs) ou quitter soi-même le groupe. */
  async removeMember(actor: Actor, conversationId: string, targetId: string) {
    const { conv, member } = await this.requireGroup(actor, conversationId, false);
    const leaving = targetId === actor.userId;
    const target = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: targetId } }, include: { user: { select: { username: true } } } });
    if (!target) throw new NotFoundException("Ce membre n'est pas dans le groupe");
    if (!leaving) {
      if (member.role === 'MEMBER') throw new ForbiddenException('Réservé aux administrateurs du groupe');
      if (target.role === 'OWNER' || (target.role === 'ADMIN' && member.role !== 'OWNER')) throw new ForbiddenException("Tu ne peux pas retirer ce membre");
    }
    const before = await this.memberIds(conversationId);
    await this.prisma.conversationMember.delete({ where: { id: target.id } });
    const remaining = before.filter((id) => id !== targetId);
    if (remaining.length === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
    } else {
      if (target.role === 'OWNER') {
        // Le propriétaire part : l'administrateur le plus ancien (sinon le membre le plus ancien) reprend le groupe.
        const heir = await this.prisma.conversationMember.findFirst({ where: { conversationId }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] });
        if (heir) await this.prisma.conversationMember.update({ where: { id: heir.id }, data: { role: 'OWNER' } });
      }
      await this.systemMessage(conversationId, remaining[0], leaving ? `${target.user.username} a quitté le groupe` : `${actor.username} a retiré ${target.user.username}`);
    }
    this.notifyConversationChanged(conversationId, before, 'members');
    return { ok: true };
  }

  async setMemberRole(actor: Actor, conversationId: string, targetId: string, role: 'ADMIN' | 'MEMBER') {
    const { member } = await this.requireGroup(actor, conversationId, false);
    if (member.role !== 'OWNER') throw new ForbiddenException('Seul le propriétaire change les rôles');
    const target = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: targetId } } });
    if (!target || target.role === 'OWNER') throw new BadRequestException('Rôle inchangé');
    await this.prisma.conversationMember.update({ where: { id: target.id }, data: { role } });
    this.notifyConversationChanged(conversationId, await this.memberIds(conversationId), 'members');
    return this.get(actor, conversationId);
  }

  // ------------------------------------------------------------------ messages

  async messages(actor: Actor, conversationId: string, before?: string, limit = PAGE_SIZE) {
    const { conv, member } = await this.access(actor, conversationId);
    const take = Math.max(1, Math.min(limit, 100));
    let cursor: { createdAt: Date; id: string } | null = null;
    if (before) cursor = await this.prisma.message.findFirst({ where: { id: before, conversationId }, select: { createdAt: true, id: true } });
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: MESSAGE_INCLUDE,
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse().map(messageToDto);
    // « Vu par » : jusqu'où chacun a lu (1 à 1 et groupes ; inutile pour un grand canal public).
    const readBy = conv.type === 'CHANNEL'
      ? []
      : (await this.prisma.conversationMember.findMany({ where: { conversationId, userId: { not: actor.userId } }, select: { userId: true, lastReadAt: true } }));
    return { messages: page, hasMore, myLastReadAt: member.lastReadAt, readBy };
  }

  /** Messages d'une conversation contenant ce texte (recherche dans la discussion ouverte). */
  async search(actor: Actor, conversationId: string, q: string) {
    await this.access(actor, conversationId);
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    const rows = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null, content: { contains: term, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: MESSAGE_INCLUDE,
    });
    return rows.map(messageToDto);
  }

  private async parseMentions(conv: { id: string; type: string }, content: string) {
    const names = [...new Set([...content.matchAll(/@([\p{L}\p{N}_.·-]{2,50})/gu)].map((m) => m[1].toLowerCase()))].slice(0, 10);
    if (names.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { OR: names.map((n) => ({ username: { equals: n, mode: 'insensitive' as const } })) },
      select: { id: true },
    });
    if (conv.type === 'CHANNEL') return users.map((u) => u.id);
    const members = new Set(await this.memberIds(conv.id));
    return users.map((u) => u.id).filter((id) => members.has(id));
  }

  async send(actor: Actor, conversationId: string, input: SendInput) {
    await this.assertMessaging(actor.userId);
    const { conv } = await this.access(actor, conversationId);
    this.assertCanWrite(actor, conv);

    if (conv.slowModeSeconds > 0 && !isStaff(actor.role)) {
      const last = await this.prisma.message.findFirst({ where: { conversationId, senderId: actor.userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      const wait = last ? conv.slowModeSeconds - Math.floor((Date.now() - last.createdAt.getTime()) / 1000) : 0;
      if (wait > 0) throw new ForbiddenException(`Mode lent : attends encore ${wait} s`);
    }
    if (conv.type === 'DIRECT') {
      const other = (await this.memberIds(conv.id)).find((id) => id !== actor.userId);
      if (!other) throw new ForbiddenException('Conversation indisponible');
      await this.assertCanDirect(actor.userId, other);
    }

    const content = (input.content ?? '').trim();
    if (content.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (${MAX_LENGTH} caractères maximum)`);
    let type: 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE' | 'GIF' = 'TEXT';
    const data: Prisma.MessageUncheckedCreateInput = { conversationId, senderId: actor.userId, content };

    if (input.imageUrl) {
      // Soit une image téléversée chez nous, soit un GIF / autocollant choisi dans la recherche Klipy.
      const klipy = KLIPY_MEDIA.test(input.imageUrl);
      if (!klipy && !/^\/api\/covers\/[\w.-]+$/.test(input.imageUrl)) throw new BadRequestException('Image invalide');
      type = klipy || /\.gif$/i.test(input.imageUrl) ? 'GIF' : 'IMAGE';
      data.imageUrl = input.imageUrl;
    } else if (input.fileUrl) {
      if (!/^\/api\/(chat|messenger)\/files\/[^\s]+$/.test(input.fileUrl)) throw new BadRequestException('Fichier invalide');
      type = input.type === 'VOICE' ? 'VOICE' : 'FILE';
      data.fileUrl = input.fileUrl;
      data.fileName = input.fileName ? input.fileName.slice(0, 200) : null;
      data.fileSize = Number.isFinite(input.fileSize) ? Math.max(0, Math.floor(input.fileSize as number)) : null;
      data.mime = input.mime ? input.mime.slice(0, 100) : null;
      if (type === 'VOICE' && Number.isFinite(input.durationMs)) data.durationMs = Math.max(0, Math.min(600_000, Math.floor(input.durationMs as number)));
    }

    // Torrent partagé : choisi explicitement, ou repéré dans un lien collé vers une fiche du site.
    let torrentId = input.torrentId ?? null;
    if (!torrentId) torrentId = content.match(/\/torrents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ?? null;
    if (torrentId) {
      const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, status: true } });
      torrentId = t && t.status === 'APPROVED' ? t.id : null;
    }
    if (torrentId) data.torrentId = torrentId;

    if (!content && !data.imageUrl && !data.fileUrl && !data.torrentId) throw new BadRequestException('Message vide');
    data.type = type;

    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({ where: { id: input.replyToId, conversationId }, select: { id: true } });
      if (!target) throw new BadRequestException('Le message auquel tu réponds est introuvable');
      data.replyToId = target.id;
    }

    data.mentionIds = content ? await this.parseMentions(conv, content) : [];

    const row = await this.prisma.message.create({ data, include: MESSAGE_INCLUDE });
    const now = row.createdAt;
    await Promise.all([
      this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now } }),
      this.prisma.conversationMember.updateMany({ where: { conversationId: conv.id, userId: actor.userId }, data: { lastReadAt: now } }),
    ]);
    const dto = messageToDto(row);
    await this.publish(conv, 'message:new', dto);
    this.notifyRecipients(actor, conv, dto).catch((err) => this.logger.warn(`Notification de message échouée : ${err?.message}`));
    // Les modules qui réagissent aux messages (assistant du canal Support...) s'abonnent à cet événement.
    this.emit('message:sent', { conv: { id: conv.id, type: conv.type, slug: conv.slug }, message: dto, actor });
    return dto;
  }

  /**
   * Message écrit par un compte automatique (assistant du canal Support) : pas de contrôle d'accès ni de notification de présence,
   * mais le message est stocké et diffusé exactement comme les autres. La personne visée est notifiée si elle est mentionnée.
   */
  async postAsBot(botUserId: string, conversationId: string, content: string, opts: { type?: 'TEXT' | 'BOT_ANSWER' | 'TICKET_OFFER' | 'HANDOFF'; replyToId?: string | null; mentionIds?: string[] } = {}) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation introuvable');
    let replyToId: string | null = null;
    if (opts.replyToId) replyToId = (await this.prisma.message.findFirst({ where: { id: opts.replyToId, conversationId, deletedAt: null }, select: { id: true } }))?.id ?? null;
    const row = await this.prisma.message.create({
      data: { conversationId, senderId: botUserId, type: opts.type ?? 'TEXT', content: content.slice(0, MAX_LENGTH), replyToId, mentionIds: opts.mentionIds ?? [] },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: row.createdAt } });
    const dto = messageToDto(row);
    await this.publish(conv, 'message:new', dto);
    return dto;
  }

  /** « Quelqu'un écrit… » pour un compte automatique pendant qu'il prépare sa réponse. */
  botTyping(conversationId: string, bot: { id: string; username: string }) {
    this.emit('realtime', { event: 'conversation:typing', payload: { conversationId, userId: bot.id, username: bot.username }, channel: conversationId } satisfies RealtimeEvent);
  }

  /** Notifie hors ligne les membres d'un 1 à 1 / groupe (non muets), et toute personne mentionnée ; une seule notification non lue par conversation. */
  private async notifyRecipients(actor: Actor, conv: { id: string; type: string; name: string | null }, dto: MessageDto) {
    const link = `/chat?c=${conv.id}`;
    const notify = async (userId: string, title: string) => {
      const dup = await this.prisma.notification.findFirst({ where: { userId, type: 'MESSAGE', read: false, link }, select: { id: true } });
      if (dup) return;
      await this.notifications.notify({ userId, type: 'MESSAGE', title, body: previewOf({ type: dto.type, content: dto.content, fileName: dto.fileName }).slice(0, 120), link });
    };
    const mentioned = new Set(dto.mentionIds.filter((id) => id !== actor.userId));
    for (const id of mentioned) await notify(id, `${actor.username} t'a mentionné${conv.name ? ` dans ${conv.type === 'CHANNEL' ? '#' : ''}${conv.name}` : ''}`);
    if (conv.type === 'CHANNEL') return;
    const members = await this.prisma.conversationMember.findMany({ where: { conversationId: conv.id, userId: { not: actor.userId } }, select: { userId: true, mutedUntil: true } });
    for (const m of members) {
      if (mentioned.has(m.userId) || this.presence.isOnline(m.userId)) continue;
      if (m.mutedUntil && m.mutedUntil > new Date()) continue;
      await notify(m.userId, conv.type === 'GROUP' ? `${actor.username} dans « ${conv.name} »` : `Nouveau message de ${actor.username}`);
    }
  }

  async edit(actor: Actor, messageId: string, content: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message introuvable');
    if (msg.senderId !== actor.userId) throw new ForbiddenException('Tu ne peux modifier que tes propres messages');
    if (msg.type !== 'TEXT') throw new BadRequestException('Seuls les messages texte peuvent être modifiés');
    const text = (content ?? '').trim();
    if (!text) throw new BadRequestException('Message vide');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Message trop long (${MAX_LENGTH} caractères maximum)`);
    await this.access(actor, msg.conversationId);
    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: text, editedAt: new Date(), mentionIds: await this.parseMentions(msg.conversation, text) },
      include: MESSAGE_INCLUDE,
    });
    const dto = messageToDto(row);
    await this.publish(msg.conversation, 'message:updated', dto);
    return dto;
  }

  /** « Annuler l'envoi » : l'auteur, un administrateur de groupe, ou la modération dans un canal public. */
  async remove(actor: Actor, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (!msg) throw new NotFoundException('Message introuvable');
    const { member } = await this.access(actor, msg.conversationId);
    const own = msg.senderId === actor.userId;
    const mod = msg.conversation.type === 'CHANNEL' ? isStaff(actor.role) : msg.conversation.type === 'GROUP' && member.role !== 'MEMBER';
    if (!own && !mod) throw new ForbiddenException('Tu ne peux pas supprimer ce message');
    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: '', imageUrl: null, fileUrl: null, fileName: null, fileSize: null, mime: null, durationMs: null, torrentId: null, mentionIds: [] },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.messageReaction.deleteMany({ where: { messageId } });
    if ((await this.prisma.conversationPin.deleteMany({ where: { messageId } })).count > 0) await this.publishPins(msg.conversation);
    const dto = messageToDto({ ...row, reactions: [] });
    await this.publish(msg.conversation, 'message:updated', dto);
    return { ok: true };
  }

  /** Choisir une nouvelle réaction remplace la précédente ; recliquer la même la retire. */
  async react(actor: Actor, messageId: string, emoji: string) {
    const clean = (emoji ?? '').trim().slice(0, 8);
    if (!clean) throw new BadRequestException('Émoji manquant');
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message introuvable');
    await this.access(actor, msg.conversationId);
    const key = { messageId_userId: { messageId, userId: actor.userId } };
    const existing = await this.prisma.messageReaction.findUnique({ where: key });
    if (existing?.emoji === clean) await this.prisma.messageReaction.delete({ where: key });
    else await this.prisma.messageReaction.upsert({ where: key, update: { emoji: clean }, create: { messageId, userId: actor.userId, emoji: clean } });
    const reactions = groupReactions(await this.prisma.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } }));
    await this.publish(msg.conversation, 'message:reactions', { conversationId: msg.conversationId, messageId, reactions });
    return reactions;
  }

  async markRead(actor: Actor, conversationId: string) {
    const { conv } = await this.access(actor, conversationId);
    const at = new Date();
    await this.prisma.conversationMember.updateMany({ where: { conversationId, userId: actor.userId }, data: { lastReadAt: at } });
    if (conv.type !== 'CHANNEL') await this.publish(conv, 'conversation:read', { conversationId, userId: actor.userId, at });
    // Ses autres appareils/onglets font tomber le compteur tout de suite.
    this.emit('realtime', { event: 'conversation:read-self', payload: { conversationId }, userIds: [actor.userId] } satisfies RealtimeEvent);
    return { ok: true };
  }

  /** Qui doit recevoir ce qui se passe dans la conversation (frappe, etc.) : les membres nommément, ou le canal entier. */
  async audience(actor: Actor, conversationId: string): Promise<{ channel?: string; userIds: string[] }> {
    const { conv } = await this.access(actor, conversationId);
    if (conv.type === 'CHANNEL') return { channel: conv.id, userIds: [] };
    return { userIds: await this.memberIds(conv.id) };
  }

  // ------------------------------------------------------------------ messages épinglés (plusieurs par conversation, comme Discord / Telegram)

  private async canPin(actor: Actor, conversationId: string) {
    const { conv, member } = await this.access(actor, conversationId);
    const allowed = conv.type === 'CHANNEL' ? isStaff(actor.role) : conv.type === 'GROUP' ? member.role !== 'MEMBER' : true;
    if (!allowed) throw new ForbiddenException("Tu ne peux pas épingler de message ici");
    return conv;
  }

  /** Avertit tout le monde de la nouvelle liste d'épingles (les clients rechargent la liste complète). */
  private async publishPins(conv: { id: string; type: string }) {
    const ids = (await this.prisma.conversationPin.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' }, select: { messageId: true } })).map((p) => p.messageId);
    await this.publish(conv, 'conversation:pinned', { conversationId: conv.id, pinnedMessageIds: ids });
    return ids;
  }

  /** Les messages épinglés, le plus récemment épinglé d'abord. */
  async pins(actor: Actor, conversationId: string) {
    await this.access(actor, conversationId);
    const rows = await this.prisma.conversationPin.findMany({
      where: { conversationId, message: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: { message: { include: MESSAGE_INCLUDE } },
    });
    return rows.map((r) => ({ ...messageToDto(r.message), pinnedAt: r.createdAt }));
  }

  async addPin(actor: Actor, conversationId: string, messageId: string) {
    const conv = await this.canPin(actor, conversationId);
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, conversationId, deletedAt: null }, select: { id: true } });
    if (!msg) throw new NotFoundException('Message introuvable');
    if ((await this.prisma.conversationPin.count({ where: { conversationId } })) >= MAX_PINS) throw new BadRequestException(`${MAX_PINS} messages épinglés au maximum : désépingle-en un d'abord`);
    const existing = await this.prisma.conversationPin.findUnique({ where: { conversationId_messageId: { conversationId, messageId } } });
    if (!existing) {
      await this.prisma.conversationPin.create({ data: { conversationId, messageId, pinnedById: actor.userId } });
      // Une ligne dans le fil, comme Discord : « X a épinglé un message ».
      const row = await this.prisma.message.create({ data: { conversationId, senderId: actor.userId, type: 'SYSTEM', content: `📌 ${actor.username} a épinglé un message` }, include: MESSAGE_INCLUDE });
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: row.createdAt } });
      await this.publish(conv, 'message:new', messageToDto(row));
    }
    return { ok: true, pinnedMessageIds: await this.publishPins(conv) };
  }

  async removePin(actor: Actor, conversationId: string, messageId: string) {
    const conv = await this.canPin(actor, conversationId);
    await this.prisma.conversationPin.deleteMany({ where: { conversationId, messageId } });
    return { ok: true, pinnedMessageIds: await this.publishPins(conv) };
  }

  /** Ancienne route (un seul message épinglé) : `messageId` ajoute une épingle, `null` les retire toutes. */
  async pinMessage(actor: Actor, conversationId: string, messageId: string | null) {
    if (messageId) return this.addPin(actor, conversationId, messageId);
    const conv = await this.canPin(actor, conversationId);
    await this.prisma.conversationPin.deleteMany({ where: { conversationId } });
    return { ok: true, pinnedMessageIds: await this.publishPins(conv) };
  }

  // ------------------------------------------------------------------ message du jour d'un canal

  /** Écrire (ou effacer, avec un texte vide) le message du jour d'un canal : réservé à l'équipe. */
  async setMotd(actor: Actor, conversationId: string, text: string | null) {
    const { conv } = await this.access(actor, conversationId);
    if (conv.type !== 'CHANNEL') throw new BadRequestException('Seuls les canaux ont un message du jour');
    if (!isStaff(actor.role)) throw new ForbiddenException("Réservé à l'équipe");
    const motd = (text ?? '').trim().slice(0, MOTD_MAX) || null;
    const changed = motd !== conv.motd;
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { motd, motdAt: motd && changed ? new Date() : motd ? conv.motdAt : null } });
    if (changed) this.emit('channel:changed', { id: conversationId });
    return this.get(actor, conversationId);
  }

  async setSettings(actor: Actor, conversationId: string, data: { mutedUntil?: string | null; pinned?: boolean; archived?: boolean }) {
    await this.access(actor, conversationId);
    const patch: Prisma.ConversationMemberUpdateManyMutationInput = {};
    if (data.mutedUntil !== undefined) patch.mutedUntil = data.mutedUntil ? new Date(data.mutedUntil) : null;
    if (typeof data.pinned === 'boolean') patch.pinned = data.pinned;
    if (typeof data.archived === 'boolean') patch.archived = data.archived;
    await this.prisma.conversationMember.updateMany({ where: { conversationId, userId: actor.userId }, data: patch });
    return this.get(actor, conversationId);
  }

  async unreadTotals(actor: Actor) {
    const rows = await this.prisma.$queryRaw<{ n: number; mentions: number }[]>`
      SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE ${actor.userId} = ANY(m."mentionIds"))::int AS mentions
      FROM "Message" m JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${actor.userId}
      WHERE m."createdAt" > cm."lastReadAt" AND m."senderId" <> ${actor.userId} AND m."deletedAt" IS NULL
        AND (cm."mutedUntil" IS NULL OR cm."mutedUntil" < now()) AND cm.archived = false`;
    return { total: rows[0]?.n ?? 0, mentions: rows[0]?.mentions ?? 0 };
  }

  // ------------------------------------------------------------------ administration des canaux (ADMIN / OWNER)

  private assertAdmin(actor: Actor) {
    if (rank(actor.role) < rank('ADMIN')) throw new ForbiddenException('Réservé aux administrateurs');
  }

  private slugify(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'canal';
  }

  private validRole(r: unknown) {
    if (r === null || r === undefined || r === '') return null;
    if (typeof r !== 'string' || !ROLE_ORDER.includes(r)) throw new BadRequestException('Rôle invalide');
    return r as any;
  }

  async adminListChannels(actor: Actor) {
    this.assertAdmin(actor);
    const rows = await this.prisma.conversation.findMany({
      where: { type: 'CHANNEL' }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { messages: true } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, messageCount: _count.messages }));
  }

  async createChannel(actor: Actor, data: { name: string; description?: string; motd?: string | null; readRole?: string | null; writeRole?: string | null; slowModeSeconds?: number; position?: number }) {
    this.assertAdmin(actor);
    const name = (data.name ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('Donne un nom au canal');
    const base = this.slugify(name);
    let slug = base;
    for (let i = 2; await this.prisma.conversation.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
    const last = await this.prisma.conversation.findFirst({ where: { type: 'CHANNEL' }, orderBy: { position: 'desc' }, select: { position: true } });
    const channel = await this.prisma.conversation.create({
      data: {
        type: 'CHANNEL', name, slug, createdById: actor.userId,
        description: data.description?.trim().slice(0, 300) || null,
        ...(data.motd?.trim() ? { motd: data.motd.trim().slice(0, MOTD_MAX), motdAt: new Date() } : {}),
        readRole: this.validRole(data.readRole), writeRole: this.validRole(data.writeRole),
        slowModeSeconds: Math.max(0, Math.min(3600, Math.floor(Number(data.slowModeSeconds) || 0))),
        position: Number.isFinite(data.position) ? Math.floor(data.position as number) : (last?.position ?? 0) + 1,
      },
    });
    this.emit('channel:changed', { id: channel.id });
    return channel;
  }

  async updateChannel(actor: Actor, id: string, data: { name?: string; description?: string | null; motd?: string | null; readRole?: string | null; writeRole?: string | null; slowModeSeconds?: number; position?: number; archived?: boolean }) {
    this.assertAdmin(actor);
    const channel = await this.prisma.conversation.findUnique({ where: { id } });
    if (!channel || channel.type !== 'CHANNEL') throw new NotFoundException('Canal introuvable');
    const patch: Prisma.ConversationUpdateInput = {};
    if (data.name !== undefined) { const n = data.name.trim().slice(0, 80); if (!n) throw new BadRequestException('Le nom ne peut pas être vide'); patch.name = n; }
    if (data.description !== undefined) patch.description = data.description?.trim().slice(0, 300) || null;
    if (data.motd !== undefined) {
      const motd = (data.motd ?? '').trim().slice(0, MOTD_MAX) || null;
      if (motd !== channel.motd) { patch.motd = motd; patch.motdAt = motd ? new Date() : null; }
    }
    if (data.readRole !== undefined) patch.readRole = this.validRole(data.readRole);
    if (data.writeRole !== undefined) patch.writeRole = this.validRole(data.writeRole);
    if (data.slowModeSeconds !== undefined) patch.slowModeSeconds = Math.max(0, Math.min(3600, Math.floor(Number(data.slowModeSeconds) || 0)));
    if (Number.isFinite(data.position)) patch.position = Math.floor(data.position as number);
    if (typeof data.archived === 'boolean') {
      if (data.archived && channel.slug === 'general') throw new BadRequestException('Le canal Général ne peut pas être archivé');
      patch.archived = data.archived;
    }
    const updated = await this.prisma.conversation.update({ where: { id }, data: patch });
    this.emit('channel:changed', { id });
    return updated;
  }

  async deleteChannel(actor: Actor, id: string) {
    this.assertAdmin(actor);
    const channel = await this.prisma.conversation.findUnique({ where: { id } });
    if (!channel || channel.type !== 'CHANNEL') throw new NotFoundException('Canal introuvable');
    if (channel.slug === 'general') throw new BadRequestException('Le canal Général ne peut pas être supprimé (archive-le plutôt, ou modifie ses droits)');
    await this.prisma.conversation.delete({ where: { id } });
    this.emit('channel:changed', { id, removed: true });
    return { ok: true };
  }

  // ------------------------------------------------------------------ vider un canal (ADMIN / OWNER)

  private parseSince(since?: string | null): Date | null {
    if (since === undefined || since === null || since === '') return null;
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Date invalide');
    return d;
  }

  private async channelOrThrow(id: string) {
    const channel = await this.prisma.conversation.findUnique({ where: { id } });
    if (!channel || channel.type !== 'CHANNEL') throw new NotFoundException('Canal introuvable');
    return channel;
  }

  /** Combien de messages seraient supprimés (tous, ou depuis une date) : montré dans la confirmation avant de vider un canal. */
  async purgePreview(actor: Actor, id: string, since?: string | null) {
    this.assertAdmin(actor);
    await this.channelOrThrow(id);
    const from = this.parseSince(since);
    const [count, total, oldest] = await Promise.all([
      this.prisma.message.count({ where: { conversationId: id, ...(from ? { createdAt: { gte: from } } : {}) } }),
      this.prisma.message.count({ where: { conversationId: id } }),
      this.prisma.message.findFirst({ where: { conversationId: id, ...(from ? { createdAt: { gte: from } } : {}) }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return { count, total, oldest: oldest?.createdAt ?? null, since: from };
  }

  /**
   * Vide un canal : supprime DÉFINITIVEMENT ses messages (tous, ou ceux envoyés depuis une date), avec leurs réactions et leurs épingles.
   * `confirm` doit être le nom exact du canal. Pour le canal Général, l'ancien chat public est vidé de la même façon, sinon la
   * migration du démarrage (MessengerMigrationService) recopierait les anciens messages.
   */
  async purgeChannel(actor: Actor, id: string, body: { since?: string | null; confirm?: string }) {
    this.assertAdmin(actor);
    const channel = await this.channelOrThrow(id);
    if ((body.confirm ?? '').trim().toLowerCase() !== (channel.name ?? '').trim().toLowerCase()) {
      throw new BadRequestException('Confirmation incorrecte : écris exactement le nom du canal pour le vider');
    }
    const from = this.parseSince(body.since);
    const where = { conversationId: id, ...(from ? { createdAt: { gte: from } } : {}) };
    const { count } = await this.prisma.message.deleteMany({ where });
    if (channel.slug === 'general') {
      await this.prisma.chatMessage.deleteMany({ where: from ? { createdAt: { gte: from } } : {} }).catch((err) => this.logger.warn(`Ancien chat non vidé : ${err?.message}`));
    }
    const newest = await this.prisma.message.findFirst({ where: { conversationId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    await this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: newest?.createdAt ?? channel.createdAt, pinnedMessageId: null } });
    await this.publish(channel, 'conversation:purged', { conversationId: id, since: from });
    await this.publishPins(channel);
    this.emit('channel:changed', { id });
    this.logger.warn(`Canal « ${channel.name} » vidé par ${actor.username} : ${count} message(s)${from ? ` depuis ${from.toISOString()}` : ''}`);
    return { ok: true, deleted: count, name: channel.name, since: from };
  }

  /** Amis et personnes avec qui on discute : pour afficher leur présence. */
  async peerIds(userId: string) {
    const [friends, directs] = await Promise.all([
      this.prisma.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] }, select: { requesterId: true, addresseeId: true } }),
      this.prisma.conversation.findMany({ where: { type: 'DIRECT', members: { some: { userId } } }, select: { members: { select: { userId: true } } } }),
    ]);
    const ids = new Set<string>();
    friends.forEach((f) => ids.add(f.requesterId === userId ? f.addresseeId : f.requesterId));
    directs.forEach((c) => c.members.forEach((m) => { if (m.userId !== userId) ids.add(m.userId); }));
    return [...ids];
  }
}
