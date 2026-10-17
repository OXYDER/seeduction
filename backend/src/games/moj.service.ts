import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SportsService } from '../sports/sports.service';
import type { Game } from '../common/utils/nhl';
import { MARKETS, MARKET_LABELS, Market, MojConfig, DEFAULT_MOJ, FinalResult, freePrize, modeOf, normalizeMojConfig, settleMarket, validPick, winningPicks, MODE_LABELS } from '../common/utils/moj';
import { stakeable } from '../common/utils/points';

const KEY = 'moj';
const DAY = 86400_000;
const GRACE_MISSING = 3 * DAY; // un match introuvable dans le calendrier de la LNH trois jours après son heure est remboursé

export interface Actor { userId: string; username: string }

/**
 * Mise-O-jeu : paris et pronostics sur les matchs du Canadien. Caisse commune (les gagnants se partagent les mises des participants, le site ne crée aucun point
 * pour les mises) ; les pronostics gratuits rapportent une petite récompense fixe, plafonnée par semaine. Les points reçus par un don ne peuvent pas être misés.
 *
 * Cycle d'un match : OPEN (paris ouverts jusqu'au début du match) -> SETTLED (règlement automatique dès que la LNH publie le résultat final) ou REFUNDED
 * (match reporté, introuvable ou annulé par un administrateur : toutes les mises sont rendues).
 */
@Injectable()
export class MojService implements OnModuleInit {
  private readonly logger = new Logger(MojService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private sports: SportsService,
  ) {}

  // ------------------------------------------------------------------ démarrage et réglages

  /**
   * Une seule fois : les membres qui ont déjà reçu des points par un don les voient classés comme « points de don » (non misables), jusqu'à concurrence
   * de leur solde. Prudent : au pire, un peu de points misables sont comptés comme points de don.
   */
  async onModuleInit() {
    try {
      if (await this.settings.get('mojDonatedBackfill')) return;
      await this.prisma.$executeRaw`UPDATE "User" u SET "donatedPoints" = LEAST(u."bonusPoints", COALESCE((SELECT SUM(d."pointsGranted") FROM "Donation" d WHERE d."userId" = u.id), 0)) WHERE u."donatedPoints" = 0`;
      await this.settings.set('mojDonatedBackfill', { at: new Date().toISOString() });
      this.logger.log('Points de don existants repérés (non misables à Mise-O-jeu)');
    } catch (e) { this.logger.warn(`Repérage des points de don impossible pour l'instant : ${(e as Error).message}`); }
  }

