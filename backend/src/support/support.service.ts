import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { WikiService } from '../wiki/wiki.service';
import { DEFAULT_CANNED, DEFAULT_CATEGORIES, DEFAULT_SUPPORT, SupportConfig, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL, sanitizeSupportConfig } from './support-config';
import { SupportAiService } from './support-ai.service';

const STAFF_ROLES = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
export const isStaffRole = (role?: string | null) => !!role && STAFF_ROLES.includes(role);

export interface Actor { userId: string; username: string; role: string }
export interface Attachment { url: string; name: string; kind: 'image' | 'file'; size?: number }

const USER_SELECT = { id: true, username: true, avatarUrl: true, role: true } as const;
const SETTING_KEY = 'support';
const ATTACHMENT_URL = /^\/api\/(covers\/[\w.-]+|(chat|messenger)\/files\/[^\s]+)$/;
const PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const STATUSES: TicketStatus[] = ['OPEN', 'ANSWERED', 'RESOLVED', 'CLOSED'];

function cleanAttachments(input: unknown): Attachment[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 4).flatMap((a: any) => {
    if (!a || typeof a.url !== 'string' || !ATTACHMENT_URL.test(a.url)) return [];
    return [{ url: a.url, name: String(a.name ?? 'fichier').slice(0, 120), kind: a.kind === 'image' ? ('image' as const) : ('file' as const), size: Number.isFinite(a.size) ? Math.max(0, Math.floor(a.size)) : undefined }];
  });
}

