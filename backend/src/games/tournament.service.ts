import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CardsService } from './cards.service';
import { startOfDayToronto } from './slots.service';
import { torontoDay } from './wheel.service';
import { challengeBus, type ChallengeEvent } from '../common/utils/challenge-bus';
import { setSource } from '../common/utils/ledger';
import { jobMonitor } from '../common/utils/job-monitor';
import { EVENTS, EVENT_LABEL, type Award, type Row, type ScoreEvent, type TournamentConfig, capped, nextWeekKey, normalizeTournament, pointsFor, prevWeekKey, rank, settle, tierFor, weekKeyOfDay } from '../common/utils/tournament';

const KEY = 'tournament';
const JACKPOT_KEY = 'tournamentJackpot';
const TZ = 'America/Toronto';
const DAY = 86_400_000;
const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

interface Actor { userId: string; username: string }

/**
 * Tournoi de la semaine : gratuit, alimenté par les jeux gratuits (les mêmes événements que les défis). Le lundi à 5 h 40 (Montréal), la semaine terminée est réglée : prix de rang, petit prix de
 * participation et gros lot progressif pour le premier s'il a assez de points. Tout est offert par le site : aucune mise, aucun droit d'entrée, rien ne se perd.
 */
@Injectable()
export class TournamentService implements OnModuleInit {
  private readonly logger = new Logger(TournamentService.name);
  private eligible = new Map<string, { ok: boolean; at: number }>();
  private cfgCache: { at: number; cfg: TournamentConfig } | null = null;

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService, private cards: CardsService) {}

  onModuleInit() {
    challengeBus.on('challenge', (e: ChallengeEvent) => { void this.onEvent(e).catch((err) => this.logger.debug(`Tournoi : ${err?.message ?? err}`)); });
    setTimeout(() => { void this.settlePending().catch(() => undefined); }, 90_000).unref?.();
  }

  async config(): Promise<TournamentConfig> {
    if (this.cfgCache && Date.now() - this.cfgCache.at < 15_000) return this.cfgCache.cfg;
    const cfg = normalizeTournament(await this.settings.get(KEY));
    this.cfgCache = { at: Date.now(), cfg };
    return cfg;
  }

  async saveConfig(actor: Actor, body: unknown, ip?: string | null) {
    const next = normalizeTournament({ ...(await this.config()), ...(body as object) });
    await this.settings.set(KEY, next);
    this.cfgCache = null;
    await this.audit.log(actor.userId, 'TOURNAMENT_CONFIG', { enabled: next.enabled, weeklyCap: next.weeklyCap, jackpotAdd: next.jackpot.add } as any, ip);
    return next;
  }

  currentWeek(now = new Date()): string { return weekKeyOfDay(torontoDay(now)); }
  /** Fin de la semaine : le lundi suivant à minuit (Montréal). */
  weekEnds(key: string): Date { return startOfDayToronto(new Date(`${nextWeekKey(key)}T12:00:00Z`)); }

  // ------------------------------------------------------------------ points

  private async isEligible(userId: string, cfg: TournamentConfig): Promise<boolean> {
    const hit = this.eligible.get(userId);
    if (hit && Date.now() - hit.at < 60_000) return hit.ok;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    const ok = !!u && !u.parentId && u.status === 'ACTIVE' && !u.gamesOptOut && Math.floor((Date.now() - u.createdAt.getTime()) / DAY) >= cfg.minAccountDays;
    if (this.eligible.size > 3000) this.eligible.clear();
    this.eligible.set(userId, { ok, at: Date.now() });
    return ok;
  }

  /** Un jeu gratuit a été joué : des points pour le tournoi de la semaine (dans la limite du plafond hebdomadaire). */
  async onEvent(e: ChallengeEvent) {
    const cfg = await this.config();
    if (!cfg.enabled) return;
    const pts = pointsFor(e.event, e.amount, cfg);
    if (pts <= 0 || !(await this.isEligible(e.userId, cfg))) return;
    const weekKey = this.currentWeek();
    const total = await this.prisma.tournamentPoint.aggregate({ where: { weekKey, userId: e.userId }, _sum: { points: true } });
    const add = capped(total._sum.points ?? 0, pts, cfg.weeklyCap);
    if (add <= 0) return;
    await this.prisma.tournamentPoint.upsert({
      where: { weekKey_userId_source: { weekKey, userId: e.userId, source: e.event } },
      create: { weekKey, userId: e.userId, source: e.event, points: add, count: 1 }, update: { points: { increment: add }, count: { increment: 1 } },
    });
  }

  private async standings(weekKey: string, cfg: TournamentConfig) {
    const groups = await this.prisma.tournamentPoint.groupBy({ by: ['userId'], where: { weekKey }, _sum: { points: true }, _max: { updatedAt: true } });
    if (groups.length === 0) return { ranked: [] as ReturnType<typeof rank>, names: new Map<string, string>(), participants: 0 };
    const users = await this.prisma.user.findMany({ where: { id: { in: groups.map((g) => g.userId) }, status: 'ACTIVE', gamesOptOut: false, parentId: null }, select: { id: true, username: true } });
    const names = new Map(users.map((u) => [u.id, u.username]));
    const rows: Row[] = groups.filter((g) => names.has(g.userId)).map((g) => ({ userId: g.userId, points: g._sum.points ?? 0, lastAt: g._max.updatedAt?.getTime() ?? 0 }));
    return { ranked: rank(rows, cfg.minPointsToRank), names, participants: rows.length };
  }

  /** Fixe le gros lot reporté (par exemple un gros lot de départ offert par l'équipe), dans la limite du plafond. */
  async setJackpot(actor: Actor, amount: number, ip?: string | null) {
    const cfg = await this.config();
    const next = Math.max(0, Math.min(cfg.jackpot.cap, Math.floor(Number(amount) || 0)));
    await this.settings.set(JACKPOT_KEY, { amount: next });
    await this.audit.log(actor.userId, 'TOURNAMENT_JACKPOT', { amount: next } as any, ip);
    return { amount: next };
  }

  async jackpot(): Promise<number> { return Math.max(0, Number(((await this.settings.get<{ amount: number }>(JACKPOT_KEY)) ?? { amount: 0 }).amount) || 0); }

  // ------------------------------------------------------------------ pages

  async overview(accountId: string) {
    const cfg = await this.config();
    const weekKey = this.currentWeek();
    const [st, mine, carried, history, last] = await Promise.all([
      this.standings(weekKey, cfg),
      this.prisma.tournamentPoint.findMany({ where: { weekKey, userId: accountId }, select: { source: true, points: true, count: true } }),
      this.jackpot(),
      this.prisma.tournamentWeek.findMany({ orderBy: { weekKey: 'desc' }, take: 8 }),
      this.prisma.tournamentWeek.findUnique({ where: { weekKey: prevWeekKey(weekKey) } }),
    ]);
    const myPoints = mine.reduce((s, m) => s + m.points, 0);
    const me = st.ranked.find((r) => r.userId === accountId) ?? null;
    const ahead = me && me.rank > 1 ? st.ranked[me.rank - 2] : null;
    const board = st.ranked.slice(0, 20).map((r) => ({ rank: r.rank, username: st.names.get(r.userId) ?? '?', points: r.points, mine: r.userId === accountId, prize: tierFor(r.rank, cfg) ? { points: tierFor(r.rank, cfg)!.points, tokens: tierFor(r.rank, cfg)!.tokens, packs: tierFor(r.rank, cfg)!.packs } : null }));
    const results = (row: { weekKey: string; participants: number; jackpot: number; results: any } | null) => (row ? {
      weekKey: row.weekKey, participants: row.participants, jackpot: row.jackpot,
      top: (Array.isArray(row.results) ? row.results : []).filter((r: any) => r.rank && r.rank <= 3).map((r: any) => ({ rank: r.rank, username: r.username, points: r.points, prize: r.prizePoints + r.jackpot })),
      mine: (Array.isArray(row.results) ? row.results : []).find((r: any) => r.userId === accountId) ? ((r) => ({ rank: r.rank, points: r.points, prizePoints: r.prizePoints, tokens: r.tokens, packs: r.packs, jackpot: r.jackpot }))((row.results as any[]).find((r: any) => r.userId === accountId)) : null,
    } : null);
    return {
      enabled: cfg.enabled, weekKey, endsAt: this.weekEnds(weekKey),
      rules: {
        weights: EVENTS.map((e) => ({ event: e, label: EVENT_LABEL[e], points: cfg.weights[e] })).filter((w) => w.points > 0), weeklyCap: cfg.weeklyCap, minPointsToRank: cfg.minPointsToRank, minAccountDays: cfg.minAccountDays,
        prizes: cfg.prizes, participation: cfg.participation, jackpotMinWinnerPoints: cfg.jackpot.minWinnerPoints,
      },
      jackpot: Math.min(cfg.jackpot.cap, carried + cfg.jackpot.add),
      me: { points: myPoints, rank: me?.rank ?? null, ranked: !!me, participants: st.participants, toNextRank: ahead ? Math.max(1, ahead.points - myPoints + 1) : null, toRank: Math.max(0, cfg.minPointsToRank - myPoints), cap: cfg.weeklyCap,
        breakdown: mine.map((m) => ({ source: m.source, label: EVENT_LABEL[m.source as ScoreEvent] ?? m.source, points: m.points, count: m.count })).sort((a, b) => b.points - a.points) },
      board,
      lastWeek: results(last),
      champions: history.map((h) => ({ weekKey: h.weekKey, participants: h.participants, jackpot: h.jackpot, winner: (Array.isArray(h.results) ? (h.results as any[]).find((r) => r.rank === 1) : null)?.username ?? null, winnerPoints: (Array.isArray(h.results) ? (h.results as any[]).find((r) => r.rank === 1) : null)?.points ?? null })),
    };
  }

  async adminOverview() {
    const cfg = await this.config();
    const weekKey = this.currentWeek();
    const [st, carried, history] = await Promise.all([this.standings(weekKey, cfg), this.jackpot(), this.prisma.tournamentWeek.findMany({ orderBy: { weekKey: 'desc' }, take: 12, select: { weekKey: true, participants: true, jackpot: true, settledAt: true } })]);
    return { config: cfg, weekKey, endsAt: this.weekEnds(weekKey), jackpotCarried: carried, participants: st.participants, standings: st.ranked.slice(0, 30).map((r) => ({ rank: r.rank, username: st.names.get(r.userId) ?? '?', points: r.points })), history };
  }

  // ------------------------------------------------------------------ règlement

  /** Chaque lundi à 5 h 40 : règle la semaine qui vient de finir (et le gros lot progresse d'une semaine). */
  @Cron('40 5 * * 1', { timeZone: TZ })
  async weekly() {
    jobMonitor.run('tournament.weekly');
    try { await this.settleWeek(prevWeekKey(this.currentWeek())); } catch (e) { jobMonitor.fail('tournament.weekly', e); this.logger.warn(`Tournoi : règlement de la semaine impossible (${(e as Error).message})`); }
  }

  /** Rattrapage (serveur éteint un lundi) : les semaines passées qui ont des points et ne sont pas réglées. */
  async settlePending(): Promise<number> {
    const current = this.currentWeek();
    const [weeks, done] = await Promise.all([
      this.prisma.tournamentPoint.groupBy({ by: ['weekKey'], where: { weekKey: { lt: current } } }),
      this.prisma.tournamentWeek.findMany({ select: { weekKey: true } }),
    ]);
    const settled = new Set(done.map((d) => d.weekKey));
    let n = 0;
    for (const w of weeks.map((x) => x.weekKey).filter((k) => !settled.has(k)).sort().slice(0, 4)) if (await this.settleWeek(w)) n++;
    return n;
  }

  /** Règle une semaine terminée, une seule fois (la ligne de la semaine sert de verrou). Renvoie false si elle l'était déjà ou n'est pas finie. */
  async settleWeek(weekKey: string, opts: { actor?: Actor } = {}): Promise<boolean> {
    if (weekKey >= this.currentWeek()) return false;
    const cfg = await this.config();
    if (!cfg.enabled) return false;
    const { ranked, names, participants } = await this.standings(weekKey, cfg);
    // les participants sous le minimum de classement ont droit au petit prix : on repart de toutes les lignes éligibles
    const groups = await this.prisma.tournamentPoint.groupBy({ by: ['userId'], where: { weekKey }, _sum: { points: true }, _max: { updatedAt: true } });
    const rows: Row[] = groups.filter((g) => names.has(g.userId)).map((g) => ({ userId: g.userId, points: g._sum.points ?? 0, lastAt: g._max.updatedAt?.getTime() ?? 0 }));
    const carried = await this.jackpot();
    const plan = settle(rows, cfg, carried);
    const results = plan.awards.map((a) => ({ ...a, username: names.get(a.userId) ?? '' }));
    const done = await this.prisma.$transaction(async (tx) => {
      const made = await tx.tournamentWeek.createMany({ data: [{ weekKey, participants: rows.length, jackpot: plan.jackpotPaid, results: results as any }], skipDuplicates: true });
      if (made.count !== 1) return false;
      await setSource(tx, 'tournoi');
      for (const a of plan.awards) {
        const bonus = a.prizePoints + a.jackpot;
        if (bonus > 0 || a.tokens > 0) await tx.user.update({ where: { id: a.userId }, data: { ...(bonus > 0 ? { bonusPoints: { increment: bonus } } : {}), ...(a.tokens > 0 ? { freeleechTokens: { increment: a.tokens } } : {}) } });
      }
      return true;
    }, { timeout: 60_000, maxWait: 10_000 });
    if (!done) return false;
    await this.settings.set(JACKPOT_KEY, { amount: plan.nextJackpot });
    if (opts.actor) await this.audit.log(opts.actor.userId, 'TOURNAMENT_SETTLE', { weekKey, participants: rows.length, jackpot: plan.jackpotPaid } as any);
    this.logger.log(`Tournoi ${weekKey} : ${rows.length} participant(s), gros lot ${plan.jackpotPaid}`);
    await this.announce(weekKey, plan.awards, results, plan.jackpotPaid, ranked.length).catch((e) => this.logger.warn(`Tournoi : annonces impossibles (${(e as Error).message})`));
    return true;
  }

  private async announce(weekKey: string, awards: Award[], results: { userId: string; username: string; rank: number | null }[], jackpotPaid: number, rankedCount: number) {
    const winner = results.find((r) => r.rank === 1);
    for (const a of awards) {
      const parts: string[] = [];
      if (a.prizePoints > 0) parts.push(`+${a.prizePoints} points`);
      if (a.jackpot > 0) parts.push(`le gros lot : +${a.jackpot} points`);
      if (a.tokens > 0) parts.push(`${a.tokens} jeton${a.tokens > 1 ? 's' : ''} freeleech`);
      if (a.packs > 0) { parts.push(`${a.packs} paquet${a.packs > 1 ? 's' : ''} de cartes`); await this.cards.grantPack(a.userId, 'tournoi', `${weekKey}:${a.rank}`).catch(() => false); }
      await this.notifications.notify({
        userId: a.userId, type: 'SYSTEM', category: 'games', title: a.rank ? `🏆 Tournoi de la semaine : tu termines ${ordinal(a.rank)} sur ${rankedCount} !` : '🏆 Tournoi de la semaine : merci d\'avoir joué !',
        body: parts.join(' · ') || undefined, link: '/jeux/tournoi',
      }).catch(() => undefined);
    }
    if (winner?.username) {
      await this.notifications.notifyAll({ type: 'SYSTEM', category: 'games', title: `👑 ${winner.username} remporte le tournoi de la semaine !`, body: jackpotPaid > 0 ? `Et le gros lot de ${jackpotPaid} points. Un nouveau tournoi commence : joue tes jeux gratuits pour y marquer des points.` : 'Un nouveau tournoi commence : joue tes jeux gratuits pour y marquer des points.', link: '/jeux/tournoi' }).catch(() => undefined);
    }
  }
}
