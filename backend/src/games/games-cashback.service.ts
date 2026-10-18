import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CashbackConfig, DEFAULT_CASHBACK, cashbackFor, normalizeCashback } from '../common/utils/games-cashback';
import { startOfDayToronto } from './slots.service';
import { BlackjackService } from './blackjack.service';
import { setSource } from '../common/utils/ledger';

const KEY = 'gamesCashback';
const TZ = 'America/Toronto';

/** Remise de fidélité commune à tous les jeux contre la maison. Pour ajouter un jeu : y compter ses pertes nettes dans `netLossesBetween`. */
@Injectable()
export class GamesCashbackService {
  private readonly logger = new Logger(GamesCashbackService.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService, private blackjack: BlackjackService) {}

  async config(): Promise<CashbackConfig> { return normalizeCashback(await this.settings.get(KEY), DEFAULT_CASHBACK); }

  async saveConfig(actor: { userId: string }, body: any, ip?: string | null) {
    const next = normalizeCashback(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'GAMES_CASHBACK_CONFIG', next as any, ip);
    return next;
  }

  /** Pertes nettes de chaque membre entre deux instants, tous les jeux contre la maison confondus (mises payantes moins gains ; la partie gratuite quotidienne ne compte pas). */
  async netLossesBetween(from: Date, to: Date): Promise<Map<string, number>> {
    const net = new Map<string, number>();
    const add = (userId: string, n: number) => net.set(userId, (net.get(userId) ?? 0) + n);
    const slots = await this.prisma.slotSpin.groupBy({ by: ['userId'], where: { daily: false, createdAt: { gte: from, lt: to } }, _sum: { stake: true, win: true } });
    for (const r of slots) add(r.userId, (r._sum.stake ?? 0) - (r._sum.win ?? 0));
    const hilo = await this.prisma.hiLoGame.groupBy({ by: ['userId'], where: { daily: false, status: { in: ['CASHED', 'LOST', 'REFUNDED'] }, createdAt: { gte: from, lt: to } }, _sum: { stake: true, payout: true } });
    for (const r of hilo) add(r.userId, (r._sum.stake ?? 0) - (r._sum.payout ?? 0));
    // dés : marge de 5 % par défaut, comme Plus haut ou plus bas
    const dice = await this.prisma.diceRoll.groupBy({ by: ['userId'], where: { daily: false, createdAt: { gte: from, lt: to } }, _sum: { stake: true, payout: true } });
    for (const r of dice) add(r.userId, (r._sum.stake ?? 0) - (r._sum.payout ?? 0));
    // le blackjack ne compte que si l'administration l'a choisi (son retour est déjà proche de 100 %)
    if ((await this.blackjack.config()).cashback) {
      const bj = await this.prisma.blackjackGame.groupBy({ by: ['userId'], where: { daily: false, status: 'DONE', createdAt: { gte: from, lt: to } }, _sum: { stake: true, payout: true } });
      for (const r of bj) add(r.userId, (r._sum.stake ?? 0) - (r._sum.payout ?? 0));
    }
    return net;
  }

  @Cron('15 5 * * *', { timeZone: TZ })
  async payYesterday() {
    jobMonitor.run('games.cashback');
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      const todayStart = startOfDayToronto();
      const yStart = startOfDayToronto(new Date(todayStart.getTime() - 3 * 3600_000));
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(yStart);
      let paid = 0;
      for (const [userId, lost] of await this.netLossesBetween(yStart, todayStart)) {
        const amount = cashbackFor(lost, cfg);
        if (amount < 1) continue;
        try {
          await this.prisma.$transaction([
            setSource(this.prisma, 'cashback'),
            this.prisma.slotCashback.create({ data: { userId, day, lost, amount } }),
            this.prisma.user.update({ where: { id: userId }, data: { bonusPoints: { increment: amount } } }),
          ]);
          paid++;
          await this.notifications.notify({
            userId, type: 'SYSTEM', category: 'games', title: `💝 Remise de fidélité : +${amount} points`,
            body: 'Merci de jouer : une part de tes pertes d\'hier te revient.', link: '/jeux',
          }).catch(() => undefined);
        } catch { /* déjà versée pour ce jour */ }
      }
      if (paid > 0) this.logger.log(`Remise de fidélité des jeux : ${paid} membre(s) (${day})`);
    } catch (e) { jobMonitor.fail('games.cashback', e); this.logger.warn(`Remise de fidélité : ${(e as Error).message}`); }
  }
}
