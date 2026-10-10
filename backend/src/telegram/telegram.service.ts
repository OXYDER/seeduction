import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { CoversService } from '../covers/covers.service';
import { SettingsService } from '../settings/settings.service';
import { Actor, MessengerService } from '../messenger/messenger.service';
import { TOKEN_FORMAT, TelegramApi, TelegramError, openToken, sealToken } from './telegram-api';
import { CODE_ALPHABET, INVITE_URL, InEvent, escapeHtml, freeleechHtml, newsHtml, outboundMessage, parseLinkCode, parseUpdate, isStartCommand, torrentHtml } from './telegram-format';

/** Réglages Telegram, modifiables par les administrateurs (Admin > Telegram), stockés dans SiteSetting « telegram ». Le jeton du robot y est chiffré. */
export interface TelegramConfig {
  enabled: boolean;
  tokenSealed: string;
  /** Adresse d'invitation du groupe (t.me/+…) montrée aux membres connectés. */
  inviteUrl: string;
  /** Groupe Telegram relié au chat (identifiant numérique, négatif). */
  chatId: string;
  /** Recopier les messages entre le canal Seeduction choisi et le groupe Telegram. */
  bridge: boolean;
  bridgeChannelId: string | null;
  announceNews: boolean;
  announceFreeleech: boolean;
  announceTorrents: boolean;
  /** Destination des annonces (groupe ou canal Telegram) ; vide = le groupe relié. */
  announceChatId: string;
}

export const DEFAULT_TELEGRAM: TelegramConfig = {
  enabled: false, tokenSealed: '', inviteUrl: '', chatId: '', bridge: false, bridgeChannelId: null,
  announceNews: true, announceFreeleech: true, announceTorrents: false, announceChatId: '',
};

interface SeenChat { id: string; title: string; type: string; at: string }
interface TelegramState {
  offset?: number;
  botUsername?: string;
  seen: SeenChat[];
  newsAt?: string;
  torrentSince?: string;
  freeleechIds: string[];
  freeleechInit?: boolean;
  torrentIds: string[];
}

interface SentEvent { conv: { id: string; type: string; slug: string | null }; message: any }
type Job = (api: TelegramApi) => Promise<void>;

