import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { Action, BjConfig, DEFAULT_BJ, Draw, State, act, drawFromShoe, handValue, legalActions, newGame, normalizeBj, settle, standAll, valueOf } from '../common/utils/blackjack';
import { rankOf, suitOf } from '../common/utils/hilo';
import { stakeable } from '../common/utils/points';
import { startOfDayToronto } from './slots.service';
import { emitChallenge } from '../common/utils/challenge-bus';

const KEY = 'blackjack';
const DAY = 86400_000;
const MIN_INTERVAL_MS = 400;

export interface Actor { userId: string; username: string }

interface GameRow {
  id: string; userId: string; stake: number; valued: number; daily: boolean; status: string; state: unknown; version: number; payout: number | null; outcome: string | null;
  createdAt: Date; updatedAt: Date; endedAt: Date | null;
}

const cardView = (c: number) => ({ code: c, rank: rankOf(c), suit: suitOf(c) });

/**
 * Blackjack. Le serveur tire chaque carte dans un sabot (générateur sécurisé, tirage sans remise) et garde la carte cachée du croupier jusqu'à la fin de la partie ;
 * le navigateur n'affiche que ce qu'il reçoit. La mise est débitée au début (points qui ne viennent pas d'un don), puis la même somme pour chaque doublement ou
 * séparation, et le gain est versé en une seule étape à la fin. Une seule partie active par membre. Une partie abandonnée est jouée d'office (le joueur reste).
 */