const stripForPreview = (s: string) => s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Billets de support : un membre ouvre un billet (depuis la page Support ou depuis le canal de chat), l'équipe y répond en privé,
 * le fil garde tout l'historique. Les billets restent liés au wiki (suggestions avant l'envoi, articles insérables dans les
 * réponses) et au canal Support (l'historique du chat est joint au billet).
 */
@Injectable()
export class SupportService implements OnModuleInit {
  private readonly log = new Logger(SupportService.name);
  private readonly createdAt = new Map<string, number[]>();

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    private mail: MailService,
    private wiki: WikiService,
    private ai: SupportAiService,
  ) {}

  async onModuleInit() {
    // Catégories et réponses types de départ, créées une seule fois : le staff les modifie ensuite à sa guise.
    if ((await this.prisma.supportCategory.count()) === 0) {
      await this.prisma.supportCategory.createMany({ data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })) });
    }
    if ((await this.prisma.supportCanned.count()) === 0) {
      await this.prisma.supportCanned.createMany({ data: DEFAULT_CANNED.map((c, i) => ({ ...c, order: i })) });
    }
  }

  // ------------------------------------------------------------------ réglages

  async config(): Promise<SupportConfig> {
    const stored = await this.settings.get<Partial<SupportConfig>>(SETTING_KEY);
    const merged = { ...DEFAULT_SUPPORT, ...(stored ?? {}) };
    // L'ancien nom par défaut de l'assistant devient « Seeduction ».
    if (merged.botName === 'Assistant SDT') merged.botName = DEFAULT_SUPPORT.botName;
    return merged;
  }

  async saveConfig(input: any): Promise<SupportConfig> {
    const next = sanitizeSupportConfig(input, await this.config());
    await this.settings.set(SETTING_KEY, next);
    return next;
  }

  // ------------------------------------------------------------------ aperçu pour les membres

  async categories(all = false) {
    return this.prisma.supportCategory.findMany({ where: all ? {} : { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
  }

  /** Suggestions du wiki pendant qu'on décrit son problème : souvent, la réponse y est déjà. */
  async suggest(q: string) {
    return this.wiki.ranked(q, 5, 2);
  }

  async badge(actor: Actor) {
    const mine = await this.prisma.supportTicket.count({ where: { requesterId: actor.userId, unreadByRequester: true, status: { not: 'CLOSED' } } });
    let staff: number | null = null;
    if (isStaffRole(actor.role)) staff = await this.prisma.supportTicket.count({ where: { status: 'OPEN' } });
    return { mine, staff };
  }

  // ------------------------------------------------------------------ billets (membre)

  readonly ticketInclude = {
    requester: { select: USER_SELECT },
    assignee: { select: USER_SELECT },
    category: { select: { id: true, name: true, icon: true } },
  } satisfies Prisma.SupportTicketInclude;

  private dto(t: Prisma.SupportTicketGetPayload<{ include: SupportService['ticketInclude'] }>, staff: boolean) {
    return {
      id: t.id, number: t.number, subject: t.subject, status: t.status, priority: t.priority, source: t.source,
      category: t.category, requester: t.requester, assignee: staff ? t.assignee : (t.assignee ? { id: t.assignee.id, username: t.assignee.username, avatarUrl: t.assignee.avatarUrl, role: t.assignee.role } : null),
      unread: staff ? t.unreadByStaff : t.unreadByRequester,
      lastReplyAt: t.lastReplyAt, lastReplyBy: t.lastReplyBy, createdAt: t.createdAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt,
      rating: t.rating, ratingComment: t.ratingComment, firstResponseAt: t.firstResponseAt,
    };
  }

  async myTickets(actor: Actor, filter: 'open' | 'all' = 'all') {
    const rows = await this.prisma.supportTicket.findMany({
      where: { requesterId: actor.userId, ...(filter === 'open' ? { status: { in: ['OPEN', 'ANSWERED'] } } : {}) },
      orderBy: { lastReplyAt: 'desc' }, take: 100, include: this.ticketInclude,
    });
    return rows.map((t) => this.dto(t, false));
  }

  private checkCreateRate(userId: string) {
    const now = Date.now();
    const recent = (this.createdAt.get(userId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 4) throw new BadRequestException('Tu as déjà ouvert plusieurs billets cette heure. Réponds plutôt dans un de tes billets, ou réessaie plus tard.');
    recent.push(now);
    this.createdAt.set(userId, recent);
  }

  /** Dernier échange du membre avec l'assistant / l'équipe dans le canal Support, pour le joindre au billet. */
  async chatTranscript(userId: string, channelId: string | null, botUserId: string | null): Promise<string> {
    if (!channelId) return '';
    const since = new Date(Date.now() - 6 * 3_600_000);
    const mine = await this.prisma.message.findMany({
      where: { conversationId: channelId, senderId: userId, deletedAt: null, createdAt: { gt: since }, type: { in: ['TEXT', 'IMAGE', 'FILE'] } },
      orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, content: true, createdAt: true, type: true },
    });
    if (mine.length === 0) return '';
    const ids = mine.map((m) => m.id);
    const replies = await this.prisma.message.findMany({
      where: { conversationId: channelId, deletedAt: null, createdAt: { gt: since }, OR: [{ replyToId: { in: ids } }, { mentionIds: { has: userId }, senderId: { not: userId } }], type: { in: ['TEXT', 'BOT_ANSWER'] } },
      select: { content: true, createdAt: true, senderId: true, type: true, sender: { select: { username: true } } },
    });
    const lines = [
      ...mine.map((m) => ({ at: m.createdAt, who: 'Membre', text: m.type === 'TEXT' ? m.content : `[${m.type === 'IMAGE' ? 'image' : 'fichier'}]` })),
      ...replies.map((m) => ({ at: m.createdAt, who: m.senderId === botUserId || m.type === 'BOT_ANSWER' ? 'Assistant' : `Équipe (${m.sender.username})`, text: m.content })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    return lines.map((l) => `[${l.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}] ${l.who} : ${l.text.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n');
  }

  async create(actor: Actor, body: { subject?: string; categoryId?: string; content?: string; attachments?: unknown; fromChat?: boolean }, extra: { channelId?: string | null; botUserId?: string | null } = {}) {
    const cfg = await this.config();
    if (!cfg.enabled) throw new ForbiddenException('Le support est temporairement fermé');
    const subject = (body.subject ?? '').trim().slice(0, 140);
    const content = (body.content ?? '').trim();
    if (subject.length < 4) throw new BadRequestException('Donne un titre à ton billet (4 caractères minimum)');
    if (stripForPreview(content).length < 10) throw new BadRequestException('Décris ton problème (10 caractères minimum)');
    if (content.length > 8000) throw new BadRequestException('Description trop longue (8 000 caractères maximum)');
    let categoryId: string | null = null;
    if (body.categoryId) {
      const cat = await this.prisma.supportCategory.findFirst({ where: { id: body.categoryId, active: true }, select: { id: true } });
      if (!cat) throw new BadRequestException('Catégorie inconnue');
      categoryId = cat.id;
    }
    const open = await this.prisma.supportTicket.count({ where: { requesterId: actor.userId, status: { in: ['OPEN', 'ANSWERED'] } } });
    if (open >= cfg.maxOpenPerMember) throw new BadRequestException(`Tu as déjà ${open} billets ouverts : attends leur résolution ou réponds directement dedans.`);
    this.checkCreateRate(actor.userId);

    const transcript = body.fromChat ? await this.chatTranscript(actor.userId, extra.channelId ?? null, extra.botUserId ?? null) : '';
    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject, requesterId: actor.userId, categoryId, source: body.fromChat ? 'CHAT' : 'WEB', unreadByStaff: true, unreadByRequester: false,
        messages: {
          create: [
            { authorId: actor.userId, kind: 'MEMBER', content, attachments: cleanAttachments(body.attachments) as any },
            ...(transcript ? [{ kind: 'CHAT' as const, content: transcript, authorId: null }] : []),
          ],
        },
      },
      include: this.ticketInclude,
    });
    await this.prisma.supportChatEvent.create({ data: { userId: actor.userId, kind: body.fromChat ? 'TICKET' : 'TICKET_WEB' } }).catch(() => {});
    if (cfg.notifyStaff) void this.notifyStaffNew(ticket.number, ticket.subject, actor.username, ticket.category?.name ?? null, ticket.id);
    return this.dto(ticket, false);
  }

  /** Billet ouvert par l'équipe pour un membre (depuis un message du canal Support) : l'équipe le prend en charge d'emblée. */
  async createForMember(staff: Actor, d: { memberId: string; subject: string; content: string; transcript?: string }) {
    const member = await this.prisma.user.findUnique({ where: { id: d.memberId }, select: { id: true, username: true } });
    if (!member) throw new NotFoundException('Membre introuvable');
    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: d.subject.trim().slice(0, 140), requesterId: member.id, source: 'STAFF', assigneeId: staff.userId, unreadByStaff: false, unreadByRequester: true,
        messages: {
          create: [
            { authorId: member.id, kind: 'MEMBER', content: d.content.slice(0, 8000) },
            ...(d.transcript ? [{ kind: 'CHAT' as const, content: d.transcript, authorId: null }] : []),
            { kind: 'EVENT' as const, content: `Billet ouvert par ${staff.username} depuis le canal Support`, authorId: staff.userId },
          ],
        },
      },
      include: this.ticketInclude,
    });
    await this.notifications.notify({ userId: member.id, type: 'SUPPORT', title: `🎫 L'équipe a ouvert le billet #${ticket.number} pour toi`, body: ticket.subject.slice(0, 120), link: `/support/${ticket.id}` }).catch(() => {});
    return this.dto(ticket, true);
  }

  private async notifyStaffNew(number: number, subject: string, username: string, category: string | null, ticketId: string) {
    try {
      const staff = await this.prisma.user.findMany({ where: { role: { in: STAFF_ROLES as any }, status: 'ACTIVE', parentId: null }, select: { id: true } });
      await this.prisma.notification.createMany({
        data: staff.map((s) => ({ userId: s.id, type: 'SUPPORT' as const, title: `🎫 Nouveau billet #${number}`, body: `${username} : ${subject}${category ? ` (${category})` : ''}`.slice(0, 160), link: `/support/${ticketId}` })),
      });
    } catch (err: any) { this.log.warn(`Notification du staff échouée : ${err?.message}`); }
  }

  private async load(id: string) {
    const t = await this.prisma.supportTicket.findFirst({ where: { OR: [{ id }, ...(Number.isInteger(Number(id)) ? [{ number: Number(id) }] : [])] }, include: this.ticketInclude });
    if (!t) throw new NotFoundException('Billet introuvable');
    return t;
  }

  /** Un billet : visible par son auteur et par le staff. */
  async get(actor: Actor, id: string) {
    const t = await this.load(id);
    const staff = isStaffRole(actor.role);
    if (!staff && t.requesterId !== actor.userId) throw new NotFoundException('Billet introuvable');
    const rows = await this.prisma.supportTicketMessage.findMany({
      where: { ticketId: t.id, ...(staff ? {} : { internal: false }) },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: USER_SELECT } },
    });
    // Ouvrir son billet fait disparaître la pastille « nouveau » côté lecteur.
    if (staff ? t.unreadByStaff : t.unreadByRequester) {
      await this.prisma.supportTicket.update({ where: { id: t.id }, data: staff ? { unreadByStaff: false } : { unreadByRequester: false }, select: { id: true } });
    }
    return {
      ...this.dto({ ...t, ...(staff ? { unreadByStaff: false } : { unreadByRequester: false }) }, staff),
      messages: rows.map((m) => ({
        id: m.id, kind: m.kind, internal: m.internal, content: m.content, attachments: (m.attachments as Attachment[] | null) ?? [], createdAt: m.createdAt,
        author: m.author, fromStaff: m.kind === 'STAFF',
      })),
    };
  }

  private async event(ticketId: string, text: string, internal = false, authorId: string | null = null) {
    await this.prisma.supportTicketMessage.create({ data: { ticketId, kind: 'EVENT', internal, content: text, authorId } });
  }

  async reply(actor: Actor, id: string, body: { content?: string; attachments?: unknown; internal?: boolean; status?: string }) {
    const t = await this.load(id);
    const staff = isStaffRole(actor.role);
    if (!staff && t.requesterId !== actor.userId) throw new NotFoundException('Billet introuvable');
    const content = (body.content ?? '').trim();
    const attachments = cleanAttachments(body.attachments);
    if (!content && attachments.length === 0) throw new BadRequestException('Écris ton message');
    if (content.length > 8000) throw new BadRequestException('Message trop long (8 000 caractères maximum)');
    if (t.status === 'CLOSED' && !staff) throw new BadRequestException('Ce billet est fermé : ouvre un nouveau billet si le problème revient.');
    const internal = staff && body.internal === true;

    await this.prisma.supportTicketMessage.create({ data: { ticketId: t.id, authorId: actor.userId, kind: staff && t.requesterId !== actor.userId ? 'STAFF' : 'MEMBER', internal, content, attachments: attachments as any } });
    if (internal) return this.get(actor, t.id); // note privée : ne change rien pour le membre

    const now = new Date();
    const data: Prisma.SupportTicketUncheckedUpdateInput = { lastReplyAt: now };
    if (staff && t.requesterId !== actor.userId) {
      const wanted = STATUSES.includes(body.status as TicketStatus) ? (body.status as TicketStatus) : null;
      data.status = wanted ?? 'ANSWERED';
      data.lastReplyBy = 'STAFF';
      data.unreadByRequester = true;
      data.unreadByStaff = false;
      if (!t.firstResponseAt) data.firstResponseAt = now;
      if (!t.assigneeId) data.assigneeId = actor.userId; // celui qui répond prend le billet
      if (data.status === 'RESOLVED') data.resolvedAt = now;
      if (data.status === 'CLOSED') data.closedAt = now;
    } else {
      // Le membre répond : le billet redevient « ouvert », même s'il était résolu.
      data.lastReplyBy = 'MEMBER';
      data.unreadByStaff = true;
      data.unreadByRequester = false;
      if (t.status !== 'OPEN') { data.status = 'OPEN'; data.resolvedAt = null; if (t.status === 'RESOLVED') await this.event(t.id, 'Billet rouvert par le membre', false, actor.userId); }
    }
    await this.prisma.supportTicket.update({ where: { id: t.id }, data });

    if (staff && t.requesterId !== actor.userId) void this.notifyMember(t, actor, content, (data.status as TicketStatus) ?? 'ANSWERED');
    else void this.notifyAssignee(t, actor, content);
    return this.get(actor, t.id);
  }

  private async notifyMember(t: { id: string; number: number; subject: string; requesterId: string }, actor: Actor, content: string, status: TicketStatus) {
    try {
      const preview = stripForPreview(content).slice(0, 140);
      await this.notifications.notify({ userId: t.requesterId, type: 'SUPPORT', title: `🎫 Réponse à ton billet #${t.number}`, body: `${actor.username} : ${preview || t.subject}`, link: `/support/${t.id}` });
      const cfg = await this.config();
      if (cfg.emailOnReply && this.mail.enabled) {
        const user = await this.prisma.user.findUnique({ where: { id: t.requesterId }, select: { email: true, parentId: true, username: true } });
        if (user?.email && !user.parentId && !/@(localhost|seeduction\.local)$/i.test(user.email)) {
          const url = `${this.mail.siteUrl()}/support/${t.id}`;
          await this.mail.send(user.email, `Seeduction – réponse à ton billet #${t.number}`, `Bonjour ${user.username},\n\nL'équipe a répondu à ton billet « ${t.subject} » (${TICKET_STATUS_LABEL[status] ?? status}) :\n\n${preview}\n\nLire et répondre : ${url}\n`);
        }
      }
    } catch (err: any) { this.log.warn(`Notification du membre échouée : ${err?.message}`); }
  }

  private async notifyAssignee(t: { id: string; number: number; subject: string; assigneeId: string | null }, actor: Actor, content: string) {
    try {
      if (!t.assigneeId || t.assigneeId === actor.userId) return;
      await this.notifications.notify({ userId: t.assigneeId, type: 'SUPPORT', title: `🎫 ${actor.username} a répondu au billet #${t.number}`, body: stripForPreview(content).slice(0, 140) || t.subject, link: `/support/${t.id}` });
    } catch (err: any) { this.log.warn(`Notification de l'assigné échouée : ${err?.message}`); }
  }

  /** Le membre règle lui-même son billet (« c'est résolu »), le ferme, ou le rouvre. */
  async setMyStatus(actor: Actor, id: string, status: 'RESOLVED' | 'CLOSED' | 'OPEN') {
    const t = await this.load(id);
    if (t.requesterId !== actor.userId) throw new NotFoundException('Billet introuvable');
    if (t.status === 'CLOSED') throw new BadRequestException('Ce billet est fermé');
    if (status === 'OPEN') {
      if (t.status === 'OPEN') return this.get(actor, id);
      await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'OPEN', resolvedAt: null, unreadByStaff: true, lastReplyAt: new Date(), lastReplyBy: 'MEMBER' } });
      await this.event(t.id, 'Billet rouvert par le membre', false, actor.userId);
    } else {
      await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status, resolvedAt: new Date(), ...(status === 'CLOSED' ? { closedAt: new Date() } : {}), unreadByStaff: false } });
      await this.event(t.id, status === 'RESOLVED' ? 'Le membre indique que son problème est résolu' : 'Billet fermé par le membre', false, actor.userId);
    }
    return this.get(actor, id);
  }

  async rate(actor: Actor, id: string, rating: number, comment?: string) {
    const t = await this.load(id);
    if (t.requesterId !== actor.userId) throw new NotFoundException('Billet introuvable');
    if (t.status !== 'RESOLVED' && t.status !== 'CLOSED') throw new BadRequestException('Tu pourras noter le support une fois le billet résolu');
    if (t.rating) throw new BadRequestException('Tu as déjà noté ce billet');
    const n = Math.floor(Number(rating));
    if (!(n >= 1 && n <= 5)) throw new BadRequestException('La note va de 1 à 5');
    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { rating: n, ratingComment: (comment ?? '').trim().slice(0, 500) || null } });
    return this.get(actor, id);
  }

  // ------------------------------------------------------------------ côté équipe

  async queue(params: { status?: string; assignee?: string; categoryId?: string; priority?: string; q?: string; page?: number }, actor: Actor) {
    const where: Prisma.SupportTicketWhereInput = {};
    if (params.status === 'active') where.status = { in: ['OPEN', 'ANSWERED'] };
    else if (STATUSES.includes(params.status as TicketStatus)) where.status = params.status as TicketStatus;
    if (params.assignee === 'me') where.assigneeId = actor.userId;
    else if (params.assignee === 'none') where.assigneeId = null;
    else if (params.assignee) where.assigneeId = params.assignee;
    if (params.categoryId) where.categoryId = params.categoryId;
    if (PRIORITIES.includes(params.priority as TicketPriority)) where.priority = params.priority as TicketPriority;
    const q = (params.q ?? '').trim();
    if (q) {
      const num = /^#?(\d{1,9})$/.exec(q);
      where.OR = [
        ...(num ? [{ number: Number(num[1]) }] : []),
        { subject: { contains: q, mode: 'insensitive' } },
        { requester: { username: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const take = 30;
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where, include: this.ticketInclude, take, skip: (page - 1) * take,
        // Urgent d'abord, puis les plus anciens en attente : la file se lit de haut en bas.
        orderBy: [{ lastReplyAt: 'desc' }],
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const weight = { URGENT: 3, HIGH: 2, NORMAL: 1, LOW: 0 } as const;
    const waiting = (t: { status: string }) => (t.status === 'OPEN' ? 1 : 0);
    rows.sort((a, b) => waiting(b) - waiting(a) || weight[b.priority] - weight[a.priority] || a.lastReplyAt.getTime() - b.lastReplyAt.getTime());
    return { tickets: rows.map((t) => this.dto(t, true)), total, page, pages: Math.max(1, Math.ceil(total / take)) };
  }

  async counts() {
    const rows = await this.prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } });
    const by = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const [unassigned, urgent] = await Promise.all([
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'ANSWERED'] }, assigneeId: null } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'ANSWERED'] }, priority: 'URGENT' } }),
    ]);
    return { OPEN: by.OPEN ?? 0, ANSWERED: by.ANSWERED ?? 0, RESOLVED: by.RESOLVED ?? 0, CLOSED: by.CLOSED ?? 0, unassigned, urgent };
  }

  async staffUpdate(actor: Actor, id: string, body: { status?: string; priority?: string; categoryId?: string | null; assigneeId?: string | null }) {
    const t = await this.load(id);
    const data: Prisma.SupportTicketUncheckedUpdateInput = {};
    const events: { text: string; internal: boolean }[] = [];
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as TicketStatus)) throw new BadRequestException('Statut invalide');
      if (body.status !== t.status) {
        data.status = body.status as TicketStatus;
        if (body.status === 'RESOLVED') data.resolvedAt = new Date();
        if (body.status === 'CLOSED') data.closedAt = new Date();
        if (body.status === 'OPEN' || body.status === 'ANSWERED') { data.resolvedAt = null; data.closedAt = null; }
        if (body.status === 'RESOLVED' || body.status === 'CLOSED') data.unreadByRequester = true;
        events.push({ text: `Statut : ${TICKET_STATUS_LABEL[t.status]} → ${TICKET_STATUS_LABEL[body.status]} (${actor.username})`, internal: false });
      }
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority as TicketPriority)) throw new BadRequestException('Priorité invalide');
      if (body.priority !== t.priority) { data.priority = body.priority as TicketPriority; events.push({ text: `Priorité : ${TICKET_PRIORITY_LABEL[t.priority]} → ${TICKET_PRIORITY_LABEL[body.priority]} (${actor.username})`, internal: true }); }
    }
    if (body.categoryId !== undefined) {
      if (body.categoryId) {
        const cat = await this.prisma.supportCategory.findUnique({ where: { id: body.categoryId } });
        if (!cat) throw new BadRequestException('Catégorie inconnue');
        if (cat.id !== t.categoryId) { data.categoryId = cat.id; events.push({ text: `Catégorie : ${cat.name} (${actor.username})`, internal: true }); }
      } else if (t.categoryId) { data.categoryId = null; events.push({ text: `Catégorie retirée (${actor.username})`, internal: true }); }
    }
    if (body.assigneeId !== undefined) {
      if (body.assigneeId) {
        const u = await this.prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, username: true, role: true } });
        if (!u || !isStaffRole(u.role)) throw new BadRequestException('On ne peut assigner un billet qu\'à un membre de l\'équipe');
        if (u.id !== t.assigneeId) {
          data.assigneeId = u.id;
          events.push({ text: u.id === actor.userId ? `${actor.username} prend le billet en charge` : `Assigné à ${u.username} par ${actor.username}`, internal: false });
          if (u.id !== actor.userId) void this.notifications.notify({ userId: u.id, type: 'SUPPORT', title: `🎫 Billet #${t.number} assigné`, body: t.subject.slice(0, 120), link: `/support/${t.id}` }).catch(() => {});
        }
      } else if (t.assigneeId) { data.assigneeId = null; events.push({ text: `Billet remis dans la file (${actor.username})`, internal: true }); }
    }
    if (Object.keys(data).length === 0) return this.get(actor, id);
    await this.prisma.supportTicket.update({ where: { id: t.id }, data });
    for (const e of events) await this.event(t.id, e.text, e.internal, actor.userId);
    return this.get(actor, id);
  }

  /** Brouillon de réponse écrit par l'IA d'après le fil du billet et le wiki (le staff relit avant d'envoyer). */
  async draftReply(actor: Actor, id: string) {
    const t = await this.load(id);
    const rows = await this.prisma.supportTicketMessage.findMany({ where: { ticketId: t.id, kind: { in: ['MEMBER', 'STAFF', 'CHAT'] } }, orderBy: { createdAt: 'asc' } });
    const thread = rows.map((m) => ({ who: (m.kind === 'STAFF' ? (m.internal ? 'note' : 'staff') : 'member') as 'member' | 'staff' | 'note', text: m.kind === 'CHAT' ? `(historique du chat de support)\n${m.content}` : stripForPreview(m.content) }));
    return this.ai.draftTicketReply(await this.config(), { subject: t.subject, category: t.category?.name ?? null }, thread);
  }

  async stats(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [created, resolved, rated, tickets, events, byCategory, openNow] = await Promise.all([
      this.prisma.supportTicket.count({ where: { createdAt: { gt: since } } }),
      this.prisma.supportTicket.count({ where: { resolvedAt: { gt: since } } }),
      this.prisma.supportTicket.aggregate({ where: { rating: { not: null }, createdAt: { gt: since } }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.supportTicket.findMany({ where: { createdAt: { gt: since } }, select: { createdAt: true, firstResponseAt: true, resolvedAt: true } }),
      this.prisma.supportChatEvent.groupBy({ by: ['kind'], where: { createdAt: { gt: since } }, _count: { _all: true } }),
      this.prisma.supportTicket.groupBy({ by: ['categoryId'], where: { createdAt: { gt: since } }, _count: { _all: true } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'ANSWERED'] } } }),
    ]);
    const avgMin = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length / 60_000) : null);
    const cats = await this.prisma.supportCategory.findMany({ select: { id: true, name: true, icon: true } });
    const ev = Object.fromEntries(events.map((e) => [e.kind, e._count._all]));
    return {
      days, created, resolved, openNow,
      avgFirstResponseMin: avgMin(tickets.filter((t) => t.firstResponseAt).map((t) => t.firstResponseAt!.getTime() - t.createdAt.getTime())),
      avgResolutionMin: avgMin(tickets.filter((t) => t.resolvedAt).map((t) => t.resolvedAt!.getTime() - t.createdAt.getTime())),
      satisfaction: rated._avg.rating ? Math.round(rated._avg.rating * 10) / 10 : null, ratings: rated._count.rating,
      byCategory: byCategory.map((r) => ({ category: cats.find((c) => c.id === r.categoryId) ?? null, count: r._count._all })).sort((a, b) => b.count - a.count),
      assistant: { answers: ev.ANSWER ?? 0, solved: ev.RESOLVED ?? 0, notSolved: ev.NOT_SOLVED ?? 0, offers: ev.OFFER ?? 0, ticketsFromChat: ev.TICKET ?? 0, human: ev.HUMAN ?? 0, handoffs: ev.HANDOFF ?? 0 },
    };
  }

  // ------------------------------------------------------------------ catégories et réponses types

  async saveCategory(id: string | null, data: { name?: string; icon?: string | null; description?: string | null; order?: number; active?: boolean }) {
    const payload: Prisma.SupportCategoryUpdateInput = {};
    if (data.name !== undefined) { const n = data.name.trim().slice(0, 60); if (!n) throw new BadRequestException('Nom requis'); payload.name = n; }
    if (data.icon !== undefined) payload.icon = data.icon?.trim().slice(0, 8) || null;
    if (data.description !== undefined) payload.description = data.description?.trim().slice(0, 200) || null;
    if (Number.isFinite(data.order)) payload.order = Math.floor(data.order as number);
    if (typeof data.active === 'boolean') payload.active = data.active;
    if (!id) {
      if (!payload.name) throw new BadRequestException('Nom requis');
      const last = await this.prisma.supportCategory.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
      return this.prisma.supportCategory.create({ data: { name: payload.name as string, icon: (payload.icon as string) ?? null, description: (payload.description as string) ?? null, order: (payload.order as number) ?? (last?.order ?? 0) + 1, active: (payload.active as boolean) ?? true } });
    }
    return this.prisma.supportCategory.update({ where: { id }, data: payload });
  }

  async deleteCategory(id: string) {
    await this.prisma.supportCategory.delete({ where: { id } }); // les billets gardent leur texte, sans catégorie (SetNull)
    return { ok: true };
  }

  canned() {
    return this.prisma.supportCanned.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  }

  async saveCanned(id: string | null, data: { title?: string; content?: string; order?: number }) {
    const title = (data.title ?? '').trim().slice(0, 80);
    const content = (data.content ?? '').trim().slice(0, 4000);
    if (!id) {
      if (!title || !content) throw new BadRequestException('Titre et texte requis');
      return this.prisma.supportCanned.create({ data: { title, content, order: Number.isFinite(data.order) ? Math.floor(data.order as number) : 99 } });
    }
    const payload: Prisma.SupportCannedUpdateInput = {};
    if (data.title !== undefined) { if (!title) throw new BadRequestException('Titre requis'); payload.title = title; }
    if (data.content !== undefined) { if (!content) throw new BadRequestException('Texte requis'); payload.content = content; }
    if (Number.isFinite(data.order)) payload.order = Math.floor(data.order as number);
    return this.prisma.supportCanned.update({ where: { id }, data: payload });
  }

  async deleteCanned(id: string) {
    await this.prisma.supportCanned.delete({ where: { id } });
    return { ok: true };
  }

  /** Membres de l'équipe à qui assigner un billet. */
  staffList() {
    return this.prisma.user.findMany({ where: { role: { in: STAFF_ROLES as any }, status: 'ACTIVE', parentId: null }, select: USER_SELECT, orderBy: { username: 'asc' } });
  }

  // ------------------------------------------------------------------ entretien automatique

  /** Billets sans nouvelle du membre → résolus ; résolus depuis longtemps → fermés. */
  @Cron('17 */3 * * *')
  async housekeeping() {
    try {
      const cfg = await this.config();
      const now = Date.now();
      if (cfg.autoResolveDays > 0) {
        const stale = await this.prisma.supportTicket.findMany({ where: { status: 'ANSWERED', lastReplyAt: { lt: new Date(now - cfg.autoResolveDays * 86_400_000) } }, select: { id: true, requesterId: true, number: true } });
        for (const t of stale) {
          await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), unreadByRequester: true } });
          await this.event(t.id, `Marqué résolu automatiquement : pas de réponse du membre depuis ${cfg.autoResolveDays} jours. Répondre au billet le rouvre.`);
          await this.notifications.notify({ userId: t.requesterId, type: 'SUPPORT', title: `🎫 Billet #${t.number} marqué résolu`, body: 'Sans nouvelle de ta part, nous l\'avons considéré comme résolu. Réponds-y s\'il reste un souci.', link: `/support/${t.id}` }).catch(() => {});
        }
      }
      if (cfg.autoCloseDays > 0) {
        const done = await this.prisma.supportTicket.findMany({ where: { status: 'RESOLVED', resolvedAt: { lt: new Date(now - cfg.autoCloseDays * 86_400_000) } }, select: { id: true } });
        for (const t of done) {
          await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'CLOSED', closedAt: new Date() } });
          await this.event(t.id, 'Billet fermé automatiquement.');
        }
      }
      await this.prisma.supportChatEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 120 * 86_400_000) } } });
    } catch (err: any) { this.log.warn(`Entretien du support échoué : ${err?.message}`); }
  }
}
