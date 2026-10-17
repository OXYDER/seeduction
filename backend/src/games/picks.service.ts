import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SportsService } from '../sports/sports.service';
import type { Game } from '../common/utils/nhl';
import { DEFAULT_PICKS, PicksConfig, Side, addDays, capped, isPerfectDay, normalizePicks, streakOf, weekStart, winPoints, winnerOf } from '../common/utils/picks';
import { torontoDay } from './wheel.service';
import { CardsService } from './cards.service';
import { emitChallenge } from '../common/utils/challenge-bus';

const KEY = 'picks';
const TZ = 'America/Toronto';
const DAY = 86400_000;
/** Un match introuvable dans le calendrier de la LNH trois jours après son heure est annulé (les pronostics ne comptent pas). */
const GRACE_MISSING = 3 * DAY;

export interface Actor { userId: string; username: string }

/**
 * Pronostics gratuits sur tous les matchs de la LNH. Le membre choisit le vainqueur avant le début du match ; le serveur règle le match dès que la LNH publie le résultat
 * final. Aucune mise : les points sont des cadeaux du site, plafonnés par jour et par semaine. Un match reporté ou introuvable est annulé.
 */
@Injectable()
export class PicksService {
  private readonly logger = new Logger(PicksService.name);
  private running = false;

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService, private sports: SportsService, private cards: CardsService) {}

  async config(): Promise<PicksConfig> { return normalizePicks(await this.settings.get(KEY), DEFAULT_PICKS); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizePicks(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'PICKS_CONFIG', next as any, ip);
    return next;
  }

  // ------------------------------------------------------------------ synchronisation et règlement (chaque minute)

  @Interval(60_000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      const today = torontoDay();
      const games = await this.sports.leagueGames(addDays(today, -1));
      if (games.length === 0) return;
      await this.sync(cfg, games, today);
      await this.settleDue(cfg, games);
    } catch (e) { this.logger.warn(`Pronostics LNH : ${(e as Error).message}`); }
    finally { this.running = false; }
  }

  /** Crée les matchs de la fenêtre (hier à dans quelques jours) et suit les changements d'heure. Les matchs de pré-saison ne sont pas proposés. */
  async sync(cfg: PicksConfig, games: Game[], today: string) {
    const from = addDays(today, -1), to = addDays(today, cfg.daysAhead - 1);
    const wanted = games.filter((g) => (g.kind === 'SAISON' || g.kind === 'SERIES') && g.date >= from && g.date <= to && g.id > 0 && g.startUtc);
    if (wanted.length === 0) return;
    const existing = await this.prisma.nhlGame.findMany({ where: { id: { in: wanted.map((g) => g.id) } }, select: { id: true, startUtc: true, status: true } });
    const byId = new Map(existing.map((m) => [m.id, m]));
    for (const g of wanted) {
      const m = byId.get(g.id);
      const start = new Date(g.startUtc);
      if (!m) {
        await this.prisma.nhlGame.create({
          data: { id: g.id, day: g.date, startUtc: start, kind: g.kind, homeAbbrev: g.home.abbrev, awayAbbrev: g.away.abbrev, homeName: g.home.name, awayName: g.away.name },
        }).catch(() => undefined); // créé en même temps ailleurs
      } else if (m.status === 'OPEN' && m.startUtc.getTime() !== start.getTime()) {
        await this.prisma.nhlGame.update({ where: { id: m.id }, data: { startUtc: start, day: g.date } });
      }
    }
  }

  /** Règle les matchs terminés et annule ceux qui sont reportés ou introuvables. */
  async settleDue(cfg: PicksConfig, games: Game[], now = new Date()) {
    const open = await this.prisma.nhlGame.findMany({ where: { status: 'OPEN', startUtc: { lt: new Date(now.getTime() + 30 * 60_000) } } });
    const byId = new Map(games.map((g) => [g.id, g]));
    for (const m of open) {
      const g = byId.get(m.id);
      if (!g) {
        if (now.getTime() - m.startUtc.getTime() > GRACE_MISSING) await this.voidGame(m.id, 'Match introuvable dans le calendrier de la LNH');
        continue;
      }
      if (g.state === 'PPD') { await this.voidGame(m.id, 'Match reporté ou annulé'); continue; }
      if (g.state === 'FINAL') {
        if (g.home.score === null || g.away.score === null) continue;
        await this.settleGame(m.id, { home: g.home.score, away: g.away.score, outcome: g.outcome }, cfg);
      }
    }
  }

  // ------------------------------------------------------------------ règlement

  /** Règle un match d'après son résultat final. Sans danger si deux règlements arrivent en même temps : seul le premier passe. */
  async settleGame(gameId: number, result: { home: number; away: number; outcome?: string | null }, cfg?: PicksConfig): Promise<boolean> {
    const conf = cfg ?? (await this.config());
    const winner = winnerOf(result.home, result.away);
    if (!winner) return this.voidGame(gameId, 'Score invalide');
    const paid: { userId: string; points: number; bonus: number; streak: number }[] = [];

    const game = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.nhlGame.updateMany({ where: { id: gameId, status: 'OPEN' }, data: { status: 'SETTLED', homeScore: result.home, awayScore: result.away, outcome: result.outcome ?? null, settledAt: new Date() } });
      if (claimed.count === 0) return null;
      const g = await tx.nhlGame.findUniqueOrThrow({ where: { id: gameId } });
      const picks = await tx.nhlPick.findMany({ where: { gameId, status: 'PENDING' } });
      const wk = weekStart(g.day), wkEnd = addDays(wk, 6);
      const now = new Date();
      for (const p of picks) {
        if (p.pick !== winner) { await tx.nhlPick.update({ where: { id: p.id }, data: { status: 'LOST', settledAt: now } }); continue; }
        const recent = await tx.nhlPick.findMany({ where: { userId: p.userId, status: { in: ['WON', 'LOST', 'VOID'] }, settledAt: { not: null } }, orderBy: { settledAt: 'desc' }, take: 20, select: { status: true } });
        const streak = streakOf(recent.map((r) => r.status));
        const [day, week] = await Promise.all([
          tx.nhlPick.aggregate({ where: { userId: p.userId, day: g.day, status: 'WON' }, _sum: { points: true } }),
          tx.nhlPick.aggregate({ where: { userId: p.userId, day: { gte: wk, lte: wkEnd }, status: 'WON' }, _sum: { points: true } }),
        ]);
        const points = capped(winPoints(conf, streak), day._sum.points ?? 0, week._sum.points ?? 0, conf);
        await tx.nhlPick.update({ where: { id: p.id }, data: { status: 'WON', points, streak, settledAt: now } });
        if (points > 0) await tx.user.update({ where: { id: p.userId }, data: { bonusPoints: { increment: points } } });
        // journée parfaite : toutes les prédictions du jour sont réglées et gagnées
        let bonus = 0;
        if (conf.perfectBonus > 0) {
          const statuses = (await tx.nhlPick.findMany({ where: { userId: p.userId, day: g.day }, select: { status: true } })).map((s) => s.status);
          if (isPerfectDay(statuses, conf)) {
            const made = await tx.nhlDayBonus.createMany({ data: [{ userId: p.userId, day: g.day, points: conf.perfectBonus }], skipDuplicates: true });
            if (made.count === 1) { bonus = conf.perfectBonus; await tx.user.update({ where: { id: p.userId }, data: { bonusPoints: { increment: bonus } } }); }
          }
        }
        paid.push({ userId: p.userId, points, bonus, streak });
      }
      return g;
    }, { timeout: 60_000, maxWait: 10_000 });
    if (!game) return false;

    const line = this.line(game, result.home, result.away, result.outcome);
    this.logger.log(`Pronostics LNH : ${line} réglé (${paid.length} bonne(s) prédiction(s))`);
    for (const w of paid) {
      // une journée parfaite rapporte aussi un paquet de cartes
      if (w.bonus > 0) void this.cards.grantPack(w.userId, 'picks', game.day);
      emitChallenge({ userId: w.userId, event: 'picks_won' });
      const total = w.points + w.bonus;
      if (total <= 0) continue;
      await this.notifications.notify({
        userId: w.userId, type: 'SYSTEM', category: 'games', groupKey: 'nhl-picks',
        title: `🎯 Pronostic réussi : +${total} points`,
        body: `${line}${w.streak > 0 ? ` · série de ${w.streak + 1} bonnes prédictions` : ''}${w.bonus > 0 ? ` · journée parfaite : +${w.bonus} points de bonus !` : ''}`, link: '/jeux/pronostics',
      }).catch(() => undefined);
    }
    return true;
  }

  /** Annule un match (reporté, introuvable ou décision de l'administration) : les pronostics ne comptent pas. */
  async voidGame(gameId: number, reason: string): Promise<boolean> {
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.nhlGame.updateMany({ where: { id: gameId, status: 'OPEN' }, data: { status: 'VOID', settledAt: new Date() } });
      if (claimed.count === 0) return false;
      await tx.nhlPick.updateMany({ where: { gameId, status: 'PENDING' }, data: { status: 'VOID', settledAt: new Date() } });
      return true;
    });
    if (done) this.logger.log(`Pronostics LNH : match ${gameId} annulé (${reason})`);
    return done;
  }

  private line(g: { homeName: string; awayName: string }, home: number, away: number, outcome?: string | null) {
    const ot = outcome && /prolongation/.test(outcome) ? ' (prolongation)' : outcome && /tirs/.test(outcome) ? ' (tirs de barrage)' : '';
    return `${g.awayName} ${away} – ${home} ${g.homeName}${ot}`;
  }

  // ------------------------------------------------------------------ côté membre

  private blocked(account: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: PicksConfig): string | null {
    if (!cfg.enabled) return 'Les pronostics sont fermés pour le moment';
    if (account.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (account.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - account.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  private async account(accountId: string) {
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    return account;
  }

  /** Statistiques de la semaine : bonnes prédictions, total réglé, points. */
  private async weekStats(userId: string, wk: string) {
    const rows = await this.prisma.nhlPick.groupBy({ by: ['status'], where: { userId, day: { gte: wk, lte: addDays(wk, 6) }, status: { in: ['WON', 'LOST'] } }, _count: { _all: true }, _sum: { points: true } });
    const won = rows.find((r) => r.status === 'WON'), lost = rows.find((r) => r.status === 'LOST');
    return { wins: won?._count._all ?? 0, total: (won?._count._all ?? 0) + (lost?._count._all ?? 0), points: won?._sum.points ?? 0 };
  }

  private async streakNow(userId: string): Promise<number> {
    const recent = await this.prisma.nhlPick.findMany({ where: { userId, status: { in: ['WON', 'LOST', 'VOID'] }, settledAt: { not: null } }, orderBy: { settledAt: 'desc' }, take: 40, select: { status: true } });
    return streakOf(recent.map((r) => r.status));
  }

  private async leaderboard(wk: string, accountId: string) {
    const where = { day: { gte: wk, lte: addDays(wk, 6) }, status: { in: ['WON', 'LOST'] } };
    const [all, wins] = await Promise.all([
      this.prisma.nhlPick.groupBy({ by: ['userId'], where, _count: { _all: true }, _sum: { points: true } }),
      this.prisma.nhlPick.groupBy({ by: ['userId'], where: { ...where, status: 'WON' }, _count: { _all: true } }),
    ]);
    const winOf = new Map(wins.map((w) => [w.userId, w._count._all]));
    const ranked = all.map((r) => ({ userId: r.userId, picks: r._count._all, wins: winOf.get(r.userId) ?? 0, points: r._sum.points ?? 0 }))
      .sort((a, b) => b.wins - a.wins || b.wins / b.picks - a.wins / a.picks || a.userId.localeCompare(b.userId));
    const top = ranked.slice(0, 10);
    const users = await this.prisma.user.findMany({ where: { id: { in: top.map((r) => r.userId) } }, select: { id: true, username: true } });
    const name = new Map(users.map((u) => [u.id, u.username]));
    const myRank = ranked.findIndex((r) => r.userId === accountId);
    return {
      rows: top.map((r, i) => ({ rank: i + 1, username: name.get(r.userId) ?? 'Membre supprimé', wins: r.wins, picks: r.picks, points: r.points, mine: r.userId === accountId })),
      myRank: myRank >= 0 ? myRank + 1 : null,
    };
  }

  /** La page des pronostics : les matchs d'un jour (aujourd'hui par défaut) avec mes choix, les fiches des équipes, le classement de la semaine. */
  async overview(accountId: string, dayParam?: string) {
    const cfg = await this.config();
    const account = await this.account(accountId);
    const today = torontoDay();
    const days = Array.from({ length: cfg.daysAhead + 1 }, (_, i) => addDays(today, i - 1));
    const day = dayParam && days.includes(dayParam) ? dayParam : today;
    const wk = weekStart(today);
    const [games, standings] = await Promise.all([
      this.prisma.nhlGame.findMany({ where: { day }, orderBy: [{ startUtc: 'asc' }, { id: 'asc' }] }),
      this.sports.standings(),
    ]);
    const ids = games.map((g) => g.id);
    const [mine, crowd, counts, week, streak, lastPrize, board, dayEarned, weekEarned, totals] = await Promise.all([
      this.prisma.nhlPick.findMany({ where: { userId: accountId, gameId: { in: ids } }, select: { gameId: true, pick: true, status: true, points: true } }),
      this.prisma.nhlPick.groupBy({ by: ['gameId', 'pick'], where: { gameId: { in: ids } }, _count: { _all: true } }),
      this.prisma.nhlGame.groupBy({ by: ['day'], where: { day: { in: days }, status: { not: 'VOID' } }, _count: { _all: true } }),
      this.weekStats(accountId, wk),
      this.streakNow(accountId),
      this.prisma.nhlWeekPrize.findMany({ where: { weekStart: addDays(wk, -7) }, orderBy: { rank: 'asc' } }),
      this.leaderboard(wk, accountId),
      this.prisma.nhlPick.aggregate({ where: { userId: accountId, day: today, status: 'WON' }, _sum: { points: true } }),
      this.prisma.nhlPick.aggregate({ where: { userId: accountId, day: { gte: wk, lte: addDays(wk, 6) }, status: 'WON' }, _sum: { points: true } }),
      this.prisma.nhlPick.aggregate({ where: { userId: accountId, status: 'WON' }, _count: { _all: true }, _sum: { points: true } }),
    ]);
    const bonusAll = await this.prisma.nhlDayBonus.aggregate({ where: { userId: accountId }, _sum: { points: true } });
    const myPick = new Map(mine.map((p) => [p.gameId, p]));
    const split = (id: number) => {
      const h = crowd.find((c) => c.gameId === id && c.pick === 'H')?._count._all ?? 0;
      const a = crowd.find((c) => c.gameId === id && c.pick === 'A')?._count._all ?? 0;
      return { home: h, away: a };
    };
    const rec = (abbrev: string) => standings.get(abbrev) ?? null;
    const prizeUsers = lastPrize.length ? await this.prisma.user.findMany({ where: { id: { in: lastPrize.map((p) => p.userId) } }, select: { id: true, username: true } }) : [];
    const prizeName = new Map(prizeUsers.map((u) => [u.id, u.username]));
    const now = Date.now();
    return {
      enabled: cfg.enabled, blocked: this.blocked(account, cfg), today, day, days: days.map((d) => ({ day: d, games: counts.find((c) => c.day === d)?._count._all ?? 0 })),
      rules: { perWin: cfg.pointsPerWin, comboPerWin: cfg.comboPerWin, comboMax: cfg.comboMax, perfect: cfg.perfectBonus, perfectMin: cfg.perfectMinGames, prizes: cfg.weeklyPrizes, weeklyMin: cfg.weeklyMinPicks },
      games: games.map((g) => ({
        id: g.id, startUtc: g.startUtc, status: g.status, locked: g.startUtc.getTime() <= now,
        home: { abbrev: g.homeAbbrev, name: g.homeName, score: g.homeScore, record: rec(g.homeAbbrev) },
        away: { abbrev: g.awayAbbrev, name: g.awayName, score: g.awayScore, record: rec(g.awayAbbrev) },
        outcome: g.outcome, mine: myPick.get(g.id) ?? null, crowd: split(g.id),
      })),
      me: {
        streak, week, weekStart: wk,
        dayEarned: dayEarned._sum.points ?? 0, dailyCap: cfg.dailyCap, weekEarned: weekEarned._sum.points ?? 0, weeklyCap: cfg.weeklyCap,
        wins: totals._count._all, won: (totals._sum.points ?? 0) + (bonusAll._sum.points ?? 0),
      },
      leaderboard: board,
      lastWeek: lastPrize.map((p) => ({ rank: p.rank, username: prizeName.get(p.userId) ?? 'Membre supprimé', points: p.points, wins: p.wins, picks: p.picks })),
    };
  }

  /** Résumé pour la case de la page Jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const today = torontoDay();
    const wk = weekStart(today);
    const [games, picked, upcoming, streak, week, totals, bonusAll] = await Promise.all([
      this.prisma.nhlGame.count({ where: { day: today, status: { not: 'VOID' } } }),
      this.prisma.nhlPick.count({ where: { userId: accountId, day: today, status: { not: 'VOID' } } }),
      this.prisma.nhlGame.count({ where: { day: today, status: 'OPEN', startUtc: { gt: new Date() } } }),
      this.streakNow(accountId),
      this.weekStats(accountId, wk),
      this.prisma.nhlPick.aggregate({ where: { userId: accountId, status: 'WON' }, _sum: { points: true } }),
      this.prisma.nhlDayBonus.aggregate({ where: { userId: accountId }, _sum: { points: true } }),
    ]);
    const open = upcoming === 0 ? 0 : Math.max(0, upcoming - (await this.prisma.nhlPick.count({ where: { userId: accountId, day: today, game: { status: 'OPEN', startUtc: { gt: new Date() } } } })));
    return { enabled: cfg.enabled, gamesToday: games, pickedToday: picked, toPick: open, streak, weekWins: week.wins, weekPicks: week.total, won: (totals._sum.points ?? 0) + (bonusAll._sum.points ?? 0) };
  }

  /** Choisit (ou change) le vainqueur d'un match avant son début. */
  async place(accountId: string, input: { gameId: number; pick: string }) {
    const cfg = await this.config();
    const account = await this.account(accountId);
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);
    if (input.pick !== 'H' && input.pick !== 'A') throw new BadRequestException('Choix invalide');
    const gameId = Number(input.gameId);
    if (!Number.isInteger(gameId)) throw new BadRequestException('Match invalide');
    const game = await this.prisma.nhlGame.findUnique({ where: { id: gameId } });
    if (!game || game.status !== 'OPEN') throw new BadRequestException('Les pronostics sont fermés pour ce match');
    if (game.startUtc.getTime() <= Date.now()) throw new BadRequestException('Le match a commencé : les pronostics sont fermés');
    const pick = input.pick as Side;
    const existed = await this.prisma.nhlPick.findUnique({ where: { userId_gameId: { userId: accountId, gameId } }, select: { id: true } });
    await this.prisma.nhlPick.upsert({ where: { userId_gameId: { userId: accountId, gameId } }, create: { userId: accountId, gameId, day: game.day, pick }, update: { pick } });
    if (!existed) emitChallenge({ userId: accountId, event: 'picks', game: 'picks' }); // changer d'avis ne compte pas deux fois
    return { ok: true, pick };
  }

  /** Retire son pronostic (avant le début du match). */
  async remove(accountId: string, gameId: number) {
    await this.account(accountId);
    const game = await this.prisma.nhlGame.findUnique({ where: { id: Number(gameId) } });
    if (!game || game.status !== 'OPEN' || game.startUtc.getTime() <= Date.now()) throw new BadRequestException('Les pronostics sont fermés pour ce match');
    await this.prisma.nhlPick.deleteMany({ where: { userId: accountId, gameId: game.id, status: 'PENDING' } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ prix de la semaine

  /** Chaque lundi matin, les trois meilleurs de la semaine précédente reçoivent un prix (le plus de bonnes prédictions, puis le meilleur pourcentage). */
  @Cron('30 5 * * 1', { timeZone: TZ })
  async payWeeklyPrizes(week?: string) {
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      const wk = week ?? addDays(weekStart(torontoDay()), -7);
      const where = { day: { gte: wk, lte: addDays(wk, 6) }, status: { in: ['WON', 'LOST'] } };
      const [all, wins] = await Promise.all([
        this.prisma.nhlPick.groupBy({ by: ['userId'], where, _count: { _all: true } }),
        this.prisma.nhlPick.groupBy({ by: ['userId'], where: { ...where, status: 'WON' }, _count: { _all: true } }),
      ]);
      const winOf = new Map(wins.map((w) => [w.userId, w._count._all]));
      const ranked = all.filter((r) => r._count._all >= cfg.weeklyMinPicks && (winOf.get(r.userId) ?? 0) > 0)
        .map((r) => ({ userId: r.userId, picks: r._count._all, wins: winOf.get(r.userId) ?? 0 }))
        .sort((a, b) => b.wins - a.wins || b.wins / b.picks - a.wins / a.picks || a.userId.localeCompare(b.userId)).slice(0, 3);
      for (let i = 0; i < ranked.length; i++) {
        const r = ranked[i], prize = cfg.weeklyPrizes[i];
        if (!prize) continue;
        const paid = await this.prisma.$transaction(async (tx) => {
          const made = await tx.nhlWeekPrize.createMany({ data: [{ weekStart: wk, userId: r.userId, rank: i + 1, points: prize, wins: r.wins, picks: r.picks }], skipDuplicates: true });
          if (made.count !== 1) return false;
          await tx.user.update({ where: { id: r.userId }, data: { bonusPoints: { increment: prize } } });
          return true;
        });
        if (!paid) continue;
        await this.notifications.notify({
          userId: r.userId, type: 'SYSTEM', category: 'games', title: `${['🥇', '🥈', '🥉'][i]} Pronostics LNH : +${prize} points`,
          body: `Tu as terminé ${i === 0 ? 'premier' : i === 1 ? 'deuxième' : 'troisième'} de la semaine avec ${r.wins} bonne${r.wins > 1 ? 's' : ''} prédiction${r.wins > 1 ? 's' : ''} sur ${r.picks}. Bravo !`, link: '/jeux/pronostics',
        }).catch(() => undefined);
      }
    } catch (e) { this.logger.warn(`Prix hebdomadaires des pronostics : ${(e as Error).message}`); }
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const today = torontoDay();
    const wk = weekStart(today);
    const since = (days: number) => addDays(today, -days);
    const [games, picksToday, week, all, players] = await Promise.all([
      this.prisma.nhlGame.findMany({ where: { day: { gte: since(3) } }, orderBy: [{ day: 'desc' }, { startUtc: 'desc' }], take: 60, include: { _count: { select: { picks: true } } } }),
      this.prisma.nhlPick.count({ where: { day: today } }),
      this.prisma.nhlPick.aggregate({ where: { day: { gte: wk, lte: addDays(wk, 6) } }, _count: { _all: true }, _sum: { points: true } }),
      this.prisma.nhlPick.aggregate({ _count: { _all: true }, _sum: { points: true } }),
      this.prisma.nhlPick.groupBy({ by: ['userId'], where: { day: { gte: since(6) } } }),
    ]);
    const bonus = await this.prisma.nhlDayBonus.aggregate({ _sum: { points: true } });
    const prizes = await this.prisma.nhlWeekPrize.aggregate({ _sum: { points: true } });
    return {
      config,
      stats: { picksToday, picksWeek: week._count._all, pointsWeek: week._sum.points ?? 0, picksAll: all._count._all, pointsAll: (all._sum.points ?? 0) + (bonus._sum.points ?? 0) + (prizes._sum.points ?? 0), players7d: players.length },
      games: games.map((g) => ({ id: g.id, day: g.day, startUtc: g.startUtc, status: g.status, home: g.homeName, away: g.awayName, homeScore: g.homeScore, awayScore: g.awayScore, picks: g._count.picks })),
    };
  }

  async adminSettle(actor: Actor, gameId: number, body: any, ip?: string | null) {
    const home = Math.floor(Number(body?.home)), away = Math.floor(Number(body?.away));
    if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0 || home > 30 || away > 30 || home === away) throw new BadRequestException('Score invalide (pas d\'égalité au hockey)');
    if (!(await this.prisma.nhlGame.findUnique({ where: { id: gameId }, select: { id: true } }))) throw new NotFoundException('Match introuvable');
    const ok = await this.settleGame(gameId, { home, away, outcome: typeof body?.outcome === 'string' ? body.outcome.slice(0, 30) : null });
    if (!ok) throw new BadRequestException('Ce match est déjà réglé ou annulé');
    await this.audit.log(actor.userId, 'PICKS_SETTLE', { gameId, home, away }, ip);
    return { ok: true };
  }

  async adminVoid(actor: Actor, gameId: number, ip?: string | null) {
    if (!(await this.prisma.nhlGame.findUnique({ where: { id: gameId }, select: { id: true } }))) throw new NotFoundException('Match introuvable');
    const ok = await this.voidGame(gameId, 'Annulé par un administrateur');
    if (!ok) throw new BadRequestException('Ce match est déjà réglé ou annulé');
    await this.audit.log(actor.userId, 'PICKS_VOID', { gameId }, ip);
    return { ok: true };
  }
}
