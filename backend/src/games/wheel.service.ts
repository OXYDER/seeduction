import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { PresenceService } from '../presence/presence.service';
import { NotificationsService } from '../notifications/notifications.service';
import { startOfDayToronto } from './slots.service';
import { CardsService } from './cards.service';
import { emitChallenge } from '../common/utils/challenge-bus';
import { DEFAULT_WHEEL, WheelConfig, dayBefore, expectedValue, nextStreak, normalizeWheel, pickSegment, rewardFor, streakMultiplier } from '../common/utils/wheel';
import { setSource } from '../common/utils/ledger';

const KEY = 'wheel';
const DAY = 86400_000;
const TZ = 'America/Toronto';
/** À partir de ce nombre de points, le gagnant reçoit aussi une notification ; au-dessus du second seuil, tous les membres connectés sont prévenus. */
const NOTIFY_FROM = 250;
const ANNOUNCE_FROM = 500;

/** Jour de Montréal au format AAAA-MM-JJ. */
export function torontoDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Prochain minuit à Montréal : 25 h après le début du jour tombe toujours dans le lendemain, même les jours de changement d'heure. */
export function nextMidnightToronto(now = new Date()): Date {
  return startOfDayToronto(new Date(startOfDayToronto(now).getTime() + 25 * 3600_000));
}

export interface Actor { userId: string; username: string }

/**
 * Roue de la fortune. Un tour gratuit par jour : le serveur tire le secteur (générateur sécurisé) et verse les points et les jetons dans la même transaction que
 * l'enregistrement du tour. L'unicité (membre, jour) de la table empêche deux tours le même jour, même avec deux requêtes simultanées.
 */
