import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_SLOTS, FREE_MULT, MACHINES, MachineId, PAYLINES, PROFILES, PROFILE_IDS, SlotsConfig, STAKE_STEP, STRIPS, exactRtp, normalizeSlotsConfig, playRound, winTier } from '../common/utils/slots';
import { stakeable } from '../common/utils/points';

const KEY = 'slots';
const DAY = 86400_000;
const MIN_INTERVAL_MS = 900; // pas plus d'un tour toutes les ~secondes par membre
const TZ = 'America/Toronto';

export interface Actor { userId: string; username: string }

/** Début de la journée (minuit à Montréal) qui contient `now`, pour le tour gratuit quotidien. */
export function startOfDayToronto(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(now.getTime() - ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 - now.getMilliseconds());
}

/**
 * Machines à sous. Le serveur fait seul le tirage (générateur sécurisé) ; le navigateur ne fait qu'animer le résultat reçu. La mise est débitée et le gain
 * versé dans la même transaction. Les points de don ne se misent pas. Le site « participe » : les gains sont payés par le site, et comme le retour théorique
 * est d'environ 90 %, il garde environ 10 % de ce qui est misé à long terme (voir l'écran Admin > Jeux).
 */
@Injectable()
export class SlotsService {
  private readonly logger = new Logger(SlotsService.name);
  /** Un seul tour à la fois par membre, et un délai minimal entre deux tours. */
  private busy = new Set<string>();
  private last = new Map<string, number>();

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService) {}

  async config(): Promise<SlotsConfig> { return normalizeSlotsConfig(await this.settings.get(KEY), DEFAULT_SLOTS); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeSlotsConfig(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'SLOTS_CONFIG', next as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: SlotsConfig): string | null {
    if (!cfg.enabled) return 'Les machines à sous sont fermées pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  /** Pertes nettes du membre sur 24 h (mises moins gains des tours payants). */
  private async lossToday(userId: string): Promise<number> {
    const r = await this.prisma.slotSpin.aggregate({ where: { userId, daily: false, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { stake: true, win: true } });
    return Math.max(0, (r._sum.stake ?? 0) - (r._sum.win ?? 0));
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, bonusPoints: true, donatedPoints: true } });
    if (!account) throw new BadRequestException('Compte introuvable');
    const [loss, freeToday, recent, big] = await Promise.all([
      this.lossToday(accountId),
      this.prisma.slotSpin.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
      this.prisma.slotSpin.findMany({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, machine: true, stake: true, valued: true, daily: true, win: true, freeSpins: true, createdAt: true } }),
      this.prisma.slotSpin.findMany({ where: { win: { gt: 0 }, createdAt: { gt: new Date(Date.now() - 7 * DAY) } }, orderBy: { win: 'desc' }, take: 8, select: { userId: true, machine: true, valued: true, win: true, createdAt: true } }),
    ]);
    const names = await this.prisma.user.findMany({ where: { id: { in: [...new Set(big.map((b) => b.userId))] } }, select: { id: true, username: true } });
    const name = new Map(names.map((u) => [u.id, u.username]));
    const profile = PROFILES[cfg.profile];
    const stats = exactRtp(profile);
    return {
      config: { enabled: cfg.enabled, minStake: cfg.minStake, maxStake: cfg.maxStake, dailyLossMax: cfg.dailyLossMax, maxWin: cfg.maxWin, dailyFree: cfg.dailyFree, machines: cfg.machines },
      me: {
        points: Math.floor(account.bonusPoints), donated: Math.floor(Math.min(account.donatedPoints, account.bonusPoints)), stakeable: stakeable(account.bonusPoints, account.donatedPoints),
        blocked: this.blocked(account, cfg), optOut: account.gamesOptOut, lossToday: loss, lossLeft: cfg.dailyLossMax > 0 ? Math.max(0, cfg.dailyLossMax - loss) : null,
        dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      },
      game: { strips: STRIPS, paylines: PAYLINES, payThree: profile.pay3, payPair: profile.pair, freeMult: FREE_MULT, step: STAKE_STEP, rtp: Math.round(stats.rtp * 1000) / 10, hitRate: Math.round(stats.hitRate * 1000) / 10, atLeastStake: Math.round(stats.atLeastStake * 1000) / 10, maxMultiple: stats.maxMultiple },
      recent, biggest: big.map((b) => ({ username: name.get(b.userId) ?? 'Membre supprimé', machine: b.machine, stake: b.valued, win: b.win, at: b.createdAt })),
    };
  }

  /** Statistiques pour la case des machines à sous sur la page des jeux. */
  async summary(accountId: string) {
    const cfg = await this.config();
    const since = new Date(Date.now() - DAY);
    const [all24, mine, big, freeToday] = await Promise.all([
      this.prisma.slotSpin.aggregate({ where: { createdAt: { gt: since } }, _count: { _all: true } }),
      this.prisma.slotSpin.aggregate({ where: { userId: accountId, daily: false }, _sum: { stake: true, win: true }, _count: { _all: true } }),
      this.prisma.slotSpin.findFirst({ where: { win: { gt: 0 }, createdAt: { gt: new Date(Date.now() - 7 * DAY) } }, orderBy: { win: 'desc' }, select: { userId: true, win: true, valued: true, machine: true } }),
      this.prisma.slotSpin.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } }),
    ]);
    const who = big ? await this.prisma.user.findUnique({ where: { id: big.userId }, select: { username: true } }) : null;
    const stats = exactRtp(PROFILES[cfg.profile]);
    return {
      enabled: cfg.enabled, machines: MACHINES.filter((m) => cfg.machines[m]).length, spins24h: all24._count._all, rtp: Math.round(stats.rtp * 1000) / 10,
      mySpins: mine._count._all, myNet: (mine._sum.win ?? 0) - (mine._sum.stake ?? 0), dailyFreeAvailable: cfg.dailyFree.enabled && freeToday === 0,
      biggest: big ? { username: who?.username ?? 'Membre supprimé', win: big.win, stake: big.valued, machine: big.machine } : null,
    };
  }

  /** Un tour (ou le tour gratuit quotidien). Renvoie le déroulement complet pour que le navigateur l'anime. */
  async spin(accountId: string, input: { machine: string; stake?: number; daily?: boolean }) {
    const cfg = await this.config();
    const machine = input.machine as MachineId;
    if (!MACHINES.includes(machine) || !cfg.machines[machine]) throw new BadRequestException('Cette machine n\'est pas disponible');
    const daily = input.daily === true;
    if (this.busy.has(accountId)) throw new BadRequestException('Un tour est déjà en cours');
    const sinceLast = Date.now() - (this.last.get(accountId) ?? 0);
    if (sinceLast < MIN_INTERVAL_MS) throw new BadRequestException('Doucement : un tour à la fois');

    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);

    let stake = Math.floor(Number(input.stake));
    if (daily) {
      if (!cfg.dailyFree.enabled) throw new BadRequestException('Le tour gratuit quotidien n\'est pas offert');
      const used = await this.prisma.slotSpin.count({ where: { userId: accountId, daily: true, createdAt: { gte: startOfDayToronto() } } });
      if (used > 0) throw new BadRequestException('Tu as déjà joué ton tour gratuit d\'aujourd\'hui : reviens demain');
      stake = cfg.dailyFree.stake;
    } else {
      if (!Number.isFinite(stake) || stake < cfg.minStake || stake > cfg.maxStake || stake % STAKE_STEP !== 0) throw new BadRequestException(`Mise invalide : de ${cfg.minStake} à ${cfg.maxStake} points, par pas de ${STAKE_STEP}`);
      if (cfg.dailyLossMax > 0) {
        const loss = await this.lossToday(accountId);
        if (loss + stake > cfg.dailyLossMax) throw new BadRequestException(loss >= cfg.dailyLossMax ? 'Limite de pertes atteinte : reviens demain' : `Limite de pertes : tu ne peux plus perdre que ${cfg.dailyLossMax - loss} points aujourd'hui, baisse ta mise`);
      }
    }

    this.busy.add(accountId);
    try {
      const round = playRound(stake, undefined, daily ? Math.min(cfg.dailyFree.maxWin || Infinity, cfg.maxWin || Infinity) : cfg.maxWin, PROFILES[cfg.profile]);
      const win = round.win;
      const rounds = round.spins.map((s) => ({ stops: s.stops, mult: s.mult, win: s.win, free: s.free }));
      const bal = await this.prisma.$transaction(async (tx) => {
        if (!daily) {
          // Seuls les points qui ne viennent pas d'un don sont misables (vérifié par la base, en une seule étape atomique).
          const debited = await tx.$executeRaw`UPDATE "User" SET "bonusPoints" = "bonusPoints" - ${stake} WHERE "id" = ${accountId} AND "bonusPoints" - LEAST("donatedPoints", "bonusPoints") >= ${stake}`;
          if (debited === 0) throw new BadRequestException('Points misables insuffisants (les points reçus par un don ne peuvent pas être misés)');
        }
        if (win > 0) await tx.user.update({ where: { id: accountId }, data: { bonusPoints: { increment: win } } });
        await tx.slotSpin.create({ data: { userId: accountId, machine, stake: daily ? 0 : stake, valued: stake, daily, win, freeSpins: round.freeSpins, rounds: rounds as any } });
        return tx.user.findUniqueOrThrow({ where: { id: accountId }, select: { bonusPoints: true, donatedPoints: true } });
      });
      this.last.set(accountId, Date.now());
      if (this.last.size > 5000) this.last.clear();
      const tier = winTier(win, stake);
      if (tier === 'mega') this.logger.log(`Machine à sous : gros gain de ${win} points (mise ${stake}, ${machine})`);
      return {
        machine, stake, daily, win, tier, freeSpins: round.freeSpins,
        rounds: round.spins.map((s) => ({ stops: s.stops, grid: s.grid, lines: s.lines, mult: s.mult, win: s.win, free: s.free })),
        points: Math.floor(bal.bonusPoints), stakeable: stakeable(bal.bonusPoints, bal.donatedPoints),
      };
    } finally { this.busy.delete(accountId); }
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const since = (ms: number) => new Date(Date.now() - ms);
    const agg = async (from?: Date) => {
      const r = await this.prisma.slotSpin.aggregate({ where: from ? { createdAt: { gt: from } } : {}, _sum: { stake: true, win: true }, _count: { _all: true } });
      // les tours gratuits quotidiens ne coûtent rien au joueur : leurs gains comptent comme une dépense du site
      const wagered = r._sum.stake ?? 0, paid = r._sum.win ?? 0;
      return { spins: r._count._all, wagered, paid, houseProfit: wagered - paid, observedRtp: wagered > 0 ? Math.round((paid / wagered) * 1000) / 10 : null };
    };
    const [day, week, all] = await Promise.all([agg(since(DAY)), agg(since(7 * DAY)), agg()]);
    const byMachine = await this.prisma.slotSpin.groupBy({ by: ['machine'], _sum: { stake: true, win: true }, _count: { _all: true } });
    const stats = exactRtp(PROFILES[config.profile]);
    const profiles = PROFILE_IDS.map((id) => { const x = exactRtp(PROFILES[id]); return { id, label: PROFILES[id].label, rtp: Math.round(x.rtp * 1000) / 10, houseEdge: Math.round((1 - x.rtp) * 1000) / 10, atLeastStake: Math.round(x.atLeastStake * 1000) / 10, bonusRate: Math.round(x.bonusRate * 1000) / 10 }; });
    return {
      config, profiles, theoretical: { rtp: Math.round(stats.rtp * 1000) / 10, hitRate: Math.round(stats.hitRate * 1000) / 10, atLeastStake: Math.round(stats.atLeastStake * 1000) / 10, houseEdge: Math.round((1 - stats.rtp) * 1000) / 10, maxMultiple: stats.maxMultiple },
      totals: { day, week, all },
      machines: byMachine.map((m) => ({ machine: m.machine, spins: m._count._all, wagered: m._sum.stake ?? 0, paid: m._sum.win ?? 0 })),
    };
  }
}