@Injectable()
export class BlackjackService {
  private readonly logger = new Logger(BlackjackService.name);
  private busy = new Set<string>();
  private last = new Map<string, number>();

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService) {}

  async config(): Promise<BjConfig> { return normalizeBj(await this.settings.get(KEY), DEFAULT_BJ); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeBj(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'BLACKJACK_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: BjConfig): string | null {
    if (!cfg.enabled) return 'Le blackjack est fermé pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  /** Pertes nettes sur 24 h : mises débitées des parties payantes moins ce qu'elles ont rendu (une partie en cours compte comme mise perdue). */
  private async lossToday(userId: string): Promise<number> {
    const r = await this.prisma.blackjackGame.aggregate({ where: { userId, daily: false, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { stake: true, payout: true } });
    return Math.max(0, (r._sum.stake ?? 0) - (r._sum.payout ?? 0));
  }

  private drawer(cfg: BjConfig): Draw { return (dealt) => drawFromShoe(dealt, cfg.decks, (n) => randomInt(n)); }

  private capOf(g: { daily: boolean }, cfg: BjConfig): number {
    const cap = g.daily ? Math.min(cfg.maxWin || Infinity, cfg.dailyFree.maxWin || Infinity) : cfg.maxWin;
    return Number.isFinite(cap) && cap > 0 ? cap : 0;
  }

  /** Peut-il encore doubler ou séparer ? Il faut une mise de plus en points misables et de la marge sous la limite de pertes du jour. */
  private async canAfford(g: GameRow, cfg: BjConfig): Promise<boolean> {
    if (g.daily) return true;
    const account = await this.prisma.user.findUnique({ where: { id: g.userId }, select: { bonusPoints: true, donatedPoints: true } });
    if (!account || stakeable(account.bonusPoints, account.donatedPoints) < g.valued) return false;
    if (cfg.dailyLossMax > 0 && (await this.lossToday(g.userId)) + g.valued > cfg.dailyLossMax) return false;
    return true;
  }

  /** Ce que le navigateur reçoit : jamais la carte cachée du croupier ni le reste du sabot avant la fin de la partie. */
  private view(g: GameRow, cfg: BjConfig, affordable: boolean, extra: Record<string, unknown> = {}) {
    const s = g.state as State;
    const done = s.phase === 'DONE';
    const res = done ? settle(s, g.valued, cfg, this.capOf(g, cfg)) : null;
    const dealerCards = done ? s.dealer : s.dealer.slice(0, 1);
    return {
      id: g.id, status: g.status, daily: g.daily, stake: g.valued, paid: g.stake, version: g.version,
      dealer: { cards: dealerCards.map(cardView), total: done ? handValue(s.dealer).total : valueOf(s.dealer[0]), holeHidden: !done, blackjack: done && s.dealerBJ },
      hands: s.hands.map((h, i) => {
        const v = handValue(h.cards);
        return { cards: h.cards.map(cardView), total: v.total, soft: v.soft && v.total <= 21, bet: h.bet, status: h.status, current: !done && i === s.cur, split: h.split, outcome: res?.hands[i]?.outcome ?? null, payout: res?.hands[i]?.payout ?? null };
      }),
      actions: done ? [] : legalActions(s, cfg).filter((a) => (a === 'double' || a === 'split' ? affordable : true)),
      payout: g.payout, outcome: g.outcome, ...extra,
    };
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, bonusPoints: true, donatedPoints: true } });
    if (!account) throw new BadRequestException('Compte introuvable');
    const [active, loss, freeToday, recent, big] = await Promise.all([
      this.prisma.blackjackGame.findFirst({ where: { userId: accountId, status: 'ACTIVE' } }),
      this.lossToday(accountId),
      this.prisma.blackjackGame.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
      this.prisma.blackjackGame.findMany({ where: { userId: accountId, status: 'DONE' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, stake: true, valued: true, daily: true, payout: true, outcome: true, createdAt: true } }),
      this.prisma.blackjackGame.findMany({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, payout: { gt: 0 }, status: 'DONE' }, orderBy: { payout: 'desc' }, take: 5, select: { userId: true, payout: true, valued: true, outcome: true } }),
    ]);
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(big.map((b) => b.userId))] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    return {
      config: {
        enabled: cfg.enabled, minStake: cfg.minStake, maxStake: cfg.maxStake, maxWin: cfg.maxWin, dailyLossMax: cfg.dailyLossMax, dailyFree: cfg.dailyFree, idleMinutes: cfg.idleMinutes,
        blackjackPays: cfg.blackjackPays, dealerHitsSoft17: cfg.dealerHitsSoft17, doubleAfterSplit: cfg.doubleAfterSplit,
      },
      me: {
        points: Math.floor(account.bonusPoints), donated: Math.floor(Math.min(account.donatedPoints, account.bonusPoints)), stakeable: stakeable(account.bonusPoints, account.donatedPoints),
        blocked: this.blocked(account, cfg), lossLeft: cfg.dailyLossMax > 0 ? Math.max(0, cfg.dailyLossMax - loss) : null, dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      },
      active: active ? this.view(active as GameRow, cfg, await this.canAfford(active as GameRow, cfg)) : null,
      recent,
      biggest: big.map((b) => ({ username: names.get(b.userId) ?? 'Membre supprimé', payout: b.payout ?? 0, stake: b.valued, outcome: b.outcome })),
    };
  }

  private async lock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(accountId)) throw new BadRequestException('Une action est déjà en cours');
    if (Date.now() - (this.last.get(accountId) ?? 0) < MIN_INTERVAL_MS) throw new BadRequestException('Doucement : une action à la fois');
    this.busy.add(accountId);
    try { return await fn(); } finally { this.busy.delete(accountId); this.last.set(accountId, Date.now()); if (this.last.size > 5000) this.last.clear(); }
  }

  /** Commence une partie : la mise est débitée (sauf partie gratuite quotidienne) et les cartes sont distribuées. Un blackjack est réglé tout de suite. */
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
      if ((await this.prisma.blackjackGame.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } })) > 0) throw new BadRequestException('Tu as déjà joué ta partie gratuite d\'aujourd\'hui : reviens demain');
      stake = cfg.dailyFree.stake;
    } else {
      if (!Number.isFinite(stake) || stake < cfg.minStake || stake > cfg.maxStake || stake % 5 !== 0) throw new BadRequestException(`Mise invalide : de ${cfg.minStake} à ${cfg.maxStake} points, par pas de 5`);
      if (cfg.dailyLossMax > 0) {
        const loss = await this.lossToday(accountId);
        if (loss + stake > cfg.dailyLossMax) throw new BadRequestException(loss >= cfg.dailyLossMax ? 'Limite de pertes atteinte : reviens demain' : `Limite de pertes : tu ne peux plus perdre que ${cfg.dailyLossMax - loss} points aujourd'hui, baisse ta mise`);
      }
    }
    return this.lock(accountId, async () => {
      try {
        const game = await this.prisma.$transaction(async (tx) => {
          if (!daily) {
            const debited = await tx.$executeRaw`UPDATE "User" SET "bonusPoints" = "bonusPoints" - ${stake} WHERE "id" = ${accountId} AND "bonusPoints" - LEAST("donatedPoints", "bonusPoints") >= ${stake}`;
            if (debited === 0) throw new BadRequestException('Points misables insuffisants (les points reçus par un don ne peuvent pas être misés)');
          }
          const state = newGame(this.drawer(cfg));
          const base = { userId: accountId, stake: daily ? 0 : stake, valued: stake, daily, state: state as any };
          if (state.phase !== 'DONE') return tx.blackjackGame.create({ data: { ...base, active: 'A' } });
          const r = settle(state, stake, cfg, this.capOf({ daily }, cfg));
          if (r.payout > 0) await tx.user.update({ where: { id: accountId }, data: { bonusPoints: { increment: r.payout } } });
          return tx.blackjackGame.create({ data: { ...base, status: 'DONE', active: null, payout: r.payout, outcome: r.outcome, endedAt: new Date() } });
        });
        if (daily) emitChallenge({ userId: accountId, event: 'free_play', game: 'blackjack' });
        return await this.reply(game as GameRow, cfg, accountId);
      } catch (e: any) {
        if (e?.code === 'P2002') throw new BadRequestException('Tu as déjà une partie en cours : termine-la d\'abord');
        throw e;
      }
    });
  }

  private async reply(g: GameRow, cfg: BjConfig, accountId: string) {
    const bal = await this.prisma.user.findUniqueOrThrow({ where: { id: accountId }, select: { bonusPoints: true, donatedPoints: true } });
    return { game: this.view(g, cfg, g.status === 'ACTIVE' ? await this.canAfford(g, cfg) : false), points: Math.floor(bal.bonusPoints), stakeable: stakeable(bal.bonusPoints, bal.donatedPoints) };
  }

  /** Un coup du joueur : carte, rester, doubler ou séparer. Le doublement et la séparation débitent une mise de plus, dans la même étape que le coup. */
  async action(accountId: string, gameId: string, action: string) {
    if (!['hit', 'stand', 'double', 'split'].includes(action)) throw new BadRequestException('Coup invalide');
    const cfg = await this.config();
    return this.lock(accountId, async () => {
      const g = (await this.prisma.blackjackGame.findFirst({ where: { id: gameId, userId: accountId, status: 'ACTIVE' } })) as GameRow | null;
      if (!g) throw new BadRequestException('Cette partie est terminée');
      const state = g.state as State;
      if (!legalActions(state, cfg).includes(action as Action)) throw new BadRequestException('Ce coup n\'est pas permis maintenant');
      const extra = (action === 'double' || action === 'split') && !g.daily ? g.valued : 0;
      if (extra > 0 && cfg.dailyLossMax > 0 && (await this.lossToday(accountId)) + extra > cfg.dailyLossMax) throw new BadRequestException('Limite de pertes du jour : tu ne peux plus doubler ni séparer');
      const next = act(state, action as Action, this.drawer(cfg), cfg);
      const updated = await this.commit(g, next, extra, cfg);
      return this.reply(updated, cfg, accountId);
    });
  }

  /** Enregistre le nouvel état ; à la fin de la partie, verse le gain. Tout se passe en une transaction gardée par la version : un coup simultané ne passe pas. */
  private async commit(g: GameRow, next: State, extra: number, cfg: BjConfig): Promise<GameRow> {
    const done = next.phase === 'DONE';
    const r = done ? settle(next, g.valued, cfg, this.capOf(g, cfg)) : null;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.blackjackGame.updateMany({
        where: { id: g.id, version: g.version, status: 'ACTIVE' },
        data: { state: next as any, version: { increment: 1 }, ...(extra > 0 ? { stake: { increment: extra } } : {}), ...(r ? { status: 'DONE', active: null, payout: r.payout, outcome: r.outcome, endedAt: new Date() } : {}) },
      });
      if (res.count === 0) throw new BadRequestException('Cette partie vient d\'être modifiée : recharge la page');
      if (extra > 0) {
        const debited = await tx.$executeRaw`UPDATE "User" SET "bonusPoints" = "bonusPoints" - ${extra} WHERE "id" = ${g.userId} AND "bonusPoints" - LEAST("donatedPoints", "bonusPoints") >= ${extra}`;
        if (debited === 0) throw new BadRequestException('Points misables insuffisants pour doubler ou séparer');
      }
      if (r && r.payout > 0) await tx.user.update({ where: { id: g.userId }, data: { bonusPoints: { increment: r.payout } } });
    });
    return (await this.prisma.blackjackGame.findUniqueOrThrow({ where: { id: g.id } })) as GameRow;
  }

  /** Parties abandonnées : jouées d'office (le joueur reste sur ses mains, le croupier joue) et réglées. */
  @Interval(300_000)
  async sweep() {
    jobMonitor.run('blackjack.sweep', 300_000);
    try {
      const cfg = await this.config();
      const idle = (await this.prisma.blackjackGame.findMany({ where: { status: 'ACTIVE', updatedAt: { lt: new Date(Date.now() - cfg.idleMinutes * 60_000) } }, take: 100 })) as GameRow[];
      for (const g of idle) {
        try { await this.commit(g, standAll(g.state as State, this.drawer(cfg), cfg), 0, cfg); }
        catch (e) { this.logger.warn(`Partie ${g.id} non réglée : ${(e as Error).message}`); }
      }
    } catch (e) { jobMonitor.fail('blackjack.sweep', e); this.logger.warn(`Parties de blackjack abandonnées : ${(e as Error).message}`); }
  }

  /** Statistiques pour la case du jeu sur la page des jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const [today, mine, active, freeToday, best] = await Promise.all([
      this.prisma.blackjackGame.count({ where: { createdAt: { gt: new Date(Date.now() - DAY) } } }),
      this.prisma.blackjackGame.aggregate({ where: { userId: accountId, status: 'DONE', daily: false }, _sum: { payout: true }, _count: { _all: true } }),
      this.prisma.blackjackGame.findFirst({ where: { userId: accountId, status: 'ACTIVE' }, select: { id: true } }),
      this.prisma.blackjackGame.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
      this.prisma.blackjackGame.findFirst({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, status: 'DONE', payout: { gt: 0 } }, orderBy: { payout: 'desc' }, select: { userId: true, payout: true, valued: true } }),
    ]);
    const who = best ? await this.prisma.user.findUnique({ where: { id: best.userId }, select: { username: true } }) : null;
    return {
      enabled: cfg.enabled, gamesToday: today, myGames: mine._count._all, myWon: mine._sum.payout ?? 0, active: !!active, dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      biggest: best ? { username: who?.username ?? 'Membre supprimé', payout: best.payout ?? 0, stake: best.valued } : null,
    };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const agg = async (from?: Date) => {
      const r = await this.prisma.blackjackGame.aggregate({ where: { status: 'DONE', ...(from ? { createdAt: { gt: from } } : {}) }, _sum: { stake: true, payout: true }, _count: { _all: true } });
      const wagered = r._sum.stake ?? 0, paid = r._sum.payout ?? 0;
      return { games: r._count._all, wagered, paid, houseProfit: wagered - paid, observedRtp: wagered > 0 ? Math.round((paid / wagered) * 1000) / 10 : null };
    };
    const [day, week, all] = await Promise.all([agg(new Date(Date.now() - DAY)), agg(new Date(Date.now() - 7 * DAY)), agg()]);
    return { config, totals: { day, week, all } };
  }
}