@Injectable()
export class WheelService {
  private readonly logger = new Logger(WheelService.name);
  /** Tirage dans [0, 1[ ; les tests le remplacent pour imposer un secteur. */
  private random: () => number = () => randomInt(1_000_000_000) / 1_000_000_000;

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private presence: PresenceService, private notifications: NotificationsService, private cards: CardsService) {}

  async config(): Promise<WheelConfig> { return normalizeWheel(await this.settings.get(KEY), DEFAULT_WHEEL); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeWheel(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'WHEEL_CONFIG', { enabled: next.enabled, minAccountDays: next.minAccountDays, streak: next.streak } as any, ip);
    return next;
  }

  private blocked(a: { status: string; createdAt: Date; gamesOptOut: boolean }, cfg: WheelConfig): string | null {
    if (!cfg.enabled) return 'La roue de la fortune est fermée pour le moment';
    if (a.status !== 'ACTIVE') return 'Ton compte ne peut pas jouer';
    if (a.gamesOptOut) return 'Tu t\'es retiré des jeux (tu peux revenir depuis la page Jeux)';
    const age = Math.floor((Date.now() - a.createdAt.getTime()) / DAY);
    if (age < cfg.minAccountDays) return `Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour jouer (encore ${cfg.minAccountDays - age})`;
    return null;
  }

  /** Série affichée : celle du dernier tour s'il date d'aujourd'hui ou d'hier, sinon 0 (elle est perdue). */
  private currentStreak(last: { day: string; streak: number } | null, today: string): number {
    if (!last) return 0;
    return last.day === today || last.day === dayBefore(today) ? last.streak : 0;
  }

  async overview(accountId: string) {
    const cfg = await this.config();
    const today = torontoDay();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true } });
    if (!account) throw new ForbiddenException('Compte introuvable');
    const [last, mine, recent, biggest] = await Promise.all([
      this.prisma.wheelSpin.findFirst({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, select: { day: true, streak: true } }),
      this.prisma.wheelSpin.aggregate({ where: { userId: accountId }, _sum: { points: true, streakBonus: true, tokens: true }, _count: { _all: true }, _max: { points: true } }),
      this.prisma.wheelSpin.findMany({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, take: 7, select: { day: true, segment: true, points: true, tokens: true, streak: true, streakBonus: true } }),
      this.prisma.wheelSpin.findMany({ where: { createdAt: { gt: new Date(Date.now() - 7 * DAY) }, points: { gte: NOTIFY_FROM } }, orderBy: { points: 'desc' }, take: 5, select: { userId: true, points: true, createdAt: true } }),
    ]);
    const names = biggest.length ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(biggest.map((b) => b.userId))] } }, select: { id: true, username: true } }) : [];
    const name = new Map(names.map((n) => [n.id, n.username]));
    const streak = this.currentStreak(last, today);
    const playedToday = last?.day === today;
    const upcoming = streak + 1; // série du prochain tour (demain si le tour du jour est joué)
    return {
      enabled: cfg.enabled,
      blocked: this.blocked(account, cfg),
      optOut: account.gamesOptOut,
      playedToday,
      day: today,
      nextAt: nextMidnightToronto().toISOString(),
      segments: cfg.segments.map((s) => ({ label: s.label, points: s.points, tokens: s.tokens, color: s.color })),
      streak: { current: streak, next: upcoming, multiplier: Math.round(streakMultiplier(upcoming, cfg) * 100) / 100, spinsToWeekly: 7 - ((upcoming - 1) % 7), weeklyBonus: cfg.streak.weeklyBonus },
      me: {
        spins: mine._count._all, points: (mine._sum.points ?? 0) + (mine._sum.streakBonus ?? 0), tokens: mine._sum.tokens ?? 0, best: mine._max.points ?? 0,
      },
      recent,
      biggest: biggest.map((b) => ({ username: name.get(b.userId) ?? 'Membre supprimé', points: b.points, at: b.createdAt })),
    };
  }

  /** Résumé pour la case de la page Jeux (rien de négatif : seulement ce que le membre a reçu). */
  async summary(accountId: string) {
    const cfg = await this.config();
    const today = torontoDay();
    const [last, mine] = await Promise.all([
      this.prisma.wheelSpin.findFirst({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, select: { day: true, streak: true } }),
      this.prisma.wheelSpin.aggregate({ where: { userId: accountId }, _sum: { points: true, streakBonus: true, tokens: true } }),
    ]);
    return {
      enabled: cfg.enabled, playedToday: last?.day === today, streak: this.currentStreak(last, today),
      won: (mine._sum.points ?? 0) + (mine._sum.streakBonus ?? 0), tokens: mine._sum.tokens ?? 0,
    };
  }

  async spin(accountId: string) {
    const cfg = await this.config();
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { status: true, createdAt: true, gamesOptOut: true, parentId: true, username: true } });
    if (!account || account.parentId) throw new ForbiddenException('Réservé au compte principal');
    const why = this.blocked(account, cfg);
    if (why) throw new BadRequestException(why);

    const today = torontoDay();
    const last = await this.prisma.wheelSpin.findFirst({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, select: { day: true, streak: true } });
    if (last?.day === today) throw new BadRequestException('Tu as déjà tourné la roue aujourd\'hui : reviens demain');

    const streak = nextStreak(last?.day ?? null, last?.streak ?? 0, today);
    const index = pickSegment(cfg.segments, this.random());
    const segment = cfg.segments[index];
    const reward = rewardFor(segment, streak, cfg);

    try {
      await this.prisma.$transaction([
        setSource(this.prisma, 'wheel'),
        this.prisma.wheelSpin.create({ data: { userId: accountId, day: today, segment: index, points: reward.points, tokens: reward.tokens, streak, streakBonus: reward.streakBonus } }),
        this.prisma.user.update({ where: { id: accountId }, data: { bonusPoints: { increment: reward.total }, ...(reward.tokens > 0 ? { freeleechTokens: { increment: reward.tokens } } : {}) } }),
      ]);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Tu as déjà tourné la roue aujourd\'hui : reviens demain');
      throw e;
    }

    // le bonus de sept jours de suite rapporte aussi un paquet de cartes
    if (reward.streakBonus > 0) void this.cards.grantPack(accountId, 'wheel', today);
    emitChallenge({ userId: accountId, event: 'wheel', game: 'wheel' });
    const bal = await this.prisma.user.findUnique({ where: { id: accountId }, select: { bonusPoints: true, freeleechTokens: true } });
    if (reward.total >= NOTIFY_FROM) void this.announce(accountId, account.username, reward.total);
    return {
      segment: index, label: segment.label, reward, streak,
      streakMultiplier: Math.round(streakMultiplier(streak, cfg) * 100) / 100,
      points: Math.floor(bal?.bonusPoints ?? 0), tokens: bal?.freeleechTokens ?? 0,
    };
  }

  /** Notifie le gagnant ; pour un très gros lot, prévient aussi les membres connectés. */
  private async announce(winnerId: string, username: string, amount: number) {
    try {
      await this.notifications.notify({ userId: winnerId, type: 'SYSTEM', category: 'games', title: `🎡 Roue de la fortune : +${amount.toLocaleString('fr-CA')} points !`, body: 'Bravo ! Reviens demain pour un autre tour gratuit.', link: '/jeux/roue' });
      if (amount < ANNOUNCE_FROM) return;
      const online = this.presence.listOnlineAll().map((e) => e.id);
      const rows = online.length ? await this.prisma.user.findMany({ where: { id: { in: online } }, select: { id: true, parentId: true } }) : [];
      const ids = new Set(rows.map((r) => r.parentId ?? r.id));
      ids.delete(winnerId);
      for (const id of ids) {
        await this.notifications.notify({ userId: id, type: 'SYSTEM', category: 'games', title: `🎡 ${username} vient de gagner ${amount.toLocaleString('fr-CA')} points à la roue de la fortune !`, body: 'Ton tour gratuit du jour t\'attend.', link: '/jeux/roue', groupKey: 'wheel-big' }).catch(() => undefined);
      }
    } catch (e) { this.logger.warn(`Annonce de la roue : ${(e as Error).message}`); }
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const config = await this.config();
    const since = (ms: number) => new Date(Date.now() - ms);
    const agg = async (from?: Date) => {
      const r = await this.prisma.wheelSpin.aggregate({ where: from ? { createdAt: { gt: from } } : {}, _sum: { points: true, streakBonus: true, tokens: true }, _count: { _all: true } });
      return { spins: r._count._all, points: (r._sum.points ?? 0) + (r._sum.streakBonus ?? 0), tokens: r._sum.tokens ?? 0 };
    };
    const [today, week, all, players] = await Promise.all([agg(since(DAY)), agg(since(7 * DAY)), agg(), this.prisma.wheelSpin.groupBy({ by: ['userId'], where: { createdAt: { gt: since(7 * DAY) } } })]);
    return {
      config,
      // valeur moyenne d'un tour (jeton compté pour 300 points), au premier jour et avec la série maximale
      expected: { first: Math.round(expectedValue(config, 1) * 10) / 10, maxStreak: Math.round(expectedValue(config, 1 + Math.ceil(config.streak.maxBonus / Math.max(config.streak.bonusPerDay, 0.0001))) * 10) / 10 },
      stats: { today, week, all, playersWeek: players.length },
    };
  }
}
