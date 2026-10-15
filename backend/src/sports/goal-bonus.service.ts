import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Game } from '../common/utils/nhl';

export interface GoalBonusConfig {
  enabled: boolean;
  /** Points offerts à chaque membre en ligne à chaque but du Canadien. */
  points: number;
  /** Total de points de buts qu'un membre peut recevoir sur 24 heures (0 = sans limite). */
  dailyMax: number;
  /** Ancienneté minimale du compte pour recevoir les points (jours), contre les comptes créés pour l'occasion. */
  minAccountDays: number;
}

export const DEFAULT_GOAL_BONUS: GoalBonusConfig = { enabled: true, points: 5, dailyMax: 100, minAccountDays: 3 };

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeGoalBonus(raw: any, previous: GoalBonusConfig = DEFAULT_GOAL_BONUS): GoalBonusConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    points: int(r.points, 0, 1000, previous.points),
    dailyMax: int(r.dailyMax, 0, 100_000, previous.dailyMax),
    minAccountDays: int(r.minAccountDays, 0, 3650, previous.minAccountDays),
  };
}

/** Plus de buts d'un coup que cela entre deux lectures : on n'en récompense que ce nombre (protège contre une donnée absurde de la LNH). */
const MAX_GOALS_PER_READ = 3;
const DAY = 86400_000;

/**
 * Quand le Canadien marque, tous les membres en ligne reçoivent une notification et quelques points bonus.
 * Un but est repéré quand le score du Canadien monte entre deux lectures du tableau de la LNH. Chaque membre ne reçoit les points qu'une fois par but
 * (contrainte unique en base), même si le serveur redémarre en plein match. Un seul compte par personne : les profils d'un compte famille comptent pour le compte.
 */
@Injectable()
export class GoalBonusService {
  private readonly logger = new Logger(GoalBonusService.name);
  /** Dernier nombre de buts du Canadien vu par match. */
  private seen = new Map<number, number>();
  private busy = false;

  constructor(private prisma: PrismaService, private presence: PresenceService, private notifications: NotificationsService) {}

  /** À appeler à chaque lecture du match en cours. Ne bloque jamais l'appelant et n'échoue jamais. */
  observe(game: Game | null, cfg: GoalBonusConfig, teamName: string) {
    if (!game || game.state !== 'LIVE') return;
    this.check(game, cfg, teamName).catch((e) => this.logger.warn(`But du Canadien : ${(e as Error).message}`));
  }

  private async check(game: Game, cfg: GoalBonusConfig, teamName: string) {
    const mine = game.side === 'home' ? game.home : game.away;
    const theirs = game.side === 'home' ? game.away : game.home;
    const score = mine.score ?? 0;
    const known = this.seen.get(game.id);
    if (known === undefined) {
      // Première lecture depuis le démarrage : on part du score actuel et on ne verse rien pour le passé (le versement unique par but protège déjà des doublons).
      this.seen.set(game.id, score);
      if (this.seen.size > 50) this.seen.delete(this.seen.keys().next().value as number);
      return;
    }
    if (score <= known) { if (score < known) this.seen.set(game.id, score); return; } // but refusé : on ne verse rien de plus
    if (this.busy) return;
    this.seen.set(game.id, score);
    const shootout = (game.period ?? '').toLowerCase().includes('tirs'); // le but des tirs de barrage n'est pas un vrai but
    if (shootout) return;
    this.busy = true;
    try {
      const first = Math.max(known + 1, score - MAX_GOALS_PER_READ + 1);
      for (let goal = first; goal <= score; goal++) await this.reward(game.id, goal, cfg, `${teamName} ${score} – ${theirs.score ?? 0} ${theirs.name}`);
    } finally { this.busy = false; }
  }

  /** Comptes à récompenser : les membres connectés (onglet ouvert), un compte par personne. */
  private async onlineAccounts(): Promise<string[]> {
    const ids = this.presence.listOnlineAll().map((e) => e.id);
    if (ids.length === 0) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } });
    return [...new Set(rows.map((r) => r.parentId ?? r.id))];
  }

  private async reward(gameId: number, goal: number, cfg: GoalBonusConfig, scoreLine: string) {
    const accounts = await this.onlineAccounts();
    if (accounts.length === 0) return;
    const now = Date.now();
    const members = await this.prisma.user.findMany({ where: { id: { in: accounts }, status: 'ACTIVE', parentId: null }, select: { id: true, createdAt: true } });
    const spent = cfg.dailyMax > 0
      ? new Map((await this.prisma.goalReward.groupBy({ by: ['userId'], where: { userId: { in: accounts }, createdAt: { gt: new Date(now - DAY) } }, _sum: { points: true } })).map((g) => [g.userId, g._sum.points ?? 0]))
      : new Map<string, number>();

    let paid = 0;
    for (const m of members) {
      let given = 0;
      const eligible = cfg.enabled && cfg.points > 0 && now - m.createdAt.getTime() >= cfg.minAccountDays * DAY && (cfg.dailyMax <= 0 || (spent.get(m.id) ?? 0) + cfg.points <= cfg.dailyMax);
      if (eligible) {
        try {
          await this.prisma.$transaction([
            this.prisma.goalReward.create({ data: { userId: m.id, gameId, goal, points: cfg.points } }),
            this.prisma.user.update({ where: { id: m.id }, data: { bonusPoints: { increment: cfg.points } } }),
          ]);
          given = cfg.points;
          paid += 1;
        } catch { /* déjà versé pour ce but (contrainte unique) */ }
      }
      await this.notifications.notify({
        userId: m.id, type: 'SYSTEM', category: 'games',
        title: given ? `🏒 BUT du Canadien ! +${given} points bonus` : '🏒 BUT du Canadien !',
        titleMany: '🏒 {n} buts du Canadien !',
        body: scoreLine, link: '/jeux', groupKey: `goal-${gameId}`,
      }).catch(() => undefined);
    }
    this.logger.log(`But n°${goal} du Canadien (match ${gameId}) : ${members.length} membre(s) prévenu(s), ${paid} récompensé(s)`);
  }
}
