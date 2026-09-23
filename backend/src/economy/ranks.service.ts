import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MemberClass } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CLASS_LABELS, MEMBER_CLASSES } from '../common/utils/economy';

/**
 * Rangs automatiques : chaque nuit, chaque membre reçoit la plus haute classe
 * dont il remplit les conditions (ancienneté, volume envoyé, ratio). Une classe
 * peut aussi être perdue si le ratio retombe.
 */
@Injectable()
export class RanksService implements OnModuleInit {
  private readonly logger = new Logger(RanksService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  onModuleInit() {
    // Première évaluation peu après le démarrage (sans notifier : ce sont les rangs de départ).
    setTimeout(() => this.recompute(false).catch((err) => this.logger.warn(`Calcul initial des rangs : ${err?.message ?? err}`)), 30_000);
  }

  @Cron('30 3 * * *')
  async nightly() {
    await this.recompute(true);
  }

  classFor(user: { createdAt: Date; uploaded: bigint; downloaded: bigint }): MemberClass {
    const weeks = (Date.now() - user.createdAt.getTime()) / (7 * 86400_000);
    const uploadedGb = Number(user.uploaded) / 1e9;
    const ratio = user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : Infinity;
    for (const c of MEMBER_CLASSES) {
      if (weeks >= c.weeks && uploadedGb >= c.uploadGb && ratio >= c.ratio) return c.id as MemberClass;
    }
    return 'NOUVEAU';
  }

  async recompute(notify: boolean) {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, createdAt: true, uploaded: true, downloaded: true, memberClass: true },
    });
    const order = MEMBER_CLASSES.map((c) => c.id as string).reverse().concat([]); // du plus bas au plus haut
    const rank = (c: string) => (c === 'NOUVEAU' ? -1 : order.indexOf(c));
    let changed = 0;
    for (const u of users) {
      const next = this.classFor(u);
      if (next === u.memberClass) continue;
      await this.prisma.user.update({ where: { id: u.id }, data: { memberClass: next } });
      changed++;
      if (notify) {
        const up = rank(next) > rank(u.memberClass);
        await this.notifications.notify({
          userId: u.id,
          type: 'SYSTEM',
          title: up ? `Nouveau rang : ${CLASS_LABELS[next]} 🎉` : `Rang modifié : ${CLASS_LABELS[next]}`,
          body: up ? 'Merci de ta contribution : de nouveaux privilèges sont disponibles.' : 'Ton ratio ou ton volume envoyé ne remplit plus les conditions du rang précédent.',
          link: '/bonus',
        });
      }
    }
    if (changed > 0) this.logger.log(`Rangs recalculés : ${changed} changement(s)`);
    return { changed };
  }
}
