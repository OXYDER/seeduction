import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { parsePeerClient } from '../common/utils/peer-client';
import { ECONOMY } from '../common/utils/economy';
import {
  AnnounceCtx, AntiCheatConfig, CHEAT_FAMILY_LABELS, CHEAT_KINDS, CheatLevel, CheatSignal, LEVEL_ORDER, analyseAnnounce, ctxLabels, kindLabel, learnKindWeights, levelIndex, mayAlert, normalizeAntiCheatConfig,
  normalizeIp, scoreEvents, WINDOW_DAYS, HOT_DAYS, explainContext,
} from '../common/utils/anticheat';

const SETTING_KEY = 'anticheat';
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const IP_CACHE_MS = 10 * 60_000;
const RESCORE_DELAY_MS = 4_000;
const CLEARED_DAYS = 30;
const REOPEN_DELTA = 60;
const STATUSES = ['OPEN', 'REVIEWING', 'CLEARED', 'ACTIONED', 'EXPIRED'] as const;
export type CheatStatus = (typeof STATUSES)[number];
export interface Actor { userId: string; username: string; role?: string }

export interface AnnounceContext {
  userId: string;
  role: string;
  /** Profil robot du site : jamais examiné (il seede depuis une seedbox, à très haut débit). */
  profileType?: string;
  /** Privilèges et contexte du torrent qui expliquent des chiffres élevés (freeleech, double upload, son propre torrent, sortie récente). */
  ctx?: AnnounceCtx;
  torrentId: string;
  size: number;
  peerId: string;
  userAgent?: string | null;
  event?: string;
  viaStream?: boolean;
  ip: string;
  uploaded: number;
  downloaded: number;
  left: number;
  prev: { uploaded: number; downloaded: number; left: number; lastAnnounceAt: Date } | null;
}

export interface RecordOptions {
  torrentId?: string | null;
  /** Deux signaux identiques (même type, même torrent) dans cette fenêtre sont fusionnés en un seul. */
  dedupeHours?: number;
  /** Fusion : incrémente le compteur (announces) ou non (analyses périodiques, qui reverraient le même fait chaque heure). */
  bump?: boolean;
}

