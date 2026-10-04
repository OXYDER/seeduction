import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { PresenceService } from '../presence/presence.service';
import { SupportAiError, SupportAiService } from './support-ai.service';
import { SupportConfig } from './support-config';
import { Actor, SupportService, isStaffRole } from './support.service';

interface SentEvent { conv: { id: string; type: string; slug: string | null }; message: any; actor: Actor }

const DEBOUNCE_MS = 2500;
const CONTEXT_MINUTES = 30;
const OFFER_COOLDOWN_MS = 10 * 60_000;

const GREETING = /^(bonjour|bonsoir|salut|coucou|hello|hey|allo|allô|yo)\W*$/i;
const THANKS = /^(merci|merci beaucoup|merci bien|thanks|thx|ok merci|super merci|parfait|nickel|top|génial|c'est bon|ça marche|ca marche|résolu|réglé|ok)\W*$/i;
const WANTS_TICKET = /\b(ticket|billet)\b|(parler|contacter|joindre|écrire|ecrire)\s+(à|a|avec)?\s*(un|une|le|la|l')?\s*(humain|personne|agent|vrai|staff|admin|modo|équipe|equipe)/i;
const NOT_SOLVED = /(toujours pas|ne (marche|fonctionne) (toujours )?pas|pas résolu|pas regl|ça ne (règle|regle|marche)|ca ne (regle|marche)|rien ne marche|aucun (effet|résultat)|même problème|meme probleme|encore le problème)/i;

/**
 * Assistant du canal « Support » : répond aux membres à partir du wiki, laisse la main à l'équipe dès qu'un de ses membres répond,
 * et propose d'ouvrir un billet quand il n'a pas pu régler le problème. Il écrit avec son propre compte (non connectable).
 */
@Injectable()
export class SupportBotService implements OnModuleInit {
  private readonly log = new Logger(SupportBotService.name);
  private bot: { id: string; username: string } | null = null;
  private channelCache: { at: number; id: string | null } | null = null;
  private staffCache: { at: number; ids: string[] } | null = null;
  private timers = new Map<string, NodeJS.Timeout>();
  private latest = new Map<string, string>();
  private busy = new Set<string>();
  private again = new Set<string>();
  private takeover = new Map<string, number>();

  constructor(private prisma: PrismaService, private messenger: MessengerService, private support: SupportService, private ai: SupportAiService, private presence: PresenceService) {}

  async onModuleInit() {
    try { await this.ensureBot(); } catch (err: any) { this.log.warn(`Compte de l'assistant non créé : ${err?.message}`); }
    this.messenger.on('message:sent', (e: SentEvent) => { this.onMessage(e).catch((err) => this.log.warn(`Assistant : ${err?.message}`)); });
  }

  // ------------------------------------------------------------------ compte de l'assistant et canal

  /**
   * Le compte de l'assistant est un « profil » de lui-même (parentId = son propre id) : il n'est jamais compté parmi les membres,
   * ne peut pas se connecter (désactivé, sans mot de passe) et n'apparaît dans aucun classement.
   */
  async ensureBot(): Promise<{ id: string; username: string }> {
    const cfg = await this.support.config();
    if (this.bot && this.bot.username === cfg.botName) return this.bot;
    let row = await this.prisma.user.findFirst({ where: { profileType: 'BOT' }, select: { id: true, username: true } });
    if (!row) {
      const id = randomUUID();
      let username = cfg.botName;
      if (await this.prisma.user.findUnique({ where: { username }, select: { id: true } })) username = `${cfg.botName} (bot)`;
      row = await this.prisma.user.create({
        data: {
          id, username, email: 'assistant@seeduction.local', passwordHash: '!', parentId: id, profileType: 'BOT', profileBlocked: true,
          status: 'DISABLED', avatarUrl: '/logo-icon.png', dmPrivacy: 'FRIENDS_ONLY',
        },
        select: { id: true, username: true },
      });
    } else if (row.username !== cfg.botName) {
      const taken = await this.prisma.user.findUnique({ where: { username: cfg.botName }, select: { id: true } });
      if (!taken) row = await this.prisma.user.update({ where: { id: row.id }, data: { username: cfg.botName }, select: { id: true, username: true } });
    }
    this.bot = row;
    return row;
  }

  async channelId(cfg?: SupportConfig): Promise<string | null> {
    if (this.channelCache && Date.now() - this.channelCache.at < 30_000) return this.channelCache.id;
    const c = cfg ?? (await this.support.config());
    let id: string | null = null;
    if (c.channelId) id = (await this.prisma.conversation.findFirst({ where: { id: c.channelId, type: 'CHANNEL' }, select: { id: true } }))?.id ?? null;
    if (!id) id = (await this.prisma.conversation.findFirst({ where: { type: 'CHANNEL', slug: 'support' }, select: { id: true } }))?.id ?? null;
    this.channelCache = { at: Date.now(), id };
    return id;
  }

  invalidate() { this.channelCache = null; }

  private async staffOnlineCount(): Promise<number> {
    if (!this.staffCache || Date.now() - this.staffCache.at > 20_000) {
      const staff = await this.prisma.user.findMany({ where: { role: { in: ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null }, select: { id: true } });
      this.staffCache = { at: Date.now(), ids: staff.map((s) => s.id) };
    }
    return this.staffCache.ids.filter((id) => this.presence.publicStatus(id) !== 'OFFLINE').length;
  }

  /** Ce que la page Support et le chat doivent savoir : canal, assistant, équipe en ligne. */
  async overview() {
    const cfg = await this.support.config();
    const [channelId, staffOnline] = await Promise.all([this.channelId(cfg), this.staffOnlineCount()]);
    const bot = await this.ensureBot().catch(() => null);
    const ai = this.ai.status(cfg);
    return {
      enabled: cfg.enabled, channelId, botUserId: bot?.id ?? null, botName: cfg.botName, aiActive: cfg.aiEnabled && ai.configured,
      staffOnline, hoursText: cfg.hoursText, welcome: cfg.welcome, maxOpenPerMember: cfg.maxOpenPerMember,
    };
  }

  /** Crée le canal « Support » s'il n'existe pas (administrateurs). */
  async createChannel(actor: Actor) {
    if (!['ADMIN', 'OWNER'].includes(actor.role)) throw new ForbiddenException('Réservé aux administrateurs');
    const existing = await this.channelId();
    if (existing) return { id: existing, created: false };
    const channel = await this.messenger.createChannel(actor, { name: 'Support', description: 'Aide en direct : l’assistant et l’équipe SDT répondent ici' });
    this.invalidate();
    return { id: channel.id, created: true };
  }

  // ------------------------------------------------------------------ réaction aux messages du canal

  private async onMessage(e: SentEvent) {
    if (e.conv.type !== 'CHANNEL') return;
    const cfg = await this.support.config();
    if (!cfg.enabled) return;
    const channelId = await this.channelId(cfg);
    if (!channelId || e.conv.id !== channelId) return;
    const bot = await this.ensureBot();
    if (e.actor.userId === bot.id) return;

    if (isStaffRole(e.actor.role)) { this.noteHumanReply(e, cfg); return; }
    if (!cfg.aiEnabled || e.message.type !== 'TEXT' || !String(e.message.content ?? '').trim()) return;
    if (!this.ai.provider(cfg) && !GREETING.test(e.message.content.trim()) && !WANTS_TICKET.test(e.message.content)) return; // sans clé IA, seules les réponses sans IA restent possibles

    this.latest.set(e.actor.userId, e.message.id);
    const prev = this.timers.get(e.actor.userId);
    if (prev) clearTimeout(prev);
    this.timers.set(e.actor.userId, setTimeout(() => {
      this.timers.delete(e.actor.userId);
      void this.run(e.actor, channelId);
    }, DEBOUNCE_MS));
  }

  /** Quand l'équipe répond à un membre (réponse directe ou mention), l'assistant se tait pour lui un moment. */
  private noteHumanReply(e: SentEvent, cfg: SupportConfig) {
    if (cfg.takeoverMinutes <= 0) return;
    const targets = new Set<string>(e.message.mentionIds ?? []);
    if (e.message.replyTo?.senderId) targets.add(e.message.replyTo.senderId);
    targets.delete(e.actor.userId);
    for (const id of targets) {
      this.takeover.set(id, Date.now() + cfg.takeoverMinutes * 60_000);
      void this.prisma.supportChatEvent.create({ data: { userId: id, kind: 'HUMAN' } }).catch(() => {});
    }
  }

  private async run(actor: Actor, channelId: string) {
    if (this.busy.has(actor.userId)) { this.again.add(actor.userId); return; }
    this.busy.add(actor.userId);
    let typing: NodeJS.Timeout | null = null;
    try {
      const cfg = await this.support.config();
      const bot = await this.ensureBot();
      const messageId = this.latest.get(actor.userId);
      if (!messageId) return;
      if ((this.takeover.get(actor.userId) ?? 0) > Date.now()) return;
      if (cfg.aiMode === 'NO_STAFF' && (await this.staffOnlineCount()) > 0) return;

      const msg = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: channelId, deletedAt: null }, select: { id: true, content: true } });
      if (!msg) return;
      const text = msg.content.trim();
      const post = (content: string, type: 'BOT_ANSWER' | 'TICKET_OFFER' | 'TEXT' = 'TEXT') => this.messenger.postAsBot(bot.id, channelId, content, { type, replyToId: msg.id, mentionIds: [actor.userId] });
      const recently = (kind: string, ms: number) => this.prisma.supportChatEvent.count({ where: { userId: actor.userId, kind, createdAt: { gt: new Date(Date.now() - ms) } } });
      const log = (kind: string) => this.prisma.supportChatEvent.create({ data: { userId: actor.userId, kind } }).catch(() => {});

      const offer = async (why: 'human' | 'attempts' | 'requested' | 'error' | 'limit') => {
        if ((await recently('OFFER', OFFER_COOLDOWN_MS)) > 0 && why !== 'requested') return;
        const online = await this.staffOnlineCount();
        const staffLine = online > 0 ? ` ${online === 1 ? 'Un membre de l’équipe est' : `${online} membres de l’équipe sont`} en ligne : il peut aussi te répondre ici.` : '';
        const lines: Record<typeof why, string> = {
          human: 'Je préfère que l’équipe SDT regarde ça de près (je n’ai pas toute l’information, ou je ne peux pas agir sur ton compte).',
          attempts: 'On dirait que mes réponses ne règlent pas complètement ton problème.',
          requested: 'Bien sûr, voici comment joindre l’équipe SDT.',
          error: 'Je n’arrive pas à te répondre pour le moment.',
          limit: 'Tu as posé beaucoup de questions : je préfère que l’équipe prenne le relais.',
        };
        await post(`${lines[why]}${staffLine}\nUn billet de support est suivi en privé jusqu’à la résolution et tu es prévenu dès qu’on te répond ; ton échange avec moi y sera joint automatiquement.`, 'TICKET_OFFER');
        await log('OFFER');
      };

      // Réponses sans IA : salutations, remerciements, demande explicite d'un billet.
      if (GREETING.test(text)) { await post(`Bonjour ${actor.username} ! ${cfg.welcome.replace(/^Bonjour ! /, '')}`); return; }
      const lastAnswerAge = await recently('ANSWER', CONTEXT_MINUTES * 60_000);
      if (THANKS.test(text) && lastAnswerAge > 0) { await post('Avec plaisir ! 😊 N’hésite pas si tu as une autre question.'); await log('RESOLVED'); return; }
      if (WANTS_TICKET.test(text)) { await offer('requested'); await log('NOT_SOLVED'); return; }
      if (NOT_SOLVED.test(text) && lastAnswerAge > 0) { await log('NOT_SOLVED'); await offer('attempts'); return; }

      if ((await recently('ANSWER', 3_600_000)) >= cfg.aiHourlyLimit) { await offer('limit'); return; }

      // Le contexte : les messages récents du membre, les réponses qu'il a reçues (assistant ou équipe).
      const since = new Date(Date.now() - CONTEXT_MINUTES * 60_000);
      const rows = await this.prisma.message.findMany({
        where: { conversationId: channelId, deletedAt: null, createdAt: { gt: since }, type: { in: ['TEXT', 'BOT_ANSWER', 'TICKET_OFFER'] }, OR: [{ senderId: actor.userId }, { replyTo: { senderId: actor.userId } }, { mentionIds: { has: actor.userId } }] },
        orderBy: { createdAt: 'asc' }, take: 16, select: { senderId: true, content: true, type: true, sender: { select: { username: true, role: true } } },
      });
      const turns = rows.map((r) => (r.senderId === actor.userId
        ? { role: 'user' as const, text: r.content.slice(0, 1200) }
        : { role: 'assistant' as const, text: (r.senderId === bot.id ? '' : `(équipe SDT, ${r.sender.username}) `) + r.content.slice(0, 1200) }));

      typing = setInterval(() => this.messenger.botTyping(channelId, bot), 3000);
      this.messenger.botTyping(channelId, bot);
      let answer: Awaited<ReturnType<SupportAiService['answer']>>;
      try { answer = await this.ai.answer(cfg, turns); }
      catch (err: any) {
        this.log.warn(`Réponse IA impossible : ${err?.message}`);
        await post('Désolé, je rencontre un souci technique et je ne peux pas chercher ta réponse pour l’instant.');
        await offer('error');
        return;
      } finally { if (typing) { clearInterval(typing); typing = null; } }

      const attempts = await recently('ANSWER', CONTEXT_MINUTES * 60_000);
      const sources = answer.sources.length ? `\n\n📖 Pour en savoir plus :\n${answer.sources.map((s) => `• ${s.title} — /wiki/${s.slug}`).join('\n')}` : '';
      await post(`${answer.reply}${sources}`, 'BOT_ANSWER');
      await log('ANSWER');
      if (answer.needsHuman || answer.confidence === 'low') await offer('human');
      else if (attempts + 1 >= cfg.maxAnswersBeforeOffer) await offer('attempts');
    } finally {
      if (typing) clearInterval(typing);
      this.busy.delete(actor.userId);
      if (this.again.delete(actor.userId)) void this.run(actor, channelId);
    }
  }

  // ------------------------------------------------------------------ boutons « Résolu » / « Pas résolu » sous une réponse

  async feedback(actor: Actor, messageId: string, solved: boolean) {
    const channelId = await this.channelId();
    const bot = await this.ensureBot();
    const m = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: channelId ?? '', type: 'BOT_ANSWER', senderId: bot.id, deletedAt: null }, select: { id: true, mentionIds: true, replyToId: true } });
    if (!m || !m.mentionIds.includes(actor.userId)) throw new NotFoundException('Réponse introuvable');
    await this.prisma.supportChatEvent.create({ data: { userId: actor.userId, kind: solved ? 'RESOLVED' : 'NOT_SOLVED' } });
    if (solved) {
      await this.messenger.postAsBot(bot.id, channelId!, 'Super, content d’avoir pu t’aider ! 🙌 Si une autre question te vient, je suis là.', { type: 'TEXT', replyToId: m.replyToId, mentionIds: [actor.userId] });
    } else {
      const online = await this.staffOnlineCount();
      const staffLine = online > 0 ? ` ${online === 1 ? 'Un membre de l’équipe est' : `${online} membres de l’équipe sont`} en ligne : il peut aussi te répondre ici.` : '';
      await this.messenger.postAsBot(bot.id, channelId!, `Désolé que ça ne règle pas ton problème.${staffLine}\nUn billet de support est suivi en privé jusqu’à la résolution et tu es prévenu dès qu’on te répond ; ton échange avec moi y sera joint automatiquement.`, { type: 'TICKET_OFFER', replyToId: m.replyToId, mentionIds: [actor.userId] });
      await this.prisma.supportChatEvent.create({ data: { userId: actor.userId, kind: 'OFFER' } });
    }
    return { ok: true };
  }

  // ------------------------------------------------------------------ billet depuis le chat

  /** Ouvre le billet d'un membre : l'historique de son échange dans le canal Support y est joint. */
  async createTicketFromChat(actor: Actor, body: any) {
    const channelId = await this.channelId();
    const bot = await this.ensureBot();
    return this.support.create(actor, { ...body, fromChat: body?.fromChat !== false }, { channelId, botUserId: bot.id });
  }

  /** Staff : transformer le message d'un membre dans le canal en billet à son nom. */
  async ticketFromMessage(staff: Actor, messageId: string) {
    if (!isStaffRole(staff.role)) throw new ForbiddenException('Réservé à l\'équipe');
    const channelId = await this.channelId();
    const m = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: channelId ?? '', deletedAt: null, type: 'TEXT' }, select: { id: true, content: true, senderId: true, sender: { select: { username: true, role: true } } } });
    if (!m) throw new NotFoundException('Message introuvable');
    if (isStaffRole(m.sender.role)) throw new BadRequestException('Choisis le message d\'un membre');
    const bot = await this.ensureBot();
    if (m.senderId === bot.id) throw new BadRequestException('Choisis le message d\'un membre');
    const transcript = await this.support.chatTranscript(m.senderId, channelId, bot.id);
    return this.support.createForMember(staff, { memberId: m.senderId, subject: m.content.replace(/\s+/g, ' ').slice(0, 80) || 'Question posée dans le chat', content: m.content, transcript });
  }

  // ------------------------------------------------------------------ test depuis l'administration

  async test(question: string) {
    const q = (question ?? '').trim();
    if (q.length < 3) throw new BadRequestException('Écris une question');
    const cfg = await this.support.config();
    try {
      const a = await this.ai.answer(cfg, [{ role: 'user', text: q.slice(0, 1000) }]);
      return { ok: true, ...a, status: this.ai.status(cfg) };
    } catch (err: any) {
      if (err instanceof SupportAiError) return { ok: false, error: err.message, status: this.ai.status(cfg) };
      throw err;
    }
  }
}
