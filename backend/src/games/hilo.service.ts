import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { Config, DEFAULT_HILO, DECK, Guess, isWin, nextMultBp, normalizeHiLo, odds, payoutOf, rankOf, stepHundredths, suitOf } from '../common/utils/hilo';
import { stakeable } from '../common/utils/points';
import { startOfDayToronto } from './slots.service';
import { emitChallenge } from '../common/utils/challenge-bus';

const KEY = 'hilo';
const DAY = 86400_000;
const MIN_INTERVAL_MS = 400;

export interface Actor { userId: string; username: string }

interface GameRow {
  id: string; userId: string; stake: number; valued: number; daily: boolean; status: string; step: number; card: number; multBp: number;
  payout: number | null; history: unknown; createdAt: Date; updatedAt: Date; endedAt: Date | null;
}
interface Seen { card: number; guess?: Guess; won?: boolean }

const cardView = (c: number) => ({ code: c, rank: rankOf(c), suit: suitOf(c) });

/**
 * « Plus haut ou plus bas ». Le serveur tire chaque carte (générateur sécurisé) ; le navigateur n'affiche que ce qu'il reçoit. Une partie commence en débitant la mise
 * (points qui ne viennent pas d'un don) et se termine par un encaissement (gain = mise × multiplicateur, plafonné), une perte ou un remboursement. Une seule partie
 * active par membre. Une partie abandonnée est réglée d'office après un moment d'inactivité.
 */