const WEIGHTS_KEY = 'anticheatWeights';
const dayStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);
  private ipSeen = new Map<string, number>();
  private timers = new Map<string, NodeJS.Timeout>();
  private lineCache = new Map<string, { at: number; fast: boolean }>();
  private exemptCache = new Map<string, { at: number; exempt: boolean }>();

  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService, private audit: AuditService) {}

  // ------------------------------------------------------------------ réglages

  async config(): Promise<AntiCheatConfig> {
    return normalizeAntiCheatConfig(await this.settings.get(SETTING_KEY));
  }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const cfg = normalizeAntiCheatConfig({ ...(await this.config()), ...(body ?? {}) });
    await this.settings.set(SETTING_KEY, cfg);
    await this.audit.log(actor.userId, 'ANTICHEAT_CONFIG', cfg as any, ip);
    return cfg;
  }

  /** Ligne rapide connue : le membre a déclaré une seedbox (envois depuis son propre serveur) ou c'est le robot du site. Mis en cache 10 minutes. */
  async hasFastLine(userId: string): Promise<boolean> {
    const hit = this.lineCache.get(userId);
    if (hit && Date.now() - hit.at < IP_CACHE_MS) return hit.fast;
    const [box, u] = await Promise.all([this.prisma.memberSeedbox.findUnique({ where: { userId }, select: { id: true } }), this.prisma.user.findUnique({ where: { id: userId }, select: { profileType: true } })]);
    const fast = !!box || u?.profileType === 'BOT';
    this.lineCache.set(userId, { at: Date.now(), fast });
    if (this.lineCache.size > 5000) this.lineCache.clear();
    return fast;
  }

  /** Comptes jamais examinés : le robot du site (profil BOT). */
  async isExempt(userId: string): Promise<boolean> {
    const hit = this.exemptCache.get(userId);
    if (hit && Date.now() - hit.at < IP_CACHE_MS) return hit.exempt;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { profileType: true } });
    const exempt = u?.profileType === 'BOT';
    this.exemptCache.set(userId, { at: Date.now(), exempt });
    if (this.exemptCache.size > 5000) this.exemptCache.clear();
    return exempt;
  }

  /** Poids par type de signal appris des dossiers classés (voir learnWeights). */
  async weights(): Promise<Record<string, number>> {
    const raw = await this.settings.get<{ weights?: Record<string, number> }>(WEIGHTS_KEY);
    return raw?.weights ?? {};
  }

  /**
   * Apprentissage : chaque dossier innocenté ou sanctionné par l'équipe apprend au système quels types de signaux sont fiables. Un type qui produit surtout des innocentés
   * pèse moins dans les scores (jusqu'à la moitié) ; un type fiable pèse un peu plus. Recalculé chaque nuit.
   */
  async learnWeights() {
    const closed = await this.prisma.cheatCase.findMany({ where: { status: { in: ['CLEARED', 'ACTIONED'] } }, select: { status: true, breakdown: true }, take: 2000 });
    const weights = learnKindWeights(closed.map((c) => ({ status: c.status, breakdown: (c.breakdown ?? {}) as any })));
    await this.settings.set(WEIGHTS_KEY, { weights, samples: closed.length, computedAt: new Date().toISOString() });
    return { weights, samples: closed.length };
  }

  // ------------------------------------------------------------------ collecte (announce)

  /**
   * Appelé à chaque announce, sans attendre (jamais bloquant, jamais en erreur) : examine ce que le client déclare, tient à jour le flux par jour et
   * par torrent (qui sert aux recoupements) et les adresses vues pour ce membre.
   */
  async onAnnounce(c: AnnounceContext) {
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      if (cfg.exemptStaff && STAFF.includes(c.role)) return;
      if (c.profileType === 'BOT') return;
      const now = new Date();

      const ctx: AnnounceCtx = { ...(c.ctx ?? {}), fastLine: await this.hasFastLine(c.userId) };
      const signals = analyseAnnounce({
        peerId: c.peerId, userAgent: c.userAgent, event: c.event, viaStream: c.viaStream, uploaded: c.uploaded, downloaded: c.downloaded, left: c.left, size: c.size, prev: c.prev, now, ctx,
      }, cfg);
      if (signals.length) await this.record(c.userId, signals, { torrentId: c.torrentId, dedupeHours: 6 });

      // Flux du jour : octets déclarés envoyés / reçus, et octets réellement acquis d'après la baisse de « left ».
      const up = c.prev ? Math.max(0, c.uploaded - c.prev.uploaded) : 0;
      const down = c.prev ? Math.max(0, c.downloaded - c.prev.downloaded) : 0;
      const got = c.prev && c.event !== 'started' ? Math.max(0, c.prev.left - c.left) : 0;
      if (up > 0 || down > 0 || got > 0) {
        const day = dayStart(now);
        await this.prisma.userTorrentFlow.upsert({
          where: { userId_torrentId_day: { userId: c.userId, torrentId: c.torrentId, day } },
          create: { userId: c.userId, torrentId: c.torrentId, day, up: BigInt(Math.round(up)), down: BigInt(Math.round(down)), got: BigInt(Math.round(got)), announces: 1 },
          update: { up: { increment: BigInt(Math.round(up)) }, down: { increment: BigInt(Math.round(down)) }, got: { increment: BigInt(Math.round(got)) }, announces: { increment: 1 } },
        });
      }

      await this.touchIp(c.userId, c.ip, now);
    } catch (err: any) {
      this.logger.debug(`Anti-triche : announce non analysé (${err?.message ?? err})`);
    }
  }

  /** Une écriture de l'adresse toutes les 10 minutes par membre et par adresse au plus : un announce n'a pas à payer une écriture de plus à chaque fois. */
  private async touchIp(userId: string, rawIp: string, now: Date) {
    const ip = normalizeIp(rawIp);
    if (!ip) return;
    const key = `${userId}|${ip}`;
    const last = this.ipSeen.get(key);
    if (last && now.getTime() - last < IP_CACHE_MS) return;
    this.ipSeen.set(key, now.getTime());
    if (this.ipSeen.size > 20_000) this.ipSeen.clear();
    await this.prisma.userIp.upsert({
      where: { userId_ip: { userId, ip } },
      create: { userId, ip, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now, announces: { increment: 1 } },
    });
  }

  // ------------------------------------------------------------------ signaux

  /** Enregistre des signaux pour un membre (en fusionnant les doublons proches) et planifie le recalcul de son score. */
  async record(userId: string, signals: CheatSignal[], opts: RecordOptions = {}) {
    if (signals.length === 0) return 0;
    if (await this.isExempt(userId)) return 0;
    const now = new Date();
    const since = new Date(now.getTime() - (opts.dedupeHours ?? 6) * 3600_000);
    let changed = 0;
    for (const s of signals) {
      if (!(s.points > 0)) continue;
      const torrentId = s.torrentScoped ? opts.torrentId ?? (s.details?.torrentId as string | undefined) ?? null : null;
      const existing = await this.prisma.cheatEvent.findFirst({ where: { userId, kind: s.kind, torrentId, lastAt: { gte: since } }, orderBy: { lastAt: 'desc' } });
      if (existing) {
        await this.prisma.cheatEvent.update({
          where: { id: existing.id },
          data: { points: Math.max(existing.points, s.points), lastAt: now, ...(opts.bump === false ? {} : { count: { increment: 1 } }), details: s.details as Prisma.InputJsonValue },
        });
      } else {
        await this.prisma.cheatEvent.create({ data: { userId, torrentId, kind: s.kind, points: s.points, details: s.details as Prisma.InputJsonValue } });
      }
      changed++;
    }
    if (changed) this.scheduleRescore(userId);
    return changed;
  }

  private scheduleRescore(userId: string, delay = RESCORE_DELAY_MS) {
    if (this.timers.has(userId)) return;
    const t = setTimeout(() => {
      this.timers.delete(userId);
      this.rescore(userId).catch((e) => this.logger.warn(`Anti-triche : recalcul impossible (${e?.message ?? e})`));
    }, delay);
    t.unref?.();
    this.timers.set(userId, t);
  }

  // ------------------------------------------------------------------ score et dossier

  /** Recalcule le score d'un membre, ouvre / met à jour son dossier, et prévient l'équipe quand le niveau monte. */
  async rescore(userId: string) {
    const cfg = await this.config();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, createdAt: true, status: true } });
    if (!user) return null;
    const now = new Date();
    const events = await this.prisma.cheatEvent.findMany({ where: { userId, lastAt: { gte: new Date(now.getTime() - WINDOW_DAYS * 86400_000) } }, select: { kind: true, points: true, lastAt: true, count: true, details: true } });
    const res = scoreEvents(events.map((e) => ({ kind: e.kind, points: e.points, lastAt: e.lastAt, count: e.count, hard: (e.details as any)?.hard === true })), { now, accountCreatedAt: user.createdAt, sensitivity: cfg.sensitivity, weights: await this.weights() });
    const existing = await this.prisma.cheatCase.findUnique({ where: { userId } });
    if (!existing && res.level === 'NONE') return null;

    const lvl = levelIndex(res.level);
    let status: CheatStatus = (existing?.status as CheatStatus) ?? 'OPEN';
    let alertedLevel = existing?.alertedLevel ?? 0;
    let resolvedAt = existing?.resolvedAt ?? null;
    const notes: { kind: string; body: string }[] = [];

    if (existing) {
      if (status === 'EXPIRED' && lvl >= 1) { status = 'OPEN'; alertedLevel = 0; resolvedAt = null; notes.push({ kind: 'STATUS', body: 'Dossier rouvert : de nouveaux signaux sont apparus.' }); }
      else if ((status === 'OPEN') && lvl === 0) { status = 'EXPIRED'; alertedLevel = 0; resolvedAt = now; notes.push({ kind: 'STATUS', body: 'Dossier classé automatiquement : les signaux se sont estompés.' }); }
      else if (status === 'CLEARED' && res.score >= (existing.clearedScore ?? 0) + REOPEN_DELTA && lvl >= 2) {
        status = 'OPEN'; alertedLevel = 0; resolvedAt = null;
        notes.push({ kind: 'STATUS', body: `Dossier rouvert : de nouveaux indices sont apparus après l'innocentement (score ${res.score}).` });
      }
    }
    alertedLevel = Math.min(alertedLevel, lvl);

    const data = {
      score: res.score, level: res.level, confidence: res.confidence, families: res.families, breakdown: res.breakdown as unknown as Prisma.InputJsonValue,
      status, alertedLevel, resolvedAt, lastEventAt: events.reduce((m, e) => (e.lastAt > m ? e.lastAt : m), existing?.lastEventAt ?? new Date(0)),
    };
    const saved = existing
      ? await this.prisma.cheatCase.update({ where: { id: existing.id }, data })
      : await this.prisma.cheatCase.create({ data: { userId, ...data, firstFlaggedAt: now } });
    for (const n of notes) await this.prisma.cheatCaseNote.create({ data: { caseId: saved.id, authorName: 'Système', kind: n.kind, body: n.body } });

    // Alerte : seulement quand le niveau MONTE au-dessus du dernier signalé, au-dessus du seuil choisi, sur un dossier actif.
    const active = status === 'OPEN' || status === 'REVIEWING';
    if (cfg.enabled && !cfg.observeOnly && active && user.status !== 'BANNED' && lvl > alertedLevel && lvl >= levelIndex(cfg.alertLevel) && mayAlert(res)) {
      await this.alertStaff(saved.id, user, res.level, res.score, res.confidence, res.breakdown, cfg);
      await this.prisma.cheatCase.update({ where: { id: saved.id }, data: { alertedLevel: lvl, alertedAt: now } });
      await this.prisma.cheatCaseNote.create({ data: { caseId: saved.id, authorName: 'Système', kind: 'ALERT', body: `Équipe prévenue : niveau ${res.level} (score ${res.score}, confiance ${res.confidence} %).` } });
    }
    return saved;
  }

  private async alertStaff(caseId: string, user: { id: string; username: string }, level: CheatLevel, score: number, confidence: number, breakdown: Record<string, { points: number }>, cfg: AntiCheatConfig) {
    const roles = cfg.notifyScope === 'ADMINS' ? ['ADMIN', 'OWNER'] : STAFF;
    const staff = await this.prisma.user.findMany({ where: { role: { in: roles as any }, status: 'ACTIVE', parentId: null, id: { not: user.id } }, select: { id: true } });
    const top = Object.entries(breakdown).sort((a, b) => b[1].points - a[1].points).slice(0, 3).map(([k]) => kindLabel(k)).join(', ');
    const icon = level === 'CRITICAL' ? '🚨' : level === 'LIKELY' ? '⚠️' : '🕵️';
    const word = { SUSPECT: 'suspect', LIKELY: 'probablement tricheur', CRITICAL: 'tricheur quasi certain', WATCH: 'à surveiller', NONE: '' }[level];
    await Promise.all(staff.map((s) => this.notifications.notify({
      userId: s.id, type: 'SYSTEM', category: 'system', groupKey: `cheat:${caseId}`,
      title: `${icon} Anti-triche : ${user.username} est ${word}`,
      body: `Score ${score} · confiance ${confidence} % — ${top || 'plusieurs signaux'}`.slice(0, 200),
      link: `/admin?tab=Anti-triche&case=${caseId}`,
    }).catch(() => undefined)));
  }

  /** Recalcule tous les dossiers actifs (la décroissance du temps les fait redescendre / se classer tout seuls). */
  async rescoreActive() {
    const open = await this.prisma.cheatCase.findMany({ where: { status: { in: ['OPEN', 'REVIEWING', 'CLEARED'] } }, select: { userId: true } });
    for (const c of open) await this.rescore(c.userId).catch(() => undefined);
    return open.length;
  }

  // ------------------------------------------------------------------ API équipe

  private levelOrderWhere(level?: string) {
    if (!level || level === 'ALL') return {};
    if (level === 'SUSPECT+') return { level: { in: ['SUSPECT', 'LIKELY', 'CRITICAL'] } };
    return { level };
  }

  async overview() {
    const [cfg, byLevel, byStatus, events24h, topCases, trackedIps, flowRows] = await Promise.all([
      this.config(),
      this.prisma.cheatCase.groupBy({ by: ['level'], where: { status: { in: ['OPEN', 'REVIEWING'] } }, _count: true }),
      this.prisma.cheatCase.groupBy({ by: ['status'], _count: true }),
      this.prisma.cheatEvent.groupBy({ by: ['kind'], where: { lastAt: { gte: new Date(Date.now() - 86400_000) } }, _count: true, _sum: { points: true } }),
      this.prisma.cheatCase.findMany({ where: { status: { in: ['OPEN', 'REVIEWING'] } }, orderBy: { score: 'desc' }, take: 5, include: { user: { select: { id: true, username: true, avatarUrl: true } } } }),
      this.prisma.userIp.count(),
      this.prisma.userTorrentFlow.count(),
    ]);
    const levels = Object.fromEntries(LEVEL_ORDER.filter((l) => l !== 'NONE').map((l) => [l, byLevel.find((b) => b.level === l)?._count ?? 0]));
    return {
      config: cfg,
      levels,
      statuses: Object.fromEntries(STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?._count ?? 0])),
      events24h: events24h.map((e) => ({ kind: e.kind, label: kindLabel(e.kind), count: e._count, points: Math.round(e._sum.points ?? 0) })).sort((a, b) => b.points - a.points),
      top: topCases.map((c) => ({ id: c.id, userId: c.userId, username: c.user.username, avatarUrl: c.user.avatarUrl, level: c.level, score: c.score })),
      coverage: { trackedIps, flowRows },
      kinds: Object.entries(CHEAT_KINDS).map(([key, k]) => ({ key, label: k.label, family: k.family, familyLabel: CHEAT_FAMILY_LABELS[k.family], hint: k.hint })),
    };
  }

  async list(q: { level?: string; status?: string; search?: string; page?: number }) {
    const pageSize = 25;
    const page = Math.max(1, Number(q.page) || 1);
    const status = q.status ?? 'ACTIVE';
    const where: Prisma.CheatCaseWhereInput = {
      ...(status === 'ACTIVE' ? { status: { in: ['OPEN', 'REVIEWING'] } } : status === 'ALL' ? {} : { status }),
      ...this.levelOrderWhere(q.level),
      ...(q.search?.trim() ? { user: { username: { contains: q.search.trim(), mode: 'insensitive' as const } } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.cheatCase.count({ where }),
      this.prisma.cheatCase.findMany({
        where, orderBy: [{ score: 'desc' }, { lastEventAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: { user: { select: { id: true, username: true, role: true, avatarUrl: true, uploaded: true, downloaded: true, createdAt: true, memberClass: true, status: true } } },
      }),
    ]);
    return {
      total, page, pageSize,
      items: rows.map((c) => {
        const up = Number(c.user.uploaded), down = Number(c.user.downloaded);
        const bd = (c.breakdown ?? {}) as Record<string, { points: number }>;
        return {
          id: c.id, userId: c.userId, score: c.score, level: c.level, confidence: c.confidence, status: c.status, families: c.families, lastEventAt: c.lastEventAt, firstFlaggedAt: c.firstFlaggedAt,
          assigneeName: c.assigneeName, user: { ...c.user, uploaded: up, downloaded: down, ratio: down > 0 ? Math.round((up / down) * 100) / 100 : null },
          top: Object.entries(bd).sort((a, b) => b[1].points - a[1].points).slice(0, 3).map(([k, v]) => ({ kind: k, label: kindLabel(k), points: v.points })),
        };
      }),
    };
  }

  /** Dossier complet d'un membre (par identifiant de dossier ou de membre) : signaux, adresses, comptes liés, clients, flux, notes. */
  async detail(idOrUser: string) {
    const c = await this.prisma.cheatCase.findFirst({ where: { OR: [{ id: idOrUser }, { userId: idOrUser }] }, include: { notes: { orderBy: { createdAt: 'desc' }, take: 100 } } });
    const userId = c?.userId ?? idOrUser;
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: userId }, { username: { equals: userId, mode: 'insensitive' } }] },
      select: { id: true, username: true, role: true, status: true, avatarUrl: true, createdAt: true, lastSeenAt: true, uploaded: true, downloaded: true, bonusPoints: true, memberClass: true, donorSince: true, freeleechUntil: true, profileType: true },
    });
    if (!user) throw new NotFoundException('Membre introuvable');
    const theCase = c && c.userId === user.id ? c : await this.prisma.cheatCase.findUnique({ where: { userId: user.id }, include: { notes: { orderBy: { createdAt: 'desc' }, take: 100 } } });

    const [events, ips, peers, flow, warnings, bans, organic, fast, freeUntil, doubleOn] = await Promise.all([
      this.prisma.cheatEvent.findMany({ where: { userId: user.id }, orderBy: { lastAt: 'desc' }, take: 150 }),
      this.prisma.userIp.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: 'desc' }, take: 40 }),
      this.prisma.peer.findMany({ where: { userId: user.id }, orderBy: { lastAnnounceAt: 'desc' }, take: 30, include: { torrent: { select: { id: true, name: true } } } }),
      this.prisma.$queryRaw<{ torrentId: string; up: number; down: number; got: number }[]>`
        SELECT "torrentId", SUM(up)::float8 AS up, SUM(down)::float8 AS down, SUM(got)::float8 AS got FROM "UserTorrentFlow"
        WHERE "userId" = ${user.id} AND day >= current_date - 7 GROUP BY "torrentId" ORDER BY SUM(up) DESC LIMIT 8`,
      this.prisma.warning.count({ where: { userId: user.id } }),
      this.prisma.ban.count({ where: { userId: user.id } }),
      this.prisma.$queryRaw<{ up: number; down: number; got: number }[]>`
        SELECT COALESCE(SUM(up), 0)::float8 AS up, COALESCE(SUM(down), 0)::float8 AS down, COALESCE(SUM(got), 0)::float8 AS got FROM "UserTorrentFlow" WHERE "userId" = ${user.id}`,
      this.hasFastLine(user.id),
      this.settings.freeleechUntil(),
      this.settings.doubleUploadActive(),
    ]);

    // Comptes qui ont utilisé les mêmes adresses.
    const ipList = ips.map((i) => i.ip);
    const sharing = ipList.length
      ? await this.prisma.userIp.findMany({ where: { ip: { in: ipList }, userId: { not: user.id } }, include: { user: { select: { id: true, username: true, avatarUrl: true, status: true, createdAt: true } } }, take: 100 })
      : [];
    const linked = new Map<string, { id: string; username: string; avatarUrl: string | null; status: string; createdAt: Date; ips: string[]; lastSeenAt: Date }>();
    for (const s of sharing) {
      const cur = linked.get(s.userId) ?? { ...s.user, ips: [], lastSeenAt: s.lastSeenAt };
      cur.ips.push(s.ip);
      if (s.lastSeenAt > cur.lastSeenAt) cur.lastSeenAt = s.lastSeenAt;
      linked.set(s.userId, cur);
    }

    // Contexte des 30 derniers jours : ce qui explique des chiffres élevés sans triche (freeleech du site, ses propres torrents, sorties récentes).
    const ctxRows = await this.prisma.$queryRaw<{ up: number; down: number; got: number; up_own: number; up_hot: number; got_event: number; got_torrent: number }[]>`
      SELECT COALESCE(SUM(f.up), 0)::float8 AS up, COALESCE(SUM(f.down), 0)::float8 AS down, COALESCE(SUM(f.got), 0)::float8 AS got,
        COALESCE(SUM(f.up) FILTER (WHERE t."uploaderId" = f."userId"), 0)::float8 AS up_own,
        COALESCE(SUM(f.up) FILTER (WHERE t."uploaderId" <> f."userId" AND f.day <= t."createdAt"::date + ${HOT_DAYS}::int), 0)::float8 AS up_hot,
        COALESCE(SUM(f.got) FILTER (WHERE EXISTS (SELECT 1 FROM "FreeleechEvent" e WHERE f.day >= e."startsAt"::date AND f.day <= e."endsAt"::date)), 0)::float8 AS got_event,
        COALESCE(SUM(f.got) FILTER (WHERE t.freeleech), 0)::float8 AS got_torrent
      FROM "UserTorrentFlow" f JOIN "Torrent" t ON t.id = f."torrentId" WHERE f."userId" = ${user.id} AND f.day >= current_date - 30`;
    const [published, freeEvents] = await Promise.all([
      this.prisma.torrent.count({ where: { uploaderId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      this.prisma.freeleechEvent.findMany({ where: { endsAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, startsAt: { lte: new Date() } }, select: { title: true }, take: 5 }),
    ]);
    const cx = ctxRows[0];
    const context = explainContext({
      upBytes: cx?.up ?? 0, downBytes: cx?.down ?? 0, gotBytes: cx?.got ?? 0, upOwn: cx?.up_own ?? 0, upHot: cx?.up_hot ?? 0, gotFreeEvent: cx?.got_event ?? 0, gotFreeTorrent: cx?.got_torrent ?? 0,
      freeleechTitles: freeEvents.map((e) => e.title), publishedTorrents: published,
    });

    const torrentIds = [...new Set([...events.map((e) => e.torrentId), ...flow.map((f) => f.torrentId)].filter((x): x is string => !!x))];
    const torrents = torrentIds.length ? await this.prisma.torrent.findMany({ where: { id: { in: torrentIds } }, select: { id: true, name: true, freeleech: true, doubleUpload: true } }) : [];
    const tname = new Map(torrents.map((t) => [t.id, t]));
    const up = Number(user.uploaded), down = Number(user.downloaded);

    return {
      user: { ...user, uploaded: up, downloaded: down, bonusPoints: Math.round(user.bonusPoints), ratio: down > 0 ? Math.round((up / down) * 100) / 100 : null, warnings, bans },
      case: theCase ? { ...theCase, notes: theCase.notes } : null,
      context,
      events: events.map((e) => ({ id: e.id, kind: e.kind, label: kindLabel(e.kind), family: CHEAT_KINDS[e.kind]?.family ?? 'client', points: Math.round(e.points * 10) / 10, count: e.count, details: e.details, firstAt: e.createdAt, lastAt: e.lastAt, torrent: e.torrentId ? tname.get(e.torrentId) ?? { id: e.torrentId, name: '(torrent supprimé)' } : null })),
      ips: ips.map((i) => ({ ip: i.ip, firstSeenAt: i.firstSeenAt, lastSeenAt: i.lastSeenAt, announces: i.announces, shared: sharing.filter((s) => s.ip === i.ip).length })),
      linked: [...linked.values()].sort((a, b) => b.ips.length - a.ips.length),
      clients: peers.map((p) => { const pc = parsePeerClient(p.peerId); return { client: pc.client, version: pc.version, userAgent: p.userAgent, ip: p.ip, torrent: p.torrent, isSeeder: p.isSeeder, lastAnnounceAt: p.lastAnnounceAt }; }),
      flow: flow.map((f) => ({ torrent: tname.get(f.torrentId) ?? { id: f.torrentId, name: '(torrent supprimé)' }, up: f.up, down: f.down, got: f.got, freeleech: !!tname.get(f.torrentId)?.freeleech, doubleUpload: !!tname.get(f.torrentId)?.doubleUpload })),
      // Ce qui explique légitimement un ratio élevé : ce que le membre a réellement échangé (annonces des 35 derniers jours) face aux chiffres crédités, avec ses privilèges.
      privileges: {
        credited: { uploaded: up, downloaded: down },
        organic35d: { uploaded: organic[0]?.up ?? 0, downloaded: organic[0]?.down ?? 0, acquired: organic[0]?.got ?? 0 },
        accountFreeleechUntil: user.freeleechUntil && user.freeleechUntil > new Date() ? user.freeleechUntil : null,
        siteFreeleech: !!freeUntil,
        siteDoubleUpload: doubleOn,
        fastLine: fast,
        welcomeUploadGb: ECONOMY.welcomeUploadGb,
        accountDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86400_000),
      },
    };
  }

  private async load(caseId: string) {
    const c = await this.prisma.cheatCase.findUnique({ where: { id: caseId }, include: { user: { select: { username: true } } } });
    if (!c) throw new NotFoundException('Dossier introuvable');
    return c;
  }

  async setStatus(actor: Actor, caseId: string, status: string, note: string | undefined, ip?: string | null) {
    if (!(STATUSES as readonly string[]).includes(status) || status === 'EXPIRED') throw new BadRequestException('Statut invalide');
    const c = await this.load(caseId);
    const now = new Date();
    const data: Prisma.CheatCaseUpdateInput = { status, reviewedByName: actor.username };
    if (status === 'REVIEWING') { data.assigneeName = actor.username; data.resolvedAt = null; }
    if (status === 'OPEN') { data.resolvedAt = null; data.immuneUntil = null; data.alertedLevel = Math.max(0, levelIndex(c.level) - 1); }
    if (status === 'CLEARED') { data.resolvedAt = now; data.clearedScore = c.score; data.immuneUntil = new Date(now.getTime() + CLEARED_DAYS * 86400_000); data.alertedLevel = levelIndex(c.level); }
    if (status === 'ACTIONED') { data.resolvedAt = now; }
    await this.prisma.cheatCase.update({ where: { id: caseId }, data });
    const label = { OPEN: 'rouvert', REVIEWING: 'pris en charge', CLEARED: `innocenté (pas de nouvelle alerte tant que de nouveaux indices ne s'ajoutent pas, ${CLEARED_DAYS} jours de grâce)`, ACTIONED: 'sanctionné' }[status];
    await this.prisma.cheatCaseNote.create({ data: { caseId, authorName: actor.username, kind: 'STATUS', body: `Dossier ${label}.${note?.trim() ? ` ${note.trim().slice(0, 1500)}` : ''}` } });
    await this.audit.log(actor.userId, 'ANTICHEAT_CASE', { caseId, userId: c.userId, username: c.user.username, status, note: note?.slice(0, 200) }, ip);
    return this.detail(caseId);
  }

  async addNote(actor: Actor, caseId: string, body: string) {
    const text = String(body ?? '').trim();
    if (!text) throw new BadRequestException('Note vide');
    await this.load(caseId);
    await this.prisma.cheatCaseNote.create({ data: { caseId, authorName: actor.username, body: text.slice(0, 2000) } });
    return this.detail(caseId);
  }
}
