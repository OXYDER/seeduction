import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChallengeEvent, challengeBus } from '../common/utils/challenge-bus';
import { CHALLENGES, ChallengeDef, ChallengesConfig, DEFAULT_CHALLENGES, Scope, TIER_LABEL, advancedBy, bonusStreak, normalizeChallenges, pick, scaled } from '../common/utils/challenges';
import { addDays, weekStart } from '../common/utils/picks';
import { startOfDayToronto } from './slots.service';
import { nextMidnightToronto, torontoDay } from './wheel.service';
import { CardsService } from './cards.service';
import { setSource } from '../common/utils/ledger';

const KEY = 'challenges';
const DAY = 86400_000;
const ELIGIBLE_TTL = 60_000;

export interface Actor { userId: string; username: string }

/** Minuit (heure de Montréal) qui commence le jour `day` (AAAA-MM-JJ). */
export function midnightOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return startOfDayToronto(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * Défis quotidiens et hebdomadaires. Les jeux annoncent ce que fait un membre (voir `challenge-bus.ts`) ; ce service compte, verse la récompense au moment exact où
 * un défi est réussi (une seule fois, grâce à une garde en base) et un bonus quand les trois défis d'une période sont réussis. Aucun défi ne demande de miser des points.
 */
@Injectable()
export class ChallengesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengesService.name);
  private eligible = new Map<string, { ok: boolean; at: number }>();
  private listener = (e: ChallengeEvent) => { this.handle(e).catch((err) => this.logger.warn(`Défis : ${(err as Error).message}`)); };

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService, private cards: CardsService) {}

  onModuleInit() { challengeBus.on('challenge', this.listener); }
  onModuleDestroy() { challengeBus.off('challenge', this.listener); }

  async config(): Promise<ChallengesConfig> { return normalizeChallenges(await this.settings.get(KEY), DEFAULT_CHALLENGES); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeChallenges(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'CHALLENGES_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; parentId: string | null }, cfg: ChallengesConfig): string | null {
    if (!cfg.enabled) return 'Les défis sont fermés pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas participer';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour participer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  private async isEligible(userId: string, cfg: ChallengesConfig): Promise<boolean> {
    const hit = this.eligible.get(userId);
    if (hit && Date.now() - hit.at < ELIGIBLE_TTL) return hit.ok;
    const a = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, createdAt: true, parentId: true } });
    const ok = !!a && !a.parentId && !this.blocked(a, cfg);
    if (this.eligible.size > 5000) this.eligible.clear();
    this.eligible.set(userId, { ok, at: Date.now() });
    return ok;
  }

  // ------------------------------------------------------------------ comptage

  /** Nombre de jeux différents essayés pendant la période (un jour, ou la semaine qui commence le lundi `period`). */
  private async distinctGames(userId: string, scope: Scope, period: string): Promise<number> {
    const where = scope === 'daily' ? { userId, day: period } : { userId, day: { gte: period, lte: addDays(period, 6) } };
    return (await this.prisma.challengeActivity.groupBy({ by: ['game'], where })).length;
  }

  /** Traite un événement d'un jeu : fait avancer les défis du jour et de la semaine qu'il concerne. */
  async handle(e: ChallengeEvent) {
    const cfg = await this.config();
    if (!cfg.enabled || !(await this.isEligible(e.userId, cfg))) return;
    const today = torontoDay();
    const wk = weekStart(today);
    if (e.game) await this.prisma.challengeActivity.createMany({ data: [{ userId: e.userId, day: today, game: e.game }], skipDuplicates: true });
    const active = [...pick('daily', today).map((def) => ({ def, period: today })), ...pick('weekly', wk).map((def) => ({ def, period: wk }))];
    for (const { def, period } of active) {
      if (!advancedBy(def, e.event, e.game)) continue;
      await this.advance(e.userId, def, period, Math.max(1, Math.floor(e.amount ?? 1)), cfg);
    }
  }

  private async advance(userId: string, def: ChallengeDef, period: string, amount: number, cfg: ChallengesConfig) {
    let row;
    if (def.event === 'distinct') {
      const count = await this.distinctGames(userId, def.scope, period);
      row = await this.prisma.challengeProgress.upsert({ where: { userId_period_cid: { userId, period, cid: def.id } }, create: { userId, scope: def.scope, period, cid: def.id, progress: count }, update: { progress: count } });
    } else {
      row = await this.prisma.challengeProgress.upsert({ where: { userId_period_cid: { userId, period, cid: def.id } }, create: { userId, scope: def.scope, period, cid: def.id, progress: amount }, update: { progress: { increment: amount } } });
    }
    if (row.done || row.progress < def.target) return;

    // la récompense n'est versée que par la requête qui fait passer le défi à « réussi »
    const points = scaled(def.points, cfg), packs = def.packs ?? 0;
    const won = await this.prisma.$transaction(async (tx) => {
      await setSource(tx, 'challenges');
      const claimed = await tx.challengeProgress.updateMany({ where: { id: row.id, done: false }, data: { done: true, doneAt: new Date(), points, packs } });
      if (claimed.count === 0) return false;
      if (points > 0) await tx.user.update({ where: { id: userId }, data: { bonusPoints: { increment: points } } });
      return true;
    });
    if (!won) return;
    if (packs > 0) void this.cards.grantPack(userId, 'challenge', `${period}:${def.id}`);
    await this.notifications.notify({
      userId, type: 'SYSTEM', category: 'games', groupKey: 'challenges',
      title: `${def.icon} Défi réussi : ${def.title}`, body: `${points > 0 ? `+${points} points` : 'Bravo'}${packs > 0 ? ` et un paquet de cartes` : ''} !`, link: '/jeux/defis',
    }).catch(() => undefined);
    await this.checkBonus(userId, def.scope, period, cfg);
  }

  /** Quand les trois défis d'une période sont réussis, le bonus est versé (une seule fois). */
  private async checkBonus(userId: string, scope: Scope, period: string, cfg: ChallengesConfig) {
    const ids = pick(scope, period).map((d) => d.id);
    const done = await this.prisma.challengeProgress.count({ where: { userId, scope, period, cid: { in: ids }, done: true } });
    if (done < ids.length) return;
    const b = scope === 'daily' ? cfg.dailyBonus : cfg.weeklyBonus;
    const points = scaled(b.points, cfg);
    const made = await this.prisma.$transaction(async (tx) => {
      await setSource(tx, 'challenges');
      const r = await tx.challengeBonus.createMany({ data: [{ userId, scope, period, points, packs: b.packs }], skipDuplicates: true });
      if (r.count !== 1) return false;
      if (points > 0) await tx.user.update({ where: { id: userId }, data: { bonusPoints: { increment: points } } });
      return true;
    });
    if (!made) return;
    if (b.packs > 0) void this.cards.grantPack(userId, 'challenge', `${scope}:${period}`);
    await this.notifications.notify({
      userId, type: 'SYSTEM', category: 'games', groupKey: 'challenges',
      title: scope === 'daily' ? '🌟 Tous les défis du jour réussis !' : '🏆 Tous les défis de la semaine réussis !',
      body: `Bonus : ${points > 0 ? `+${points} points` : ''}${points > 0 && b.packs > 0 ? ' et ' : ''}${b.packs > 0 ? `${b.packs} paquet${b.packs > 1 ? 's' : ''} de cartes` : ''}.`, link: '/jeux/defis',
    }).catch(() => undefined);
  }

  // ------------------------------------------------------------------ page et résumé

  private view(def: ChallengeDef, row: { progress: number; done: boolean } | undefined, cfg: ChallengesConfig) {
    return { id: def.id, event: def.event, tier: def.tier, tierLabel: TIER_LABEL[def.tier], icon: def.icon, title: def.title, desc: def.desc, target: def.target, progress: Math.min(def.target, row?.progress ?? 0), done: !!row?.done, points: scaled(def.points, cfg), packs: def.packs ?? 0 };
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const a = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, parentId: true } });
    if (!a || a.parentId) throw new ForbiddenException('Réservé au compte principal');
    const today = torontoDay();
    const wk = weekStart(today);
    const daily = pick('daily', today), weekly = pick('weekly', wk);
    const [rows, bonuses, daysBonus, totals] = await Promise.all([
      this.prisma.challengeProgress.findMany({ where: { userId: accountId, period: { in: [today, wk] }, cid: { in: [...daily, ...weekly].map((d) => d.id) } } }),
      this.prisma.challengeBonus.findMany({ where: { userId: accountId, OR: [{ scope: 'daily', period: today }, { scope: 'weekly', period: wk }] } }),
      this.prisma.challengeBonus.findMany({ where: { userId: accountId, scope: 'daily', period: { gte: addDays(today, -60) } }, select: { period: true } }),
      this.prisma.challengeProgress.aggregate({ where: { userId: accountId, done: true }, _count: { _all: true }, _sum: { points: true } }),
    ]);
    const byKey = new Map(rows.map((r) => [`${r.period}:${r.cid}`, r]));
    const bonusOf = (scope: Scope, period: string, b: { points: number; packs: number }) => ({ done: bonuses.some((x) => x.scope === scope && x.period === period), points: scaled(b.points, cfg), packs: b.packs });
    const games = await this.prisma.challengeActivity.groupBy({ by: ['game'], where: { userId: accountId, day: today } });
    return {
      enabled: cfg.enabled, blocked: this.blocked(a, cfg), today, weekStart: wk,
      resetsAt: nextMidnightToronto().toISOString(), weekResetsAt: midnightOf(addDays(wk, 7)).toISOString(),
      daily: daily.map((d) => this.view(d, byKey.get(`${today}:${d.id}`), cfg)), weekly: weekly.map((d) => this.view(d, byKey.get(`${wk}:${d.id}`), cfg)),
      bonus: { daily: bonusOf('daily', today, cfg.dailyBonus), weekly: bonusOf('weekly', wk, cfg.weeklyBonus) },
      streak: bonusStreak(daysBonus.map((b) => b.period), today),
      gamesToday: games.map((g) => g.game),
      me: { completed: totals._count._all, points: totals._sum.points ?? 0 },
    };
  }

  /** Résumé pour la case de la page Jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const today = torontoDay();
    const wk = weekStart(today);
    const dIds = pick('daily', today).map((d) => d.id), wIds = pick('weekly', wk).map((d) => d.id);
    const [d, w, bonus, days] = await Promise.all([
      this.prisma.challengeProgress.count({ where: { userId: accountId, period: today, cid: { in: dIds }, done: true } }),
      this.prisma.challengeProgress.count({ where: { userId: accountId, period: wk, cid: { in: wIds }, done: true } }),
      this.prisma.challengeBonus.findFirst({ where: { userId: accountId, scope: 'daily', period: today }, select: { id: true } }),
      this.prisma.challengeBonus.findMany({ where: { userId: accountId, scope: 'daily', period: { gte: addDays(today, -60) } }, select: { period: true } }),
    ]);
    return { enabled: cfg.enabled, dailyDone: d, dailyTotal: dIds.length, weeklyDone: w, weeklyTotal: wIds.length, bonus: !!bonus, streak: bonusStreak(days.map((x) => x.period), today) };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const today = torontoDay();
    const wk = weekStart(today);
    const todays = [...pick('daily', today).map((def) => ({ def, period: today })), ...pick('weekly', wk).map((def) => ({ def, period: wk }))];
    const [done, started, bonusToday, bonusWeek, paid7, bonusPaid7, players] = await Promise.all([
      this.prisma.challengeProgress.groupBy({ by: ['cid'], where: { period: { in: [today, wk] }, done: true }, _count: { _all: true } }),
      this.prisma.challengeProgress.groupBy({ by: ['cid'], where: { period: { in: [today, wk] } }, _count: { _all: true } }),
      this.prisma.challengeBonus.count({ where: { scope: 'daily', period: today } }),
      this.prisma.challengeBonus.count({ where: { scope: 'weekly', period: wk } }),
      this.prisma.challengeProgress.aggregate({ where: { doneAt: { gt: new Date(Date.now() - 7 * DAY) } }, _sum: { points: true }, _count: { _all: true } }),
      this.prisma.challengeBonus.aggregate({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) } }, _sum: { points: true } }),
      this.prisma.challengeProgress.groupBy({ by: ['userId'], where: { updatedAt: { gt: new Date(Date.now() - 7 * DAY) } } }),
    ]);
    const cnt = (list: { cid: string; _count: { _all: number } }[], id: string) => list.find((x) => x.cid === id)?._count._all ?? 0;
    return {
      config,
      current: todays.map(({ def, period }) => ({ id: def.id, scope: def.scope, tier: def.tier, icon: def.icon, title: def.title, target: def.target, points: scaled(def.points, config), packs: def.packs ?? 0, started: cnt(started, def.id), done: cnt(done, def.id), period })),
      catalogSize: CHALLENGES.length,
      stats: { completions7d: paid7._count._all, pointsPaid7d: (paid7._sum.points ?? 0) + (bonusPaid7._sum.points ?? 0), bonusToday, bonusWeek, players7d: players.length },
    };
  }
}