const CODE_TTL_MS = 15 * 60_000;
const SEND_GAP_MS = () => Number(process.env.TELEGRAM_SEND_GAP_MS ?? 3000); // Telegram : environ 20 messages par minute dans un groupe
const MAX_QUEUE = 60;
const STALE_SECONDS = 600; // un message plus vieux (panne, redémarrage) n'est plus recopié
const GROUP_TYPES = ['group', 'supergroup', 'channel'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pont entre Seeduction et Telegram, avec un robot (jeton de @BotFather) :
 * - le canal Messenger choisi et le groupe Telegram échangent leurs messages (réponses, modifications et suppressions comprises) ;
 *   seuls les membres qui ont lié leur compte (code à usage unique) sont recopiés vers Seeduction, sous leur vrai pseudo et avec leurs vrais droits ;
 * - les nouvelles, les freeleech et (en option) les nouveaux torrents non adultes sont annoncés automatiquement.
 * Le site interroge Telegram (getUpdates) : aucune adresse publique ni redirection de port n'est nécessaire.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private stopped = false;
  private annTimer: NodeJS.Timeout | null = null;
  private tokenInUse = '';
  private stateCache: TelegramState | null = null;
  private codes = new Map<string, { userId: string; exp: number }>();
  private hints = new Map<string, number>();
  /** Messages en cours de recopie depuis Telegram : ils ne repartent pas vers Telegram. */
  private inbound = new Set<string>();
  private queues = new Map<string, { jobs: Job[]; running: boolean; last: number }>();
  readonly status = { connected: false, lastPollAt: null as Date | null, lastError: null as string | null, lastSendAt: null as Date | null, relayedIn: 0, relayedOut: 0 };

  constructor(private prisma: PrismaService, private settings: SettingsService, private messenger: MessengerService, private covers: CoversService) {}

  onModuleInit() {
    if (process.env.TELEGRAM_DISABLED === '1') return;
    this.messenger.on('message:sent', (e: SentEvent) => { this.onSite(e).catch((err) => this.log.warn(`Telegram (envoi) : ${err?.message}`)); });
    this.messenger.on('realtime', (ev: any) => { if (ev?.event === 'message:updated') this.onSiteUpdate(ev.payload).catch((err) => this.log.warn(`Telegram (mise à jour) : ${err?.message}`)); });
    this.pollLoop().catch((err) => this.log.error(`Telegram : boucle arrêtée : ${err?.message}`));
    this.annTimer = setInterval(() => { this.announceTick().catch((err) => this.log.warn(`Telegram (annonces) : ${err?.message}`)); }, Number(process.env.TELEGRAM_ANNOUNCE_MS ?? 60_000));
    this.annTimer.unref?.();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.annTimer) clearInterval(this.annTimer);
  }

  // ------------------------------------------------------------------ réglages et état

  async config(): Promise<TelegramConfig> {
    return { ...DEFAULT_TELEGRAM, ...((await this.settings.get<Partial<TelegramConfig>>('telegram')) ?? {}) };
  }

  private async state(): Promise<TelegramState> {
    if (!this.stateCache) {
      const raw = (await this.settings.get<Partial<TelegramState>>('telegramState')) ?? {};
      this.stateCache = { seen: [], freeleechIds: [], torrentIds: [], ...raw };
    }
    return this.stateCache;
  }

  private async saveState(patch: Partial<TelegramState>) {
    const st = { ...(await this.state()), ...patch };
    this.stateCache = st;
    await this.settings.set('telegramState', st);
  }

  private active(cfg: TelegramConfig) { return cfg.enabled && !!cfg.tokenSealed && !!openToken(cfg.tokenSealed); }
  private apiFor(cfg: TelegramConfig) { return new TelegramApi(openToken(cfg.tokenSealed)); }

  // ------------------------------------------------------------------ réception (Telegram → Seeduction)

  private async pollLoop() {
    let backoff = 0;
    while (!this.stopped) {
      const cfg = await this.config().catch(() => null);
      const token = cfg ? openToken(cfg.tokenSealed) : '';
      if (!cfg || !cfg.enabled || !token) { this.status.connected = false; this.tokenInUse = ''; await sleep(5000); continue; }
      const started = Date.now();
      try {
        const api = new TelegramApi(token);
        if (this.tokenInUse !== token) {
          const me = await api.getMe();
          await api.call('deleteWebhook', { drop_pending_updates: false }); // getUpdates et webhook s'excluent
          this.tokenInUse = token;
          await this.saveState({ botUsername: me.username ?? '' });
          this.status.connected = true;
          this.status.lastError = null;
        }
        const st = await this.state();
        const updates = await api.getUpdates(st.offset, Number(process.env.TELEGRAM_POLL_SECONDS ?? 25));
        this.status.connected = true;
        this.status.lastPollAt = new Date();
        this.status.lastError = null;
        backoff = 0;
        if (updates.length) {
          for (const u of updates) {
            try { await this.handleUpdate(cfg, api, u); } catch (e: any) { this.log.warn(`Telegram : message ignoré : ${e?.message}`); }
          }
          await this.saveState({ offset: Math.max(...updates.map((u) => Number(u.update_id) || 0)) + 1 });
        } else if (Date.now() - started < 500) {
          await sleep(1000); // un serveur qui répond tout de suite sans rien dire : on ne tourne pas à vide
        }
      } catch (e: any) {
        this.status.connected = false;
        this.tokenInUse = '';
        this.status.lastError = e instanceof TelegramError && (e.code === 401 || e.code === 404) ? 'Jeton refusé par Telegram : vérifie-le dans @BotFather' : String(e?.message ?? e);
        backoff = Math.min(60, backoff ? backoff * 2 : 5);
        await sleep(backoff * 1000);
      }
    }
  }

  private async rememberChat(chat: { id: string; type: string; title: string }) {
    const st = await this.state();
    const known = st.seen.find((c) => c.id === chat.id);
    if (known && known.title === chat.title) return;
    const seen = [{ id: chat.id, title: chat.title, type: chat.type, at: new Date().toISOString() }, ...st.seen.filter((c) => c.id !== chat.id)].slice(0, 10);
    await this.saveState({ seen });
  }

  /** Une réponse du robot à un même membre au plus toutes les `everyMs` pour une même raison (jamais de spam dans le groupe). */
  private async hint(api: TelegramApi, chatId: string, key: string, everyMs: number, text: string, replyTo?: number) {
    const last = this.hints.get(key) ?? 0;
    if (Date.now() - last < everyMs) return;
    this.hints.set(key, Date.now());
    if (this.hints.size > 2000) this.hints.clear();
    try { await api.sendMessage(chatId, text, replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}); } catch { /* le robot n'a peut-être pas le droit d'écrire */ }
  }

  private async handleUpdate(cfg: TelegramConfig, api: TelegramApi, u: any) {
    const ev = parseUpdate(u);
    if (!ev) return;
    if (GROUP_TYPES.includes(ev.chat.type)) await this.rememberChat(ev.chat);
    if (ev.kind === 'member' || !ev.from || ev.from.isBot) return;

    // Liaison de compte : « /lier CODE » (en privé avec le robot, ou dans le groupe : le message est alors supprimé pour ne pas montrer le code)
    const code = parseLinkCode(ev.text);
    if (code && (ev.chat.type === 'private' || ev.chat.id === cfg.chatId)) {
      await this.linkAccount(api, ev, code);
      if (ev.chat.type !== 'private') api.deleteMessage(ev.chat.id, ev.messageId).catch(() => undefined);
      return;
    }
    if (ev.chat.type === 'private') {
      if (isStartCommand(ev.text)) await api.sendMessage(ev.chat.id, `👋 Pour relier ton compte Seeduction à Telegram, ouvre la page « Telegram » de ton compte sur le site, copie le code, puis envoie-le moi ici :\n<code>/lier TONCODE</code>`);
      return;
    }
    if (ev.chat.id !== cfg.chatId || !cfg.bridge || !cfg.bridgeChannelId) return;
    if (ev.text.startsWith('/')) return; // commandes destinées à d'autres robots
    if (Date.now() / 1000 - ev.date > STALE_SECONDS) return;
    await this.relayIn(cfg, api, ev);
  }

  private async linkAccount(api: TelegramApi, ev: InEvent, code: string) {
    const entry = this.codes.get(code);
    if (!entry || entry.exp < Date.now()) { await api.sendMessage(ev.from!.id, '❌ Code invalide ou expiré. Génère-en un nouveau sur la page « Telegram » de ton compte Seeduction.').catch(() => undefined); return; }
    const owner = await this.prisma.telegramLink.findUnique({ where: { tgUserId: ev.from!.id } });
    if (owner && owner.userId !== entry.userId) { await api.sendMessage(ev.from!.id, '❌ Ce compte Telegram est déjà lié à un autre compte Seeduction. Demande à l’équipe de retirer le lien.').catch(() => undefined); return; }
    const user = await this.prisma.user.findUnique({ where: { id: entry.userId }, select: { id: true, username: true, status: true } });
    if (!user || user.status !== 'ACTIVE') return;
    await this.prisma.telegramLink.upsert({
      where: { userId: user.id },
      update: { tgUserId: ev.from!.id, tgUsername: ev.from!.username },
      create: { userId: user.id, tgUserId: ev.from!.id, tgUsername: ev.from!.username },
    });
    this.codes.delete(code);
    await api.sendMessage(ev.from!.id, `✅ Compte lié : <b>${escapeHtml(user.username)}</b>. Tes messages écrits dans le groupe apparaîtront sur Seeduction sous ton pseudo.`).catch(() => undefined);
  }

  private async relayIn(cfg: TelegramConfig, api: TelegramApi, ev: InEvent) {
    const from = ev.from!;
    const link = await this.prisma.telegramLink.findUnique({ where: { tgUserId: from.id }, include: { user: { select: { id: true, username: true, role: true, status: true } } } });
    if (!link) {
      if (ev.kind === 'message') await this.hint(api, ev.chat.id, `unlinked:${from.id}`, 6 * 3600_000, `👋 ${escapeHtml(from.name || 'Bonjour')}, tes messages ne sont pas encore transmis à Seeduction. Pour les relier à ton compte : page « Telegram » du site, puis envoie-moi le code en privé (<code>/lier CODE</code>).`, ev.messageId);
      return;
    }
    if (link.user.status !== 'ACTIVE') return;
    if (from.username !== link.tgUsername) this.prisma.telegramLink.update({ where: { id: link.id }, data: { tgUsername: from.username } }).catch(() => undefined);
    const actor: Actor = { userId: link.user.id, username: link.user.username, role: link.user.role };
    const convId = cfg.bridgeChannelId!;
    const tgChat = ev.chat.id;

    if (ev.kind === 'edited') {
      const map = await this.prisma.telegramMessage.findUnique({ where: { tgChatId_tgMessageId: { tgChatId: tgChat, tgMessageId: ev.messageId } } });
      if (map?.fromTelegram && ev.text) await this.messenger.edit(actor, map.messageId, ev.text.slice(0, 4000)).catch(() => undefined);
      return;
    }

    let content = ev.text.trim();
    if (ev.otherMedia) content = `${content}${content ? '\n' : ''}[${ev.otherMedia} sur Telegram]`.trim();
    let imageUrl: string | undefined;
    if (ev.photoFileId) {
      try { imageUrl = await this.covers.saveGenerated(await api.downloadFile(ev.photoFileId)); }
      catch (e: any) { content = `${content}${content ? '\n' : ''}[photo Telegram non transmise]`.trim(); this.log.debug(`Photo Telegram ignorée : ${e?.message}`); }
    }
    content = content.slice(0, 4000);
    if (!content && !imageUrl) return;
    let replyToId: string | undefined;
    if (ev.replyToMessageId) replyToId = (await this.prisma.telegramMessage.findUnique({ where: { tgChatId_tgMessageId: { tgChatId: tgChat, tgMessageId: ev.replyToMessageId } } }))?.messageId;

    const key = `${convId}:${actor.userId}:${content}`;
    this.inbound.add(key);
    try {
      const sent = await this.messenger.send(actor, convId, { content, imageUrl, replyToId });
      await this.prisma.telegramMessage.create({ data: { messageId: sent.id, tgChatId: tgChat, tgMessageId: ev.messageId, fromTelegram: true } }).catch(() => undefined);
      this.status.relayedIn++;
    } catch (e: any) {
      await this.hint(api, tgChat, `blocked:${actor.userId}`, 10 * 60_000, `⛔ ${escapeHtml(link.user.username)}, ton message n’a pas été transmis à Seeduction : ${escapeHtml(String(e?.message ?? 'erreur'))}`, ev.messageId);
    } finally {
      this.inbound.delete(key);
    }
  }

  // ------------------------------------------------------------------ envoi (Seeduction → Telegram)

  /** Un message est posté dans le canal relié : il part vers le groupe Telegram. */
  private async onSite(e: SentEvent) {
    const cfg = await this.config();
    if (!this.active(cfg) || !cfg.bridge || !cfg.chatId || e.conv.id !== cfg.bridgeChannelId) return;
    const m = e.message;
    if (this.inbound.has(`${e.conv.id}:${m.sender.id}:${m.content}`)) return; // vient de Telegram
    const out = outboundMessage(m);
    let replyTg: number | undefined;
    if (m.replyTo?.id) replyTg = (await this.prisma.telegramMessage.findUnique({ where: { messageId: m.replyTo.id } }))?.tgMessageId;
    const chatId = cfg.chatId;
    this.enqueue(chatId, cfg, async (api) => {
      const extra = replyTg ? { reply_parameters: { message_id: replyTg, allow_sending_without_reply: true } } : {};
      let sent: { message_id: number };
      if (out.kind === 'photo') sent = await api.sendPhoto(chatId, out.mediaUrl!, out.text, extra);
      else if (out.kind === 'animation') sent = await api.sendAnimation(chatId, out.mediaUrl!, out.text, extra);
      else sent = await api.sendMessage(chatId, out.text, extra);
      this.status.relayedOut++;
      await this.prisma.telegramMessage.create({ data: { messageId: m.id, tgChatId: chatId, tgMessageId: sent.message_id, fromTelegram: false } }).catch(() => undefined);
    });
  }

  /** Message modifié ou supprimé sur Seeduction : la copie Telegram suit. */
  private async onSiteUpdate(dto: any) {
    const cfg = await this.config();
    if (!this.active(cfg) || !cfg.bridge || dto?.conversationId !== cfg.bridgeChannelId) return;
    const map = await this.prisma.telegramMessage.findUnique({ where: { messageId: dto.id } });
    if (!map) return;
    if (dto.deleted) {
      this.enqueue(map.tgChatId, cfg, async (api) => { await api.deleteMessage(map.tgChatId, map.tgMessageId).catch(() => undefined); });
    } else if (dto.editedAt && !map.fromTelegram && dto.type === 'TEXT') {
      const out = outboundMessage(dto);
      this.enqueue(map.tgChatId, cfg, async (api) => { await api.editMessageText(map.tgChatId, map.tgMessageId, out.text).catch(() => undefined); });
    }
  }

  /** File d'envoi par groupe : un message à la fois, en respectant la cadence permise par Telegram ; nouvel essai si Telegram demande d'attendre. */
  private enqueue(chatId: string, cfg: TelegramConfig, job: Job) {
    let q = this.queues.get(chatId);
    if (!q) { q = { jobs: [], running: false, last: 0 }; this.queues.set(chatId, q); }
    if (q.jobs.length >= MAX_QUEUE) q.jobs.shift();
    q.jobs.push(job);
    if (q.running) return;
    q.running = true;
    const api = this.apiFor(cfg);
    (async () => {
      while (q!.jobs.length && !this.stopped) {
        const wait = q!.last + SEND_GAP_MS() - Date.now();
        if (wait > 0) await sleep(wait);
        const next = q!.jobs.shift()!;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { await next(api); this.status.lastSendAt = new Date(); break; }
          catch (e: any) {
            if (e instanceof TelegramError && e.code === 429 && attempt === 0) { await sleep(Math.min(60, e.retryAfter + 1) * 1000); continue; }
            this.status.lastError = `Envoi vers Telegram impossible : ${e?.message ?? e}`;
            this.log.warn(this.status.lastError);
            break;
          }
        }
        q!.last = Date.now();
      }
      q!.running = false;
    })().catch((err) => { q!.running = false; this.log.warn(`Telegram (file d'envoi) : ${err?.message}`); });
  }

  // ------------------------------------------------------------------ annonces automatiques

  async announceTick() {
    const cfg = await this.config();
    const chatId = cfg.announceChatId || cfg.chatId;
    if (!this.active(cfg) || !chatId) return;
    const st = await this.state();
    const now = new Date();
    const patch: Partial<TelegramState> = {};

    if (cfg.announceNews) {
      if (!st.newsAt) patch.newsAt = now.toISOString();
      else {
        const rows = await this.prisma.announcement.findMany({ where: { createdAt: { gt: new Date(st.newsAt) } }, orderBy: { createdAt: 'asc' }, take: 5 });
        for (const a of rows) this.enqueue(chatId, cfg, async (api) => { await api.sendMessage(chatId, newsHtml(a)); });
        if (rows.length) patch.newsAt = rows[rows.length - 1].createdAt.toISOString();
      }
    }

    if (cfg.announceFreeleech) {
      const active = await this.prisma.freeleechEvent.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { startsAt: 'asc' } });
      if (!st.freeleechInit) { patch.freeleechIds = active.map((e) => e.id); patch.freeleechInit = true; }
      else {
        const fresh = active.filter((e) => !st.freeleechIds.includes(e.id));
        for (const e of fresh) this.enqueue(chatId, cfg, async (api) => { await api.sendMessage(chatId, freeleechHtml(e)); });
        if (fresh.length) patch.freeleechIds = [...st.freeleechIds, ...fresh.map((e) => e.id)].slice(-50);
      }
    }

    if (cfg.announceTorrents) {
      if (!st.torrentSince) patch.torrentSince = now.toISOString();
      else {
        const since = new Date(Math.max(new Date(st.torrentSince).getTime(), now.getTime() - 3 * 86400_000));
        const rows = await this.prisma.torrent.findMany({
          where: { status: 'APPROVED', createdAt: { gt: since }, id: { notIn: st.torrentIds }, category: { adult: false, OR: [{ parentId: null }, { parent: { adult: false } }] } },
          orderBy: { createdAt: 'asc' }, take: 5, select: { id: true, name: true, size: true, category: { select: { name: true } } },
        });
        for (const t of rows) this.enqueue(chatId, cfg, async (api) => { await api.sendMessage(chatId, torrentHtml({ ...t, category: t.category?.name })); });
        if (rows.length) patch.torrentIds = [...st.torrentIds, ...rows.map((t) => t.id)].slice(-2000);
      }
    }
    if (Object.keys(patch).length) await this.saveState(patch);
  }

  // ------------------------------------------------------------------ membres : page « Telegram » du compte

  async info(userId: string) {
    const [cfg, st, link] = await Promise.all([this.config(), this.state(), this.prisma.telegramLink.findUnique({ where: { userId } })]);
    if (!this.active(cfg)) return { enabled: false };
    let channel: { id: string; name: string | null } | null = null;
    if (cfg.bridge && cfg.bridgeChannelId) channel = await this.prisma.conversation.findUnique({ where: { id: cfg.bridgeChannelId }, select: { id: true, name: true } });
    return {
      enabled: true,
      inviteUrl: cfg.inviteUrl || null,
      botUsername: st.botUsername || null,
      bridge: cfg.bridge && !!channel,
      channel,
      announce: { news: cfg.announceNews, freeleech: cfg.announceFreeleech, torrents: cfg.announceTorrents },
      linked: link ? { username: link.tgUsername, since: link.createdAt } : null,
    };
  }

  /** Code de liaison à usage unique, valable 15 minutes (un nouveau code annule le précédent). */
  async createLinkCode(userId: string) {
    const cfg = await this.config();
    if (!this.active(cfg)) throw new BadRequestException("Telegram n'est pas activé sur ce site");
    const now = Date.now();
    for (const [c, v] of this.codes) if (v.exp < now || v.userId === userId) this.codes.delete(c);
    let code = '';
    do { code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (this.codes.has(code));
    this.codes.set(code, { userId, exp: now + CODE_TTL_MS });
    return { code, expiresAt: new Date(now + CODE_TTL_MS), botUsername: (await this.state()).botUsername || null };
  }

  async unlink(userId: string) {
    await this.prisma.telegramLink.deleteMany({ where: { userId } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const [cfg, st, links, channels] = await Promise.all([
      this.config(), this.state(),
      this.prisma.telegramLink.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { id: true, username: true } } } }),
      this.prisma.conversation.findMany({ where: { type: 'CHANNEL', archived: false, readRole: null, NOT: { slug: 'support' } }, orderBy: { position: 'asc' }, select: { id: true, name: true } }),
    ]);
    const { tokenSealed, ...pub } = cfg;
    return {
      config: pub,
      hasToken: !!openToken(tokenSealed),
      botUsername: st.botUsername || null,
      status: { connected: this.status.connected, lastPollAt: this.status.lastPollAt, lastError: this.status.lastError, lastSendAt: this.status.lastSendAt, relayedIn: this.status.relayedIn, relayedOut: this.status.relayedOut },
      seenChats: st.seen,
      channels,
      links: links.map((l) => ({ userId: l.user.id, username: l.user.username, tgUsername: l.tgUsername, since: l.createdAt })),
    };
  }

  async saveAdmin(body: any) {
    const cur = await this.config();
    const next: TelegramConfig = { ...cur };
    const b = (v: any) => v === true || v === 'true';
    if (typeof body?.token === 'string' && body.token.trim()) {
      const t = body.token.trim();
      if (!TOKEN_FORMAT.test(t)) throw new BadRequestException('Jeton invalide : copie-le tel quel depuis @BotFather (il ressemble à 123456789:AAH…)');
      next.tokenSealed = sealToken(t);
    }
    if (body?.clearToken === true) next.tokenSealed = '';
    if (typeof body?.inviteUrl === 'string') {
      const u = body.inviteUrl.trim();
      if (u && !INVITE_URL.test(u)) throw new BadRequestException("Lien d'invitation invalide : il doit commencer par https://t.me/");
      next.inviteUrl = u;
    }
    for (const k of ['chatId', 'announceChatId'] as const) {
      if (typeof body?.[k] === 'string') {
        const v = body[k].trim();
        if (v && !/^-?\d{5,20}$/.test(v)) throw new BadRequestException("Identifiant Telegram invalide : c'est un nombre (négatif pour un groupe), à choisir dans la liste des groupes détectés");
        next[k] = v;
      }
    }
    for (const k of ['enabled', 'bridge', 'announceNews', 'announceFreeleech', 'announceTorrents'] as const) if (k in (body ?? {})) next[k] = b(body[k]);
    if ('bridgeChannelId' in (body ?? {})) {
      const id = body.bridgeChannelId ? String(body.bridgeChannelId) : null;
      if (id) {
        const c = await this.prisma.conversation.findUnique({ where: { id }, select: { type: true, readRole: true, slug: true, archived: true } });
        if (!c || c.type !== 'CHANNEL' || c.archived) throw new BadRequestException('Canal introuvable');
        if (c.readRole || c.slug === 'support') throw new BadRequestException('Ce canal ne peut pas être relié à Telegram : choisis un canal ouvert à tous (pas le Support ni un canal réservé)');
      }
      next.bridgeChannelId = id;
    }
    if (next.bridge && (!next.bridgeChannelId || !next.chatId)) throw new BadRequestException('Pour relier le chat : choisis un groupe Telegram et un canal Seeduction');
    if (next.enabled && !next.tokenSealed) throw new BadRequestException("Colle d'abord le jeton du robot");
    await this.settings.set('telegram', next);
    // Une annonce qu'on active ne rejoue pas l'historique : elle commence à partir de maintenant.
    const st: Partial<TelegramState> = {};
    const now = new Date().toISOString();
    if (next.announceNews && !cur.announceNews) st.newsAt = now;
    if (next.announceTorrents && !cur.announceTorrents) st.torrentSince = now;
    if (Object.keys(st).length) await this.saveState(st);
    return this.adminOverview();
  }

  /** Vérifie le jeton et envoie un message d'essai dans le groupe choisi. */
  async test(body: any) {
    const cfg = await this.config();
    const token = (typeof body?.token === 'string' && body.token.trim()) || openToken(cfg.tokenSealed);
    if (!token) throw new BadRequestException("Colle d'abord le jeton du robot");
    if (!TOKEN_FORMAT.test(token)) throw new BadRequestException('Jeton invalide : copie-le tel quel depuis @BotFather');
    const api = new TelegramApi(token);
    const out: { bot: string | null; chat: string | null; sent: boolean; error: string | null } = { bot: null, chat: null, sent: false, error: null };
    try {
      const me = await api.getMe();
      out.bot = me.username ? `@${me.username}` : me.first_name;
      if (me.username) await this.saveState({ botUsername: me.username });
    } catch (e: any) { throw new BadRequestException(e instanceof TelegramError && e.code === 401 ? 'Telegram refuse ce jeton' : String(e?.message ?? e)); }
    const chatId = (typeof body?.chatId === 'string' && body.chatId.trim()) || cfg.chatId;
    if (chatId) {
      try {
        const chat = await api.getChat(chatId);
        out.chat = chat.title ?? String(chat.id);
        await api.sendMessage(chatId, '✅ Seeduction est bien relié à ce groupe.');
        out.sent = true;
      } catch (e: any) { out.error = `Message d'essai refusé : ${e?.message ?? e}. Le robot est-il bien ajouté au groupe comme administrateur ?`; }
    }
    return out;
  }

  /** Crée (ou retrouve) le canal « Telegram » et le choisit comme canal relié. */
  async createChannel(actor: Actor) {
    let channel = await this.prisma.conversation.findFirst({ where: { type: 'CHANNEL', slug: 'telegram' }, select: { id: true, readRole: true, archived: true } });
    if (!channel || channel.readRole || channel.archived) {
      const created = await this.messenger.createChannel(actor, {
        name: 'Telegram', description: 'Relié au groupe Telegram de Seeduction',
        motd: '🔗 Ce canal est relié au groupe Telegram : tes messages y sont aussi envoyés, et ceux du groupe arrivent ici (pour les membres qui ont lié leur compte, page « Telegram » de ton compte).',
      });
      channel = { id: created.id, readRole: null, archived: false };
    }
    const cfg = await this.config();
    await this.settings.set('telegram', { ...cfg, bridgeChannelId: channel.id });
    return this.adminOverview();
  }

  async adminUnlink(userId: string) {
    const r = await this.prisma.telegramLink.deleteMany({ where: { userId } });
    if (!r.count) throw new NotFoundException('Aucun lien pour ce membre');
    return { ok: true };
  }
}
