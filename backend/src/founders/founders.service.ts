import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { forgetIdentity } from '../common/utils/session-identity';
import {
  DEFAULT_FOUNDERS_CONFIG, FOUNDER, FOUNDERS_KEY, FoundersConfig, FounderMetrics, evaluateFounder, normalizeFoundersConfig, usernameProblem,
} from '../common/utils/founders';

const SALON_KEY = 'foundersChat';
const SALON_NAME = '🏅 Salon des fondateurs';
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

@Injectable()
export class FoundersService {
  private readonly log = new Logger(FoundersService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private badges: BadgesService,
  ) {}

  async config(): Promise<FoundersConfig> {
    return normalizeFoundersConfig(await this.settings.get(FOUNDERS_KEY), DEFAULT_FOUNDERS_CONFIG);
  }

  async setConfig(adminId: string, body: unknown, ip?: string | null) {
    const next = normalizeFoundersConfig(body, await this.config());
    await this.settings.set(FOUNDERS_KEY, next);
    await this.audit.log(adminId, 'FOUNDERS_CONFIG', { ...next }, ip);
    return next;
  }

  // ── Candidats (Admin > Fondateurs) ──────────────────────────────────────────

  /** Les chiffres d'activité de chaque membre, calculés en groupe (pas une requête par membre). */
  private async metricsFor(ids: string[]): Promise<Map<string, Omit<FounderMetrics, 'lastSeenAt'>>> {
    const out = new Map<string, Omit<FounderMetrics, 'lastSeenAt'>>(ids.map((id) => [id, { loginDays: 0, posts: 0, uploads: 0, feedback: 0, seedHours: 0 }]));
    const add = (rows: { id: string; n: number }[], key: 'loginDays' | 'posts' | 'uploads' | 'feedback' | 'seedHours') => { for (const r of rows) { const m = out.get(r.id); if (m) m[key] += r.n; } };
    const [days, forum, comments, news, uploads, suggestions, tickets, seed] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; n: bigint }[]>`SELECT "userId" AS id, COUNT(DISTINCT date_trunc('day', "createdAt")) AS n FROM "ActivityLog" WHERE action = 'LOGIN' AND "userId" = ANY(${ids}) GROUP BY "userId"`,
      this.prisma.forumPost.groupBy({ by: ['authorId'], where: { authorId: { in: ids } }, _count: { _all: true } }),
      this.prisma.torrentComment.groupBy({ by: ['authorId'], where: { authorId: { in: ids } }, _count: { _all: true } }),
      this.prisma.announcementComment.groupBy({ by: ['authorId'], where: { authorId: { in: ids } }, _count: { _all: true } }),
      this.prisma.torrent.groupBy({ by: ['uploaderId'], where: { uploaderId: { in: ids }, status: 'APPROVED' }, _count: { _all: true } }),
      this.prisma.suggestion.groupBy({ by: ['authorId'], where: { authorId: { in: ids } }, _count: { _all: true } }),
      this.prisma.supportTicket.groupBy({ by: ['requesterId'], where: { requesterId: { in: ids } }, _count: { _all: true } }),
      this.prisma.snatch.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _sum: { seedSeconds: true } }),
    ]);
    add(days.map((r) => ({ id: r.id, n: Number(r.n) })), 'loginDays');
    add(forum.map((r) => ({ id: r.authorId, n: r._count._all })), 'posts');
    add(comments.map((r) => ({ id: r.authorId, n: r._count._all })), 'posts');
    add(news.map((r) => ({ id: r.authorId, n: r._count._all })), 'posts');
    add(uploads.map((r) => ({ id: r.uploaderId, n: r._count._all })), 'uploads');
    add(suggestions.map((r) => ({ id: r.authorId, n: r._count._all })), 'feedback');
    add(tickets.map((r) => ({ id: r.requesterId, n: r._count._all })), 'feedback');
    add(seed.map((r) => ({ id: r.userId, n: Math.floor((r._sum.seedSeconds ?? 0) / 3600) })), 'seedHours');
    return out;
  }

  /** Les membres de la bêta (comptes créés avant la date limite) avec leurs chiffres et s'ils méritent le statut ; les fondateurs actuels y figurent aussi. */
  async overview() {
    const cfg = await this.config();
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: { createdAt: { lt: new Date(cfg.cutoff) }, parentId: null, deletedAt: null, status: { notIn: ['DISABLED', 'BANNED'] }, profileType: { not: 'BOT' } },
      select: { id: true, username: true, role: true, createdAt: true, lastSeenAt: true, founderAt: true },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });
    const metrics = await this.metricsFor(users.map((u) => u.id));
    const rows = users.map((u) => {
      const m = { ...metrics.get(u.id)!, lastSeenAt: u.lastSeenAt };
      const verdict = evaluateFounder(m, cfg, now);
      return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, founder: !!u.founderAt, metrics: { loginDays: m.loginDays, posts: m.posts, uploads: m.uploads, feedback: m.feedback, seedHours: m.seedHours }, met: verdict.met, recent: verdict.recent, eligible: verdict.eligible };
    });
    rows.sort((a, b) => Number(b.founder) - Number(a.founder) || Number(b.eligible) - Number(a.eligible) || b.met.length - a.met.length || a.createdAt.getTime() - b.createdAt.getTime());
    return { config: cfg, total: rows.length, founders: rows.filter((r) => r.founder).length, eligible: rows.filter((r) => r.eligible && !r.founder).length, rows };
  }

  // ── Attribuer / retirer le statut ──────────────────────────────────────────

  async grant(adminId: string, ids: unknown, ip?: string | null) {
    const list = [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])].slice(0, 500);
    if (list.length === 0) throw new BadRequestException('Aucun membre choisi');
    const users = await this.prisma.user.findMany({ where: { id: { in: list }, founderAt: null, parentId: null, deletedAt: null, profileType: { not: 'BOT' } }, select: { id: true, username: true } });
    const year = new Date().getFullYear();
    for (const u of users) {
      // Le cadeau de l'année (jetons freeleech) est versé en même temps que le statut.
      await this.prisma.user.update({ where: { id: u.id }, data: { founderAt: new Date(), founderGiftYear: year, freeleechTokens: { increment: FOUNDER.yearlyTokens } } });
      await this.notifications.notify({
        userId: u.id, type: 'SYSTEM', title: '🏅 Tu es membre fondateur de Seeduction !',
        body: `Merci d'avoir aidé à bâtir le site pendant la bêta : ton pseudo brille en or, tu as un badge, un salon réservé, ${FOUNDER.extraInvites} invitations de plus, ${FOUNDER.yearlyTokens} jetons freeleech par an (déjà versés pour cette année) et +${Math.round((FOUNDER.bonusMultiplier - 1) * 100)} % de points en seedant.`,
        link: '/fondateurs',
      });
      await this.badges.checkAndAward(u.id).catch(() => undefined);
      await this.audit.log(adminId, 'FOUNDER_GRANT', { userId: u.id, username: u.username }, ip);
    }
    await this.settings.set('ranksBump', Date.now()); // les pseudos en or apparaissent tout de suite
    await this.syncSalon();
    return { granted: users.length, skipped: list.length - users.length };
  }

  async revoke(adminId: string, userId: string, ip?: string | null) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, founderAt: true } });
    if (!u || !u.founderAt) throw new NotFoundException("Ce membre n'est pas fondateur");
    await this.prisma.user.update({ where: { id: userId }, data: { founderAt: null } });
    await this.prisma.userBadge.deleteMany({ where: { userId, code: 'FONDATEUR' } });
    await this.audit.log(adminId, 'FOUNDER_REVOKE', { userId, username: u.username }, ip);
    await this.settings.set('ranksBump', Date.now());
    await this.syncSalon();
    return { ok: true };
  }

  // ── Côté membres : mur des fondateurs, changement de pseudo, salon ────────────

  async wall(viewerId: string) {
    const [rows, me] = await Promise.all([
      this.prisma.user.findMany({ where: { founderAt: { not: null }, deletedAt: null }, select: { id: true, username: true, avatarUrl: true, founderAt: true }, orderBy: { founderAt: 'asc' } }),
      this.prisma.user.findUnique({ where: { id: viewerId }, select: { founderAt: true, founderRenameUsed: true } }),
    ]);
    return {
      founders: rows,
      me: { founder: !!me?.founderAt, since: me?.founderAt ?? null, renameAvailable: !!me?.founderAt && !me.founderRenameUsed },
      perks: { bonusPercent: Math.round((FOUNDER.bonusMultiplier - 1) * 100), extraInvites: FOUNDER.extraInvites, yearlyTokens: FOUNDER.yearlyTokens },
    };
  }

  /** Un changement de pseudo gratuit : le nouveau pseudo doit être libre (un pseudo ne se réutilise jamais, même celui d'un compte supprimé). Les sessions sont fermées pour que le nouveau pseudo s'affiche partout. */
  async rename(userId: string, username: string, ip?: string | null) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, founderAt: true, founderRenameUsed: true, parentId: true } });
    if (!me || me.parentId || !me.founderAt) throw new ForbiddenException('Réservé aux membres fondateurs');
    if (me.founderRenameUsed) throw new BadRequestException('Tu as déjà utilisé ton changement de pseudo gratuit');
    const name = String(username ?? '').trim();
    const problem = usernameProblem(name);
    if (problem) throw new BadRequestException(problem);
    if (name.toLowerCase() === me.username.toLowerCase()) throw new BadRequestException('C\'est déjà ton pseudo');
    if (await this.prisma.user.findFirst({ where: { username: { equals: name, mode: 'insensitive' }, id: { not: userId } }, select: { id: true } })) {
      throw new BadRequestException("Ce pseudo est déjà pris (ou réservé : le pseudo d'un compte supprimé ne se réutilise pas)");
    }
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { username: name, founderRenameUsed: true, sessionsValidAfter: new Date() } });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException('Ce pseudo est déjà pris');
      throw err;
    }
    forgetIdentity(userId);
    await this.audit.log(userId, 'FOUNDER_RENAME', { from: me.username, to: name }, ip);
    return { username: name, mustLogin: true };
  }

  /** Le salon de chat privé des fondateurs (conversation de groupe, créée à la demande, participants alignés sur les fondateurs). */
  async salon(userId: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { founderAt: true, role: true } });
    if (!me || (!me.founderAt && !STAFF.includes(me.role))) throw new ForbiddenException('Réservé aux membres fondateurs');
    const conversationId = await this.syncSalon(true);
    return { conversationId };
  }

  /** Crée le salon au besoin et aligne ses participants : les fondateurs, plus les administrateurs pour le modérer. */
  async syncSalon(force = false): Promise<string | null> {
    const [founders, admins] = await Promise.all([
      this.prisma.user.findMany({ where: { founderAt: { not: null }, deletedAt: null }, select: { id: true } }),
      this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, deletedAt: null, parentId: null }, select: { id: true, role: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (founders.length === 0 && !force) return ((await this.settings.get(SALON_KEY)) as { id?: string } | null)?.id ?? null;
    let convId = ((await this.settings.get(SALON_KEY)) as { id?: string } | null)?.id ?? null;
    if (convId && !(await this.prisma.conversation.findUnique({ where: { id: convId }, select: { id: true } }))) convId = null;
    if (!convId) {
      const owner = admins.find((a) => a.role === 'OWNER') ?? admins[0] ?? null;
      const conv = await this.prisma.conversation.create({ data: { type: 'GROUP', name: SALON_NAME, createdById: owner?.id ?? founders[0]?.id ?? undefined, founderOnly: true } });
      convId = conv.id;
      await this.settings.set(SALON_KEY, { id: convId });
    }
    await this.prisma.conversation.updateMany({ where: { id: convId, founderOnly: false }, data: { founderOnly: true } }); // marque le salon : groupe « Fondateurs » dans les bulles
    const want = new Map<string, 'OWNER' | 'ADMIN' | 'MEMBER'>();
    for (const f of founders) want.set(f.id, 'MEMBER');
    admins.forEach((a, i) => want.set(a.id, a.role === 'OWNER' && i === 0 ? 'OWNER' : 'ADMIN'));
    const current = await this.prisma.conversationMember.findMany({ where: { conversationId: convId }, select: { id: true, userId: true, role: true } });
    for (const [uid, role] of want) {
      const has = current.find((c) => c.userId === uid);
      if (!has) await this.prisma.conversationMember.create({ data: { conversationId: convId, userId: uid, role } });
      else if (has.role !== role) await this.prisma.conversationMember.update({ where: { id: has.id }, data: { role } });
    }
    for (const c of current) if (!want.has(c.userId)) await this.prisma.conversationMember.delete({ where: { id: c.id } }).catch(() => undefined);
    return convId;
  }

  /** Chaque nuit : le cadeau annuel (jetons freeleech) aux fondateurs qui ne l'ont pas encore eu cette année, et le salon remis d'aplomb. */
  @Cron('10 4 * * *')
  async nightly() {
    const year = new Date().getFullYear();
    const due = await this.prisma.user.findMany({ where: { founderAt: { not: null }, deletedAt: null, OR: [{ founderGiftYear: null }, { founderGiftYear: { lt: year } }] }, select: { id: true } });
    for (const u of due) {
      await this.prisma.user.update({ where: { id: u.id }, data: { founderGiftYear: year, freeleechTokens: { increment: FOUNDER.yearlyTokens } } });
      await this.notifications.notify({ userId: u.id, type: 'SYSTEM', title: '🏅 Cadeau annuel de fondateur', body: `${FOUNDER.yearlyTokens} jetons freeleech viennent d'être ajoutés à ton compte. Merci d'avoir été là dès le début !`, link: '/fondateurs' });
    }
    if (due.length) this.log.log(`Cadeau annuel des fondateurs : ${due.length} membre(s)`);
    await this.syncSalon().catch((e) => this.log.warn(`Salon des fondateurs : ${e?.message ?? e}`));
  }
}
