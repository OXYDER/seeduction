import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { setSource } from '../common/utils/ledger';
import { CLASS_LABELS, INVITE_QUOTA } from '../common/utils/economy';
import { CLASS_ORDER, DEFAULT_REFERRAL, type ReferralConfig, classAtLeast, inviteeProgress, monthStart, normalizeReferral } from '../common/utils/referral';

const KEY = 'referral';
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Page « Parrainage » : mes invitations, mes invités et la prime versée quand un invité devient un vrai membre. */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private running = false;

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService) {}

  async config(): Promise<ReferralConfig> { return normalizeReferral(await this.settings.get(KEY)); }

  async saveConfig(actorId: string, body: unknown, ip?: string | null): Promise<ReferralConfig> {
    const next = normalizeReferral({ ...(await this.config()), ...(body as object) });
    await this.settings.set(KEY, next);
    await this.audit.log(actorId, 'REFERRAL_CONFIG', next as any, ip);
    return next;
  }

  private quotaOf(u: { role: string; memberClass: string; donorUntil: Date | null; donorInvites: number }): number | null {
    if (STAFF.includes(u.role)) return null; // pas de limite pour l'équipe
    return (INVITE_QUOTA[u.memberClass] ?? 0) + (u.donorUntil && u.donorUntil > new Date() ? u.donorInvites : 0);
  }

  async overview(userId: string) {
    await this.rewardQualified(userId).catch(() => undefined); // la prime est versée dès qu'on regarde la page, sans attendre la nuit
    const cfg = await this.config();
    const now = new Date();
    const [me, codes, invitees, rewardedThisMonth] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, memberClass: true, donorUntil: true, donorInvites: true } }),
      this.prisma.inviteCode.findMany({ where: { createdById: userId, generic: false }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, code: true, used: true, expiresAt: true, createdAt: true, uses: { select: { userId: true }, take: 1 } } }),
      this.prisma.user.findMany({
        where: { invitedById: userId, parentId: null }, orderBy: { createdAt: 'desc' }, take: 200,
        select: { id: true, username: true, createdAt: true, memberClass: true, status: true, uploaded: true, downloaded: true, lastSeenAt: true, referralRewardedAt: true, referralReward: true },
      }),
      this.prisma.user.count({ where: { invitedById: userId, referralReward: { gt: 0 }, referralRewardedAt: { gte: monthStart(now) } } }),
    ]);
    if (!me) throw new NotFoundException('Membre introuvable');
    const quota = this.quotaOf(me);
    const open = codes.filter((c) => !c.used && (!c.expiresAt || c.expiresAt > now)).length;
    const names = new Map(invitees.map((i) => [i.id, i.username]));
    return {
      config: { enabled: cfg.enabled, rewardPoints: cfg.rewardPoints, minDays: cfg.minDays, minClass: cfg.minClass, minClassLabel: CLASS_LABELS[cfg.minClass], maxPerMonth: cfg.maxPerMonth },
      quota: { open, max: quota, rankLabel: CLASS_LABELS[me.memberClass] ?? me.memberClass, canCreate: quota === null || open < quota },
      rewardedThisMonth,
      totals: { invitees: invitees.length, rewarded: invitees.filter((i) => i.referralReward > 0).length, points: invitees.reduce((s, i) => s + i.referralReward, 0) },
      codes: codes.map((c) => ({ id: c.id, code: c.code, status: c.used ? 'used' : c.expiresAt && c.expiresAt <= now ? 'expired' : 'open', expiresAt: c.expiresAt, createdAt: c.createdAt, usedBy: c.uses[0] ? names.get(c.uses[0].userId) ?? null : null })),
      invitees: invitees.map((i) => {
        const p = inviteeProgress({ createdAt: i.createdAt, memberClass: i.memberClass, status: i.status, rewarded: !!i.referralRewardedAt }, cfg, now);
        const down = Number(i.downloaded), up = Number(i.uploaded);
        return {
          id: i.id, username: i.username, joinedAt: i.createdAt, memberClass: i.memberClass, classLabel: CLASS_LABELS[i.memberClass] ?? i.memberClass, status: i.status,
          ratio: down > 0 ? Math.round((up / down) * 100) / 100 : null, uploadedGb: Math.round(up / 1e7) / 100, lastSeenAt: i.lastSeenAt, state: p.state, daysLeft: p.daysLeft, classOk: p.classOk, reward: i.referralReward,
        };
      }),
    };
  }

  async revoke(userId: string, id: string) {
    const code = await this.prisma.inviteCode.findUnique({ where: { id }, select: { createdById: true, used: true, useCount: true, generic: true } });
    if (!code || code.createdById !== userId || code.generic) throw new NotFoundException('Invitation introuvable');
    if (code.used || code.useCount > 0) throw new BadRequestException('Cette invitation a déjà servi');
    await this.prisma.inviteCode.delete({ where: { id } });
    return { ok: true };
  }

  /** Chaque nuit : verse les primes de parrainage dues. */
  @Cron('15 4 * * *')
  async nightly() { await this.rewardQualified(); }

  /**
   * Verse la prime aux invités qui répondent aux conditions (ancienneté + rang), une seule fois par invité. Jamais pour un code générique de l'administration, ni pour un invité
   * qui partage une adresse IP avec celui qui l'a invité (comptes multiples), et au plus `maxPerMonth` primes par parrain et par mois.
   */
  async rewardQualified(onlyInviterId?: string) {
    if (this.running && !onlyInviterId) return 0;
    if (!onlyInviterId) this.running = true;
    try {
      const cfg = await this.config();
      if (!cfg.enabled || cfg.rewardPoints <= 0) return 0;
      const now = new Date();
      const classes = CLASS_ORDER.filter((c) => classAtLeast(c, cfg.minClass));
      const candidates = await this.prisma.user.findMany({
        where: {
          invitedById: onlyInviterId ?? { not: null }, referralRewardedAt: null, status: 'ACTIVE', parentId: null,
          createdAt: { lte: new Date(now.getTime() - cfg.minDays * 86_400_000) }, memberClass: { in: classes as any },
        },
        take: 500, orderBy: { createdAt: 'asc' }, select: { id: true, username: true, invitedById: true },
      });
      let paid = 0;
      for (const c of candidates) {
        try { if (await this.rewardOne(c, cfg, now)) paid++; } catch (e: any) { this.logger.warn(`Prime de parrainage (${c.username}) : ${e?.message ?? e}`); }
      }
      if (paid) this.logger.log(`${paid} prime(s) de parrainage versée(s)`);
      return paid;
    } finally { if (!onlyInviterId) this.running = false; }
  }

  private async mark(inviteeId: string, reward: number) {
    return this.prisma.user.updateMany({ where: { id: inviteeId, referralRewardedAt: null }, data: { referralRewardedAt: new Date(), referralReward: reward } });
  }

  private async rewardOne(c: { id: string; username: string; invitedById: string | null }, cfg: ReferralConfig, now: Date): Promise<boolean> {
    const inviterId = c.invitedById;
    if (!inviterId || inviterId === c.id) { await this.mark(c.id, 0); return false; }
    const inviter = await this.prisma.user.findUnique({ where: { id: inviterId }, select: { id: true, username: true, status: true } });
    if (!inviter || inviter.status !== 'ACTIVE') return false; // on réessaiera si le parrain redevient actif
    // code générique de l'administration : pas de prime (le « parrain » n'est que le créateur du code)
    const generic = await this.prisma.inviteCode.findFirst({ where: { generic: true, uses: { some: { userId: c.id } } }, select: { id: true } });
    if (generic) { await this.mark(c.id, 0); return false; }
    // même adresse IP que son parrain : probable compte multiple, aucune prime
    const mine = await this.prisma.userIp.findMany({ where: { userId: inviterId }, select: { ip: true }, take: 200 });
    if (mine.length > 0) {
      const shared = await this.prisma.userIp.findFirst({ where: { userId: c.id, ip: { in: mine.map((m) => m.ip) } }, select: { ip: true } });
      if (shared) { await this.mark(c.id, 0); await this.audit.log(inviterId, 'REFERRAL_SKIPPED_SHARED_IP', { invitee: c.username }); return false; }
    }
    const thisMonth = await this.prisma.user.count({ where: { invitedById: inviterId, referralReward: { gt: 0 }, referralRewardedAt: { gte: monthStart(now) } } });
    if (thisMonth >= cfg.maxPerMonth) return false; // le plafond mensuel est atteint : la prime attend le mois suivant
    const paid = await this.prisma.$transaction(async (tx) => {
      await setSource(tx, 'referral');
      const claimed = await tx.user.updateMany({ where: { id: c.id, referralRewardedAt: null }, data: { referralRewardedAt: now, referralReward: cfg.rewardPoints } });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: inviterId }, data: { bonusPoints: { increment: cfg.rewardPoints } } });
      return true;
    });
    if (!paid) return false;
    await this.notifications.notify({
      userId: inviterId, type: 'SYSTEM', category: 'social', title: `🎁 Parrainage : ${c.username} est devenu membre`, body: `+${cfg.rewardPoints} points bonus pour avoir invité ${c.username}.`, link: '/referrals',
    }).catch(() => undefined);
    return true;
  }
}

export { DEFAULT_REFERRAL };