  async config(): Promise<MojConfig> { return normalizeMojConfig(await this.settings.get(KEY), DEFAULT_MOJ); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeMojConfig(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'MOJ_CONFIG', next as any, ip);
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
      const games = await this.sports.seasonGames();
      if (games.length === 0) return;
      await this.sync(cfg, games);
      await this.settleDue(cfg, games);
    } catch (e) { this.logger.warn(`Mise-O-jeu : ${(e as Error).message}`); }
    finally { this.running = false; }
  }

  private bettable(cfg: MojConfig, g: Game) {
    return g.kind === 'SAISON' || g.kind === 'SERIES' || (cfg.preseason && g.kind === 'PRESAISON');
  }

  /** Crée les matchs qui ouvrent aux paris (calendrier de la LNH) et suit les changements d'heure. */
  async sync(cfg: MojConfig, games: Game[], now = new Date()) {
    const upcoming = games.filter((g) => (g.state === 'FUT' || g.state === 'PRE') && this.bettable(cfg, g)
      && new Date(g.startUtc) > now && new Date(g.startUtc).getTime() - now.getTime() < cfg.openDaysBefore * DAY);
    if (upcoming.length === 0) return;
    const existing = await this.prisma.mojMatch.findMany({ where: { nhlGameId: { in: upcoming.map((g) => g.id) } }, select: { id: true, nhlGameId: true, startUtc: true, status: true } });
    const byId = new Map(existing.map((m) => [m.nhlGameId, m]));
    const team = (await this.sports.config()).team;
    for (const g of upcoming) {
      const m = byId.get(g.id);
      if (!m) {
        await this.prisma.mojMatch.create({
          data: {
            nhlGameId: g.id, team, startUtc: new Date(g.startUtc), kind: g.kind,
            homeAbbrev: g.home.abbrev, awayAbbrev: g.away.abbrev, homeName: g.home.name, awayName: g.away.name, mineSide: g.side,
          },
        }).catch(() => undefined); // créé en même temps ailleurs
      } else if (m.status === 'OPEN' && m.startUtc.getTime() !== new Date(g.startUtc).getTime()) {
        await this.prisma.mojMatch.update({ where: { id: m.id }, data: { startUtc: new Date(g.startUtc) } });
      }
    }
  }

  /** Règle les matchs terminés et rembourse ceux qui sont reportés ou introuvables. */
  async settleDue(cfg: MojConfig, games: Game[], now = new Date()) {
    const open = await this.prisma.mojMatch.findMany({ where: { status: 'OPEN' } });
    const byId = new Map(games.map((g) => [g.id, g]));
    for (const m of open) {
      const g = byId.get(m.nhlGameId);
      if (!g) {
        if (now.getTime() - m.startUtc.getTime() > GRACE_MISSING) await this.refundMatch(m.id, 'Match introuvable dans le calendrier de la LNH');
        continue;
      }
      if (g.state === 'PPD') { await this.refundMatch(m.id, 'Match reporté ou annulé'); continue; }
      if (g.state === 'FINAL') {
        const mine = g.side === 'home' ? g.home.score : g.away.score;
        const theirs = g.side === 'home' ? g.away.score : g.home.score;
        if (mine === null || theirs === null) continue;
        await this.settleMatch(m.id, { mine, theirs, mode: modeOf(g.outcome) }, cfg);
      }
    }
  }

  // ------------------------------------------------------------------ règlement

  private async weeklyFreeWins(userIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.mojBet.groupBy({ by: ['userId'], where: { userId: { in: userIds }, stake: 0, payout: { gt: 0 }, settledAt: { gt: new Date(Date.now() - 7 * DAY) } }, _sum: { payout: true } });
    return new Map(rows.map((r) => [r.userId, r._sum.payout ?? 0]));
  }

  /** Règle un match d'après son résultat final. Sans danger si deux règlements arrivent en même temps : seul le premier passe. */
  async settleMatch(matchId: string, result: FinalResult, cfg?: MojConfig): Promise<boolean> {
    const conf = cfg ?? (await this.config());
    const wins = winningPicks(result);
    const summary = new Map<string, { won: number; refunded: number; lost: number; wins: string[] }>();
    const sum = (u: string) => { let s = summary.get(u); if (!s) { s = { won: 0, refunded: 0, lost: 0, wins: [] }; summary.set(u, s); } return s; };

    const match = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mojMatch.updateMany({ where: { id: matchId, status: 'OPEN' }, data: { status: 'SETTLED', result: result as any, settledAt: new Date() } });
      if (claimed.count === 0) return null;
      const bets = await tx.mojBet.findMany({ where: { matchId, status: 'PENDING' } });
      const weekly = await this.weeklyFreeWins([...new Set(bets.filter((b) => b.stake === 0).map((b) => b.userId))]);
      const now = new Date();
      for (const market of MARKETS) {
        const ofMarket = bets.filter((b) => b.market === market);
        const paid = ofMarket.filter((b) => b.stake > 0);
        const settlement = settleMarket(paid.map((b) => ({ id: b.id, userId: b.userId, stake: b.stake, pick: b.pick })), wins[market], conf.minPlayers);
        for (const b of paid) {
          const payout = settlement.payouts.get(b.id) ?? 0;
          const status = settlement.refund ? 'REFUNDED' : payout > 0 ? 'WON' : 'LOST';
          await tx.mojBet.update({ where: { id: b.id }, data: { status, payout: payout > 0 ? payout : null, settledAt: now } });
          if (payout > 0) await tx.user.update({ where: { id: b.userId }, data: { bonusPoints: { increment: payout } } });
          const s = sum(b.userId);
          if (status === 'REFUNDED') s.refunded += payout; else if (status === 'WON') { s.won += payout - b.stake; s.wins.push(MARKET_LABELS[market]); } else s.lost += b.stake;
        }
        for (const b of ofMarket.filter((x) => x.stake === 0)) {
          const hit = b.pick === wins[market];
          const prize = hit ? freePrize(conf, market, weekly.get(b.userId) ?? 0) : 0;
          await tx.mojBet.update({ where: { id: b.id }, data: { status: hit ? 'WON' : 'LOST', payout: prize > 0 ? prize : null, settledAt: now } });
          if (prize > 0) {
            await tx.user.update({ where: { id: b.userId }, data: { bonusPoints: { increment: prize } } });
            weekly.set(b.userId, (weekly.get(b.userId) ?? 0) + prize);
            const s = sum(b.userId); s.won += prize; s.wins.push(`${MARKET_LABELS[market]} (gratuit)`);
          } else if (hit) sum(b.userId).wins.push(`${MARKET_LABELS[market]} (plafond de la semaine atteint)`);
        }
      }
      return tx.mojMatch.findUniqueOrThrow({ where: { id: matchId } });
    }, { timeout: 60_000, maxWait: 10_000 });
    if (!match) return false;

    const line = this.line(match, result);
    this.logger.log(`Mise-O-jeu : ${line} réglé (${summary.size} participant(s))`);
    for (const [userId, s] of summary) {
      const parts = [s.won > 0 ? `+${s.won} points gagnés` : '', s.refunded > 0 ? `${s.refunded} points remboursés (pas assez de joueurs ou aucun gagnant)` : '', s.lost > 0 ? `${s.lost} points perdus` : ''].filter(Boolean);
      await this.notifications.notify({
        userId, type: 'SYSTEM', category: 'games',
        title: s.won > 0 ? `🏆 Mise-O-jeu : tu as gagné ${s.won} points !` : s.refunded > 0 && s.lost === 0 ? '🏒 Mise-O-jeu : tes mises te sont rendues' : '🏒 Mise-O-jeu : résultat du match',
        body: `${line}. ${parts.join(' · ')}${s.wins.length ? `. Gagné : ${s.wins.join(', ')}` : ''}`, link: '/jeux/mise-o-jeu',
      }).catch(() => undefined);
    }
    return true;
  }

  /** Rembourse un match : mises rendues, pronostics gratuits annulés. */
  async refundMatch(matchId: string, reason: string): Promise<boolean> {
    const touched = new Map<string, number>();
    const match = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mojMatch.updateMany({ where: { id: matchId, status: 'OPEN' }, data: { status: 'REFUNDED', settledAt: new Date() } });
      if (claimed.count === 0) return null;
      const now = new Date();
      for (const b of await tx.mojBet.findMany({ where: { matchId, status: 'PENDING' } })) {
        await tx.mojBet.update({ where: { id: b.id }, data: { status: 'REFUNDED', payout: b.stake > 0 ? b.stake : null, settledAt: now } });
        if (b.stake > 0) { await tx.user.update({ where: { id: b.userId }, data: { bonusPoints: { increment: b.stake } } }); touched.set(b.userId, (touched.get(b.userId) ?? 0) + b.stake); }
      }
      return tx.mojMatch.findUniqueOrThrow({ where: { id: matchId } });
    }, { timeout: 60_000, maxWait: 10_000 });
    if (!match) return false;
    this.logger.log(`Mise-O-jeu : ${match.homeAbbrev}-${match.awayAbbrev} remboursé (${reason})`);
    for (const [userId, points] of touched) {
      await this.notifications.notify({ userId, type: 'SYSTEM', category: 'games', title: `🏒 Mise-O-jeu : ${points} points remboursés`, body: `${match.awayName} @ ${match.homeName} : ${reason}.`, link: '/jeux/mise-o-jeu' }).catch(() => undefined);
    }
    return true;
  }

  private line(m: { homeName: string; awayName: string; mineSide: string }, r: FinalResult) {
    const mine = m.mineSide === 'home' ? m.homeName : m.awayName;
    const other = m.mineSide === 'home' ? m.awayName : m.homeName;
    return `${mine} ${r.mine} – ${r.theirs} ${other}${r.mode === 'OT' ? ' (prolongation)' : r.mode === 'SO' ? ' (tirs de barrage)' : ''}`;
  }

  // ------------------------------------------------------------------ côté membre

  /** Statistiques pour la case de Mise-O-jeu sur la page des jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const now = new Date();
    const [openMatches, next, openPool, players, mine, active] = await Promise.all([
      this.prisma.mojMatch.count({ where: { status: 'OPEN', startUtc: { gt: now } } }),
      this.prisma.mojMatch.findFirst({ where: { status: 'OPEN', startUtc: { gt: now } }, orderBy: { startUtc: 'asc' } }),
      this.prisma.mojBet.aggregate({ where: { stake: { gt: 0 }, match: { status: 'OPEN' } }, _sum: { stake: true } }),
      this.prisma.mojBet.groupBy({ by: ['userId'], where: { createdAt: { gt: new Date(now.getTime() - 7 * DAY) } } }),
      this.prisma.mojBet.aggregate({ where: { userId: accountId, status: { in: ['WON', 'LOST', 'REFUNDED'] } }, _sum: { payout: true, stake: true }, _count: { _all: true } }),
      this.prisma.mojBet.count({ where: { userId: accountId, status: 'PENDING' } }),
    ]);
    return {
      enabled: cfg.enabled, openMatches, openPool: openPool._sum.stake ?? 0, playersWeek: players.length, myActiveBets: active, myBetsSettled: mine._count._all,
      myNet: (mine._sum.payout ?? 0) - (mine._sum.stake ?? 0),
      next: next ? {
        startUtc: next.startUtc, side: next.mineSide, kind: next.kind,
        mine: next.mineSide === 'home' ? { abbrev: next.homeAbbrev, name: next.homeName } : { abbrev: next.awayAbbrev, name: next.awayName },
        other: next.mineSide === 'home' ? { abbrev: next.awayAbbrev, name: next.awayName } : { abbrev: next.homeAbbrev, name: next.homeName },
      } : null,
    };
  }

  /** Pourquoi ce compte ne peut pas parier (null : il peut). */
  private async blocked(account: { status: string; createdAt: Date; gamesOptOut: boolean; parentId: string | null }, cfg: MojConfig): Promise<string | null> {
    if (!cfg.enabled) return 'Mise-O-jeu est fermé pour le moment';
    if (account.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (account.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir quand tu veux)';
    const age = Math.floor((Date.now() - account.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { id: true, status: true, createdAt: true, gamesOptOut: true, parentId: true, bonusPoints: true, donatedPoints: true } });
    if (!account) throw new NotFoundException();
    const now = new Date();
    const [matches, recent] = await Promise.all([
      this.prisma.mojMatch.findMany({ where: { status: 'OPEN' }, orderBy: { startUtc: 'asc' }, take: 20 }),
      this.prisma.mojMatch.findMany({ where: { status: { in: ['SETTLED', 'REFUNDED'] } }, orderBy: { startUtc: 'desc' }, take: 8 }),
    ]);
    const ids = [...matches, ...recent].map((m) => m.id);
    const [pools, mine, stakedToday, weekFree] = await Promise.all([
      this.prisma.mojBet.groupBy({ by: ['matchId', 'market', 'pick'], where: { matchId: { in: matches.map((m) => m.id) }, stake: { gt: 0 } }, _sum: { stake: true }, _count: { _all: true } }),
      this.prisma.mojBet.findMany({ where: { userId: accountId, matchId: { in: ids } } }),
      this.prisma.mojBet.aggregate({ where: { userId: accountId, stake: { gt: 0 }, createdAt: { gt: new Date(now.getTime() - DAY) } }, _sum: { stake: true } }),
      this.weeklyFreeWins([accountId]),
    ]);
    const poolOf = (matchId: string) => {
      const out: Record<string, Record<string, { points: number; players: number }>> = {};
      for (const p of pools.filter((x) => x.matchId === matchId)) (out[p.market] ??= {})[p.pick] = { points: p._sum.stake ?? 0, players: p._count._all };
      return out;
    };
    const betsOf = (matchId: string) => mine.filter((b) => b.matchId === matchId).map((b) => ({ market: b.market, pick: b.pick, stake: b.stake, status: b.status, payout: b.payout }));
    const shape = (m: (typeof matches)[number]) => ({
      id: m.id, startUtc: m.startUtc, kind: m.kind, status: m.status, result: m.result, mineSide: m.mineSide,
      home: { abbrev: m.homeAbbrev, name: m.homeName }, away: { abbrev: m.awayAbbrev, name: m.awayName },
      locked: m.startUtc <= now, pools: poolOf(m.id), mine: betsOf(m.id),
    });
    return {
      config: { enabled: cfg.enabled, minStake: cfg.minStake, maxStake: cfg.maxStake, dailyStakeMax: cfg.dailyStakeMax, minPlayers: cfg.minPlayers, freePrize: cfg.freePrize, freeWeeklyCap: cfg.freeWeeklyCap, markets: cfg.markets },
      me: {
        points: Math.floor(account.bonusPoints), donated: Math.floor(Math.min(account.donatedPoints, account.bonusPoints)), stakeable: stakeable(account.bonusPoints, account.donatedPoints),
        optOut: account.gamesOptOut, blocked: await this.blocked(account, cfg), stakedToday: stakedToday._sum.stake ?? 0, freeWonWeek: weekFree.get(accountId) ?? 0,
      },
      matches: matches.map(shape),
      recent: recent.map(shape),
      leaderboard: await this.leaderboard(),
    };
  }

  private async leaderboard() {
    const rows = await this.prisma.mojBet.groupBy({ by: ['userId'], where: { status: { in: ['WON', 'LOST', 'REFUNDED'] } }, _sum: { payout: true, stake: true } });
    const wins = await this.prisma.mojBet.groupBy({ by: ['userId'], where: { status: 'WON' }, _count: { _all: true } });
    const winCount = new Map(wins.map((w) => [w.userId, w._count._all]));
    const ranked = rows.map((r) => ({ userId: r.userId, net: (r._sum.payout ?? 0) - (r._sum.stake ?? 0), wins: winCount.get(r.userId) ?? 0 })).filter((r) => r.net !== 0 || r.wins > 0)
      .sort((a, b) => b.net - a.net || b.wins - a.wins).slice(0, 10);
    const users = await this.prisma.user.findMany({ where: { id: { in: ranked.map((r) => r.userId) } }, select: { id: true, username: true } });
    const name = new Map(users.map((u) => [u.id, u.username]));
    return ranked.map((r, i) => ({ rank: i + 1, username: name.get(r.userId) ?? 'Membre supprimé', net: r.net, wins: r.wins }));
  }

  /** Pari ou pronostic gratuit (mise 0). Le débit des points et l'enregistrement du pari se font ensemble ; deux clics simultanés ne peuvent pas parier deux fois. */
  async place(accountId: string, input: { matchId: string; market: string; pick: string; stake?: number }) {
    const cfg = await this.config();
    const market = input.market as Market;
    if (!MARKETS.includes(market) || !cfg.markets[market]) throw new BadRequestException('Ce type de pari n\'est pas proposé');
    if (!validPick(market, input.pick)) throw new BadRequestException('Choix invalide');
    const stake = Math.floor(Number(input.stake ?? 0));
    if (!Number.isFinite(stake) || stake < 0) throw new BadRequestException('Mise invalide');
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    const why = await this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);
    if (stake > 0) {
      if (stake < cfg.minStake) throw new BadRequestException(`Mise minimale : ${cfg.minStake} points (ou joue gratuitement)`);
      if (stake > cfg.maxStake) throw new BadRequestException(`Mise maximale : ${cfg.maxStake} points par pari`);
      if (cfg.dailyStakeMax > 0) {
        const today = await this.prisma.mojBet.aggregate({ where: { userId: accountId, stake: { gt: 0 }, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { stake: true } });
        const left = cfg.dailyStakeMax - (today._sum.stake ?? 0);
        if (stake > left) throw new BadRequestException(left > 0 ? `Limite journalière : tu ne peux plus miser que ${left} points aujourd'hui` : 'Limite journalière atteinte : reviens demain');
      }
    }
    const match = await this.prisma.mojMatch.findUnique({ where: { id: input.matchId } });
    if (!match || match.status !== 'OPEN') throw new BadRequestException('Les paris sont fermés pour ce match');
    if (match.startUtc.getTime() <= Date.now()) throw new BadRequestException('Le match a commencé : les paris sont fermés');

    try {
      await this.prisma.$transaction(async (tx) => {
        if (stake > 0) {
          // Seuls les points qui ne viennent pas d'un don sont misables (comparaison faite par la base, en une seule étape atomique).
          const debited = await tx.$executeRaw`UPDATE "User" SET "bonusPoints" = "bonusPoints" - ${stake} WHERE "id" = ${accountId} AND "bonusPoints" - LEAST("donatedPoints", "bonusPoints") >= ${stake}`;
          if (debited === 0) throw new BadRequestException('Points misables insuffisants (les points reçus par un don ne peuvent pas être misés)');
        }
        await tx.mojBet.create({ data: { matchId: match.id, userId: accountId, market, pick: input.pick, stake } });
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Tu as déjà joué ce pari pour ce match');
      throw e;
    }
    return { ok: true, stake };
  }

  async setOptOut(accountId: string, value: boolean) {
    await this.prisma.user.update({ where: { id: accountId }, data: { gamesOptOut: !!value } });
    return { ok: true, optOut: !!value };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const [config, matches, bets] = await Promise.all([
      this.config(),
      this.prisma.mojMatch.findMany({ orderBy: { startUtc: 'desc' }, take: 30 }),
      this.prisma.mojBet.groupBy({ by: ['matchId'], _sum: { stake: true }, _count: { _all: true } }),
    ]);
    const byMatch = new Map(bets.map((b) => [b.matchId, b]));
    return {
      config,
      matches: matches.map((m) => ({
        id: m.id, startUtc: m.startUtc, status: m.status, result: m.result, kind: m.kind,
        home: m.homeName, away: m.awayName, homeAbbrev: m.homeAbbrev, awayAbbrev: m.awayAbbrev, mineSide: m.mineSide,
        bets: byMatch.get(m.id)?._count._all ?? 0, staked: byMatch.get(m.id)?._sum.stake ?? 0,
      })),
    };
  }

  async adminRefund(actor: Actor, matchId: string, ip?: string | null) {
    const ok = await this.refundMatch(matchId, 'Remboursé par un administrateur');
    if (!ok) throw new BadRequestException('Ce match est déjà réglé ou remboursé');
    await this.audit.log(actor.userId, 'MOJ_REFUND', { matchId }, ip);
    return { ok: true };
  }

  async adminSettle(actor: Actor, matchId: string, body: any, ip?: string | null) {
    const mine = Math.floor(Number(body?.mine)), theirs = Math.floor(Number(body?.theirs));
    const mode = body?.mode;
    if (!Number.isFinite(mine) || !Number.isFinite(theirs) || mine < 0 || theirs < 0 || mine > 30 || theirs > 30 || mine === theirs) throw new BadRequestException('Score invalide (pas d\'égalité au hockey)');
    if (!(mode in MODE_LABELS)) throw new BadRequestException('Fin de match invalide');
    const ok = await this.settleMatch(matchId, { mine, theirs, mode });
    if (!ok) throw new BadRequestException('Ce match est déjà réglé ou remboursé');
    await this.audit.log(actor.userId, 'MOJ_SETTLE', { matchId, mine, theirs, mode }, ip);
    return { ok: true };
  }
}
