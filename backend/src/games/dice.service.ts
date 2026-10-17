import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { Bet, DEFAULT_DICE, DiceConfig, KINDS, Kind, allBets, multH, normalizeDice, payoutOf, roll, wins } from '../common/utils/dice';
import { stakeable } from '../common/utils/points';
import { startOfDayToronto } from './slots.service';
import { emitChallenge } from '../common/utils/challenge-bus';

const KEY = 'dice';
const DAY = 86400_000;
const MIN_INTERVAL_MS = 900; // pas plus d'un lancer toutes les ~secondes par membre

export interface Actor { userId: string; username: string }

/**
 * Dés. Le serveur lance les deux dés (générateur sécurisé) et règle le pari dans une seule transaction : la mise est débitée (points qui ne viennent pas d'un don),
 * puis le gain est versé. Le navigateur ne fait qu'animer le résultat reçu. Le site « participe » : les gains sont payés par le site, et comme chaque cote paie moins
 * que la cote équitable, il garde la marge choisie à long terme (voir Admin > Jeux).
 */
@Injectable()
export class DiceService {
  private busy = new Set<string>();
  private last = new Map<string, number>();
  /** Générateur du tirage (sécurisé) ; les tests le remplacent pour imposer les dés. */
  private rng: (max: number) => number = (n) => randomInt(n);

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService) {}

  async config(): Promise<DiceConfig> { return normalizeDice(await this.settings.get(KEY), DEFAULT_DICE); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeDice(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'DICE_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: DiceConfig): string | null {
    if (!cfg.enabled) return 'Les dés sont fermés pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  /** Pertes nettes sur 24 h (mises moins gains des lancers payants). */
  private async lossToday(userId: string): Promise<number> {
    const r = await this.prisma.diceRoll.aggregate({ where: { userId, daily: false, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { stake: true, payout: true } });
    return Math.max(0, (r._sum.stake ?? 0) - (r._sum.payout ?? 0));
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, bonusPoints: true, donatedPoints: true } });
    if (!account) throw new BadRequestException('Compte introuvable');
    const [loss, freeToday, recent, big] = await Promise.all([
      this.lossToday(accountId),
      this.prisma.diceRoll.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
      this.prisma.diceRoll.findMany({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, kind: true, n: true, d1: true, d2: true, valued: true, daily: true, mult: true, payout: true, createdAt: true } }),
      this.prisma.diceRoll.findMany({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, payout: { gt: 0 } }, orderBy: { payout: 'desc' }, take: 5, select: { userId: true, kind: true, n: true, valued: true, mult: true, payout: true } }),
    ]);
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(big.map((b) => b.userId))] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    return {
      config: { enabled: cfg.enabled, minStake: cfg.minStake, maxStake: cfg.maxStake, maxWin: cfg.maxWin, dailyLossMax: cfg.dailyLossMax, dailyFree: cfg.dailyFree },
      bets: allBets(cfg.edge),
      me: {
        points: Math.floor(account.bonusPoints), donated: Math.floor(Math.min(account.donatedPoints, account.bonusPoints)), stakeable: stakeable(account.bonusPoints, account.donatedPoints),
        blocked: this.blocked(account, cfg), lossLeft: cfg.dailyLossMax > 0 ? Math.max(0, cfg.dailyLossMax - loss) : null, dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      },
      recent,
      biggest: big.map((b) => ({ username: names.get(b.userId) ?? 'Membre supprimé', kind: b.kind, n: b.n, stake: b.valued, mult: b.mult / 100, payout: b.payout })),
    };
  }

  /** Lance les dés : le pari est vérifié, la mise débitée, les dés tirés et le gain versé en une seule transaction. */
  async roll(accountId: string, input: { kind?: string; n?: number; stake?: number; daily?: boolean }) {
    const cfg = await this.config();
    const bet: Bet = { kind: String(input.kind) as Kind, n: Math.floor(Number(input.n ?? 0)) };
    if (!KINDS.includes(bet.kind)) throw new BadRequestException('Pari invalide');
    const mult = multH(bet, cfg.edge);
    if (mult === null) throw new BadRequestException('Ce pari n\'est pas proposé');
    if (this.busy.has(accountId)) throw new BadRequestException('Un lancer est déjà en cours');
    if (Date.now() - (this.last.get(accountId) ?? 0) < MIN_INTERVAL_MS) throw new BadRequestException('Doucement : un lancer à la fois');

    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);

    const daily = input.daily === true;
    let stake = Math.floor(Number(input.stake));
    if (daily) {
      if (!cfg.dailyFree.enabled) throw new BadRequestException('Le lancer gratuit quotidien n\'est pas offert');
      if ((await this.prisma.diceRoll.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } })) > 0) throw new BadRequestException('Tu as déjà joué ton lancer gratuit d\'aujourd\'hui : reviens demain');
      stake = cfg.dailyFree.stake;
    } else {
      if (!Number.isFinite(stake) || stake < cfg.minStake || stake > cfg.maxStake || stake % 5 !== 0) throw new BadRequestException(`Mise invalide : de ${cfg.minStake} à ${cfg.maxStake} points, par pas de 5`);
      if (cfg.dailyLossMax > 0) {
        const loss = await this.lossToday(accountId);
        if (loss + stake > cfg.dailyLossMax) throw new BadRequestException(loss >= cfg.dailyLossMax ? 'Limite de pertes atteinte : reviens demain' : `Limite de pertes : tu ne peux plus perdre que ${cfg.dailyLossMax - loss} points aujourd'hui, baisse ta mise`);
      }
    }
    const cap = daily ? Math.min(cfg.maxWin || Infinity, cfg.dailyFree.maxWin || Infinity) : cfg.maxWin || Infinity;

    this.busy.add(accountId);
    try {
      const [d1, d2] = roll(this.rng);
      const won = wins(bet, d1, d2);
      const payout = won ? payoutOf(stake, mult, Number.isFinite(cap) ? cap : 0) : 0;
      const bal = await this.prisma.$transaction(async (tx) => {
        if (!daily) {
          // Seuls les points qui ne viennent pas d'un don sont misables (comparaison faite par la base, en une seule étape atomique).
          const debited = await tx.$executeRaw`UPDATE "User" SET "bonusPoints" = "bonusPoints" - ${stake} WHERE "id" = ${accountId} AND "bonusPoints" - LEAST("donatedPoints", "bonusPoints") >= ${stake}`;
          if (debited === 0) throw new BadRequestException('Points misables insuffisants (les points reçus par un don ne peuvent pas être misés)');
        }
        if (payout > 0) await tx.user.update({ where: { id: accountId }, data: { bonusPoints: { increment: payout } } });
        await tx.diceRoll.create({ data: { userId: accountId, stake: daily ? 0 : stake, valued: stake, daily, kind: bet.kind, n: bet.n, d1, d2, mult, payout } });
        return tx.user.findUniqueOrThrow({ where: { id: accountId }, select: { bonusPoints: true, donatedPoints: true } });
      });
      if (daily) emitChallenge({ userId: accountId, event: 'free_play', game: 'dice' });
      const ratio = stake > 0 ? payout / stake : 0;
      return {
        d1, d2, total: d1 + d2, win: won, doubles: d1 === d2, stake, daily, mult: mult / 100, payout,
        tier: !won ? 'none' : ratio >= 15 ? 'mega' : ratio >= 4 ? 'big' : 'small',
        points: Math.floor(bal.bonusPoints), stakeable: stakeable(bal.bonusPoints, bal.donatedPoints),
      };
    } finally { this.busy.delete(accountId); this.last.set(accountId, Date.now()); if (this.last.size > 5000) this.last.clear(); }
  }

  /** Statistiques pour la case du jeu sur la page des jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const [today, mine, best, freeToday] = await Promise.all([
      this.prisma.diceRoll.count({ where: { createdAt: { gt: new Date(Date.now() - DAY) } } }),
      this.prisma.diceRoll.aggregate({ where: { userId: accountId, daily: false }, _sum: { payout: true }, _count: { _all: true } }),
      this.prisma.diceRoll.findFirst({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, payout: { gt: 0 } }, orderBy: { payout: 'desc' }, select: { userId: true, payout: true, valued: true } }),
      this.prisma.diceRoll.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
    ]);
    const who = best ? await this.prisma.user.findUnique({ where: { id: best.userId }, select: { username: true } }) : null;
    return {
      enabled: cfg.enabled, rollsToday: today, myRolls: mine._count._all, myWon: mine._sum.payout ?? 0, dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      biggest: best ? { username: who?.username ?? 'Membre supprimé', payout: best.payout, stake: best.valued } : null,
    };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const agg = async (from?: Date) => {
      const r = await this.prisma.diceRoll.aggregate({ where: from ? { createdAt: { gt: from } } : {}, _sum: { stake: true, payout: true }, _count: { _all: true } });
      const wagered = r._sum.stake ?? 0, paid = r._sum.payout ?? 0;
      return { rolls: r._count._all, wagered, paid, houseProfit: wagered - paid, observedRtp: wagered > 0 ? Math.round((paid / wagered) * 1000) / 10 : null };
    };
    const [day, week, all] = await Promise.all([agg(new Date(Date.now() - DAY)), agg(new Date(Date.now() - 7 * DAY)), agg()]);
    return { config, totals: { day, week, all } };
  }
}