@Injectable()
export class HiLoService {
  private readonly logger = new Logger(HiLoService.name);
  private busy = new Set<string>();
  private last = new Map<string, number>();

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService) {}

  async config(): Promise<Config> { return normalizeHiLo(await this.settings.get(KEY), DEFAULT_HILO); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeHiLo(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'HILO_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: Config): string | null {
    if (!cfg.enabled) return 'Le jeu est fermé pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  /** Pertes nettes sur 24 h : mises des parties payantes moins ce qu'elles ont rendu (une partie en cours compte comme mise perdue). */
  private async lossToday(userId: string): Promise<number> {
    const r = await this.prisma.hiLoGame.aggregate({ where: { userId, daily: false, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { stake: true, payout: true } });
    return Math.max(0, (r._sum.stake ?? 0) - (r._sum.payout ?? 0));
  }

  /** Ce que le navigateur reçoit d'une partie : la carte, la série, le gain actuel et, pour chaque réponse, sa probabilité et son multiplicateur. */
  private view(g: GameRow, cfg: Config, extra: Record<string, unknown> = {}) {
    const seen = (Array.isArray(g.history) ? g.history : []) as Seen[];
    const rank = rankOf(g.card);
    const o = odds(rank, cfg.edge);
    const nowPayout = payoutOf(g.valued, g.multBp, g.daily ? Math.min(cfg.maxWin || Infinity, cfg.dailyFree.maxWin || Infinity) : cfg.maxWin);
    return {
      id: g.id, status: g.status, daily: g.daily, stake: g.valued, paid: g.stake, step: g.step, card: cardView(g.card), multiplier: g.multBp / 10_000, payoutNow: nowPayout,
      payout: g.payout, odds: g.status === 'ACTIVE' ? o : null, history: seen.map((s) => ({ ...cardView(s.card), guess: s.guess ?? null, won: s.won ?? null })),
      canCashOut: g.status === 'ACTIVE' && g.step >= 1, ...extra,
    };
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, bonusPoints: true, donatedPoints: true } });
    if (!account) throw new BadRequestException('Compte introuvable');
    const [active, loss, freeToday, recent, best, big] = await Promise.all([
      this.prisma.hiLoGame.findFirst({ where: { userId: accountId, status: 'ACTIVE' } }),
      this.lossToday(accountId),
      this.prisma.hiLoGame.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
      this.prisma.hiLoGame.findMany({ where: { userId: accountId, status: { not: 'ACTIVE' } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, stake: true, valued: true, daily: true, status: true, step: true, payout: true, createdAt: true } }),
      this.prisma.hiLoGame.findMany({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, step: { gt: 0 } }, orderBy: [{ step: 'desc' }, { payout: 'desc' }], take: 8, select: { userId: true, step: true, payout: true, valued: true, status: true } }),
      this.prisma.hiLoGame.findMany({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, payout: { gt: 0 } }, orderBy: { payout: 'desc' }, take: 5, select: { userId: true, payout: true, valued: true, step: true } }),
    ]);
    const ids = [...new Set([...best.map((b) => b.userId), ...big.map((b) => b.userId)])];
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    const nm = (id: string) => names.get(id) ?? 'Membre supprimé';
    return {
      config: { enabled: cfg.enabled, minStake: cfg.minStake, maxStake: cfg.maxStake, maxWin: cfg.maxWin, dailyLossMax: cfg.dailyLossMax, dailyFree: cfg.dailyFree, idleMinutes: cfg.idleMinutes },
      me: {
        points: Math.floor(account.bonusPoints), donated: Math.floor(Math.min(account.donatedPoints, account.bonusPoints)), stakeable: stakeable(account.bonusPoints, account.donatedPoints),
        blocked: this.blocked(account, cfg), lossLeft: cfg.dailyLossMax > 0 ? Math.max(0, cfg.dailyLossMax - loss) : null, dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      },
      active: active ? this.view(active, cfg) : null,
      recent, bestStreaks: best.map((b) => ({ username: nm(b.userId), step: b.step, payout: b.payout ?? 0, stake: b.valued, status: b.status })),
      biggest: big.map((b) => ({ username: nm(b.userId), payout: b.payout ?? 0, stake: b.valued, step: b.step })),
    };
  }

  private async lock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(accountId)) throw new BadRequestException('Une action est déjà en cours');
    if (Date.now() - (this.last.get(accountId) ?? 0) < MIN_INTERVAL_MS) throw new BadRequestException('Doucement : une action à la fois');
    this.busy.add(accountId);
    try { return await fn(); } finally { this.busy.delete(accountId); this.last.set(accountId, Date.now()); if (this.last.size > 5000) this.last.clear(); }
  }

  /** Commence une partie : la mise est débitée (sauf partie gratuite quotidienne) et une première carte est tirée. */
  async start(accountId: string, input: { stake?: number; daily?: boolean }) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);
    const daily = input.daily === true;
    let stake = Math.floor(Number(input.stake));
    if (daily) {
      if (!cfg.dailyFree.enabled) throw new BadRequestException('La partie gratuite quotidienne n\'est pas offerte');
      if ((await this.prisma.hiLoGame.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } })) > 0) throw new BadRequestException('Tu as déjà joué ta partie gratuite d\'aujourd\'hui : reviens demain');
      stake = cfg.dailyFree.stake;
    } else {
      if (!Number.isFinite(stake) || stake < cfg.minStake || stake > cfg.maxStake || stake % 5 !== 0) throw new BadRequestException(`Mise invalide : de ${cfg.minStake} à ${cfg.maxStake} points, par pas de 5`);
      if (cfg.dailyLossMax > 0) {
        const loss = await this.lossToday(accountId);
        if (loss + stake > cfg.dailyLossMax) throw new BadRequestException(loss >= cfg.dailyLossMax ? 'Limite de pertes atteinte : reviens demain' : `Limite de pertes : tu ne peux plus perdre que ${cfg.dailyLossMax - loss} points aujourd'hui, baisse ta mise`);
      }
    }
    return this.lock(accountId, async () => {
      const card = randomInt(DECK);
      try {
        const game = await this.prisma.$transaction(async (tx) => {
          if (!daily) {
            const debited = await tx.$executeRaw`UPDATE "User" SET "bonusPoints" = "bonusPoints" - ${stake} WHERE "id" = ${accountId} AND "bonusPoints" - LEAST("donatedPoints", "bonusPoints") >= ${stake}`;
            if (debited === 0) throw new BadRequestException('Points misables insuffisants (les points reçus par un don ne peuvent pas être misés)');
          }
          return tx.hiLoGame.create({ data: { userId: accountId, stake: daily ? 0 : stake, valued: stake, daily, card, active: 'A', history: [{ card }] as any } });
        });
        if (daily) emitChallenge({ userId: accountId, event: 'free_play', game: 'hilo' });
        return { game: this.view(game as GameRow, cfg) };
      } catch (e: any) {
        if (e?.code === 'P2002') throw new BadRequestException('Tu as déjà une partie en cours : termine-la d\'abord');
        throw e;
      }
    });
  }

  /** Réponse du joueur : une nouvelle carte est tirée. Bonne réponse : la série continue ; mauvaise (ou égalité) : la partie est perdue. */
  async guess(accountId: string, gameId: string, guess: string) {
    if (guess !== 'H' && guess !== 'L') throw new BadRequestException('Réponse invalide');
    const cfg = await this.config();
    return this.lock(accountId, async () => {
      const g = (await this.prisma.hiLoGame.findFirst({ where: { id: gameId, userId: accountId, status: 'ACTIVE' } })) as GameRow | null;
      if (!g) throw new BadRequestException('Cette partie est terminée');
      const stepH = stepHundredths(rankOf(g.card), guess, cfg.edge);
      if (stepH === null) throw new BadRequestException(guess === 'H' ? 'Aucune carte n\'est plus haute qu\'un as' : 'Aucune carte n\'est plus basse qu\'un 2');
      const next = randomInt(DECK);
      const won = isWin(rankOf(g.card), rankOf(next), guess);
      const history = [...((Array.isArray(g.history) ? g.history : []) as Seen[]).map((s, i, arr) => (i === arr.length - 1 ? { ...s, guess, won } : s)), { card: next }];
      const capped = g.daily ? Math.min(cfg.maxWin || Infinity, cfg.dailyFree.maxWin || Infinity) : cfg.maxWin;
      if (!won) {
        const res = await this.prisma.hiLoGame.updateMany({ where: { id: g.id, status: 'ACTIVE', step: g.step }, data: { status: 'LOST', active: null, card: next, history: history as any, endedAt: new Date(), payout: null } });
        if (res.count === 0) throw new BadRequestException('Cette partie vient d\'être modifiée : recharge la page');
        const after = (await this.prisma.hiLoGame.findUniqueOrThrow({ where: { id: g.id } })) as GameRow;
        return { game: this.view(after, cfg, { result: 'lost', revealed: cardView(next) }) };
      }
      const multBp = nextMultBp(g.multBp, stepH);
      const reached = Number.isFinite(capped) && capped > 0 && payoutOf(g.valued, multBp) >= capped;
      const res = await this.prisma.hiLoGame.updateMany({ where: { id: g.id, status: 'ACTIVE', step: g.step }, data: { step: g.step + 1, card: next, multBp, history: history as any } });
      if (res.count === 0) throw new BadRequestException('Cette partie vient d\'être modifiée : recharge la page');
      if (reached) return this.settle(g.id, accountId, cfg, 'maxed', { revealed: cardView(next) });
      const after = (await this.prisma.hiLoGame.findUniqueOrThrow({ where: { id: g.id } })) as GameRow;
      return { game: this.view(after, cfg, { result: 'won', revealed: cardView(next) }) };
    });
  }

  async cashOut(accountId: string, gameId: string) {
    const cfg = await this.config();
    return this.lock(accountId, () => this.settle(gameId, accountId, cfg, 'cashed'));
  }

  /** Encaisse une partie (au moins une bonne réponse) : le gain est versé en une seule étape, une seule fois. */
  private async settle(gameId: string, accountId: string, cfg: Config, how: 'cashed' | 'maxed' | 'idle', extra: Record<string, unknown> = {}) {
    const g = (await this.prisma.hiLoGame.findFirst({ where: { id: gameId, userId: accountId, status: 'ACTIVE' } })) as GameRow | null;
    if (!g) throw new BadRequestException('Cette partie est terminée');
    if (g.step < 1) throw new BadRequestException('Réponds au moins une fois avant d\'encaisser');
    const capped = g.daily ? Math.min(cfg.maxWin || Infinity, cfg.dailyFree.maxWin || Infinity) : cfg.maxWin;
    const payout = payoutOf(g.valued, g.multBp, Number.isFinite(capped) ? capped : 0);
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hiLoGame.updateMany({ where: { id: g.id, status: 'ACTIVE' }, data: { status: 'CASHED', active: null, payout, endedAt: new Date() } });
      if (claimed.count === 0) return false;
      if (payout > 0) await tx.user.update({ where: { id: accountId }, data: { bonusPoints: { increment: payout } } });
      return true;
    });
    if (!done) throw new BadRequestException('Cette partie vient d\'être encaissée');
    const after = (await this.prisma.hiLoGame.findUniqueOrThrow({ where: { id: g.id } })) as GameRow;
    const bal = await this.prisma.user.findUniqueOrThrow({ where: { id: accountId }, select: { bonusPoints: true, donatedPoints: true } });
    return { game: this.view(after, cfg, { result: how, ...extra }), points: Math.floor(bal.bonusPoints), stakeable: stakeable(bal.bonusPoints, bal.donatedPoints) };
  }

  /** Parties abandonnées : remboursées si aucune réponse n'a été donnée, encaissées sinon. */
  @Interval(300_000)
  async sweep() {
    try {
      const cfg = await this.config();
      const idle = (await this.prisma.hiLoGame.findMany({ where: { status: 'ACTIVE', updatedAt: { lt: new Date(Date.now() - cfg.idleMinutes * 60_000) } }, take: 100 })) as GameRow[];
      for (const g of idle) {
        try {
          if (g.step >= 1) { await this.settle(g.id, g.userId, cfg, 'idle'); continue; }
          await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.hiLoGame.updateMany({ where: { id: g.id, status: 'ACTIVE' }, data: { status: 'REFUNDED', active: null, payout: g.stake, endedAt: new Date() } });
            if (claimed.count && g.stake > 0) await tx.user.update({ where: { id: g.userId }, data: { bonusPoints: { increment: g.stake } } });
          });
        } catch (e) { this.logger.warn(`Partie ${g.id} non réglée : ${(e as Error).message}`); }
      }
    } catch (e) { this.logger.warn(`Parties abandonnées : ${(e as Error).message}`); }
  }

  /** Statistiques pour la case du jeu sur la page des jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const [today, best, mine, active, freeToday] = await Promise.all([
      this.prisma.hiLoGame.count({ where: { createdAt: { gt: new Date(Date.now() - DAY) } } }),
      this.prisma.hiLoGame.findFirst({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, step: { gt: 0 } }, orderBy: [{ step: 'desc' }, { payout: 'desc' }], select: { userId: true, step: true } }),
      this.prisma.hiLoGame.aggregate({ where: { userId: accountId, status: { in: ['CASHED', 'LOST', 'REFUNDED'] }, daily: false }, _sum: { stake: true, payout: true }, _count: { _all: true }, _max: { step: true } }),
      this.prisma.hiLoGame.findFirst({ where: { userId: accountId, status: 'ACTIVE' }, select: { step: true } }),
      this.prisma.hiLoGame.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
    ]);
    const who = best ? await this.prisma.user.findUnique({ where: { id: best.userId }, select: { username: true } }) : null;
    return {
      enabled: cfg.enabled, gamesToday: today, bestStreak: best ? { username: who?.username ?? 'Membre supprimé', step: best.step } : null,
      myGames: mine._count._all, myBest: mine._max.step ?? 0, myWon: mine._sum.payout ?? 0, activeStep: active ? active.step : null,
      dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
    };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const agg = async (from?: Date) => {
      const r = await this.prisma.hiLoGame.aggregate({ where: { status: { in: ['CASHED', 'LOST', 'REFUNDED'] }, ...(from ? { createdAt: { gt: from } } : {}) }, _sum: { stake: true, payout: true }, _count: { _all: true } });
      const wagered = r._sum.stake ?? 0, paid = r._sum.payout ?? 0;
      return { games: r._count._all, wagered, paid, houseProfit: wagered - paid, observedRtp: wagered > 0 ? Math.round((paid / wagered) * 1000) / 10 : null };
    };
    const [day, week, all] = await Promise.all([agg(new Date(Date.now() - DAY)), agg(new Date(Date.now() - 7 * DAY)), agg()]);
    return { config, totals: { day, week, all } };
  }
}
