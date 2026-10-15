import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { BadgesService } from '../badges/badges.service';
import { DEFAULT_DONATION_CONFIG, DonationConfig, extendFrom, sanitizeDonationConfig, tierFor } from './donations.config';

const KEY = 'donationConfig';
interface Actor { userId: string; username: string }

/**
 * Dons : les membres donnent sur une plateforme externe (aucun paiement ne passe par le site) ; l'administration inscrit le don, et le membre reçoit
 * aussitôt ses avantages : statut donateur (❤️), freeleech personnel, hit & run désactivé, points bonus et invitations en plus. Rien n'est jamais bloqué
 * pour ceux qui ne donnent pas.
 */
@Injectable()
export class DonationsService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService, private audit: AuditService, private badges: BadgesService) {}

  async config(): Promise<DonationConfig> {
    return sanitizeDonationConfig((await this.settings.get<any>(KEY)) ?? DEFAULT_DONATION_CONFIG);
  }

  async saveConfig(actor: Actor, raw: any, ip?: string | null) {
    const cfg = sanitizeDonationConfig(raw);
    await this.settings.set(KEY, cfg);
    await this.audit.log(actor.userId, 'DONATION_CONFIG', { goalMonthly: cfg.goalMonthly, tiers: cfg.tiers.length, links: cfg.links.length, enabled: cfg.enabled }, ip);
    return cfg;
  }

  private monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }

  /** Page « Soutenir » : textes, liens, objectif du mois (somme des dons reçus ce mois-ci), paliers, mur des donateurs et situation du membre. */
  async info(userId: string) {
    const cfg = await this.config();
    const [sum, wall, me] = await Promise.all([
      this.prisma.donation.aggregate({ where: { receivedAt: { gte: this.monthStart() } }, _sum: { amount: true } }),
      this.prisma.user.findMany({ where: { donorSince: { not: null }, donorWall: true, parentId: null }, select: { id: true, username: true, avatarUrl: true, donorUntil: true }, orderBy: { donorSince: 'asc' }, take: 200 }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { donorSince: true, donorUntil: true, donorTotal: true, donorInvites: true, hnrExemptUntil: true, freeleechUntil: true, donorWall: true } }),
    ]);
    const now = Date.now();
    const received = Math.round((sum._sum.amount ?? 0) * 100) / 100;
    return {
      enabled: cfg.enabled, currency: cfg.currency, headline: cfg.headline, text: cfg.text, howTo: cfg.howTo, links: cfg.links, tiers: cfg.tiers,
      goal: { monthly: cfg.goalMonthly, received, percent: cfg.goalMonthly > 0 ? Math.min(100, Math.round((received / cfg.goalMonthly) * 100)) : null },
      wall: wall.map((w) => ({ id: w.id, username: w.username, avatarUrl: w.avatarUrl, active: !!w.donorUntil && w.donorUntil.getTime() > now })),
      me: {
        donor: !!me?.donorSince, active: !!me?.donorUntil && me.donorUntil.getTime() > now, since: me?.donorSince ?? null, until: me?.donorUntil ?? null, total: me?.donorTotal ?? 0,
        invites: me?.donorUntil && me.donorUntil.getTime() > now ? me.donorInvites : 0,
        freeleechUntil: me?.freeleechUntil && me.freeleechUntil.getTime() > now ? me.freeleechUntil : null,
        hnrExemptUntil: me?.hnrExemptUntil && me.hnrExemptUntil.getTime() > now ? me.hnrExemptUntil : null,
        wall: !!me?.donorWall,
      },
    };
  }

  /** Les donateurs (actuels ou passés) : sert à afficher le ❤️ à côté de leur pseudo partout sur le site. */
  async donors() {
    const rows = await this.prisma.user.findMany({ where: { donorSince: { not: null } }, select: { id: true, donorUntil: true }, take: 5000 });
    const now = Date.now();
    return rows.map((r) => ({ id: r.id, active: !!r.donorUntil && r.donorUntil.getTime() > now }));
  }

  async setWall(userId: string, show: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { donorWall: !!show } });
    return { wall: !!show };
  }

  // ------------------------------------------------------------------ administration

  async adminOverview() {
    const [cfg, recent, month, year, all, donors] = await Promise.all([
      this.config(),
      this.prisma.donation.findMany({ orderBy: { receivedAt: 'desc' }, take: 60, include: { user: { select: { id: true, username: true, avatarUrl: true } } } }),
      this.prisma.donation.aggregate({ where: { receivedAt: { gte: this.monthStart() } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.donation.aggregate({ where: { receivedAt: { gte: new Date(new Date().getFullYear(), 0, 1) } }, _sum: { amount: true } }),
      this.prisma.donation.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.user.count({ where: { donorUntil: { gt: new Date() } } }),
    ]);
    return {
      config: cfg,
      recent,
      totals: { month: month._sum.amount ?? 0, monthCount: month._count._all, year: year._sum.amount ?? 0, all: all._sum.amount ?? 0, count: all._count._all, activeDonors: donors },
    };
  }

  /** Inscrit un don et verse les avantages du palier atteint (durées ajoutées à celles déjà en cours). */
  async record(actor: Actor, input: { userId?: string; username?: string; amount: number; note?: string; receivedAt?: string }, ip?: string | null) {
    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) throw new BadRequestException('Montant invalide');
    const member = input.userId
      ? await this.prisma.user.findUnique({ where: { id: input.userId } })
      : await this.prisma.user.findFirst({ where: { username: { equals: String(input.username ?? '').trim(), mode: 'insensitive' }, parentId: null } });
    if (!member) throw new NotFoundException('Membre introuvable : vérifie le pseudo');
    const cfg = await this.config();
    const tier = tierFor(cfg.tiers, amount);
    const now = new Date();
    const receivedAt = input.receivedAt && !Number.isNaN(Date.parse(input.receivedAt)) ? new Date(input.receivedAt) : now;

    const donorUntil = tier ? extendFrom(member.donorUntil, now, tier.days) : member.donorUntil;
    const freeleechUntil = tier ? extendFrom(member.freeleechUntil, now, tier.freeleechDays) : member.freeleechUntil;
    const hnrExemptUntil = tier ? extendFrom(member.hnrExemptUntil, now, tier.hnrDays) : member.hnrExemptUntil;
    const donation = await this.prisma.$transaction(async (tx) => {
      const d = await tx.donation.create({
        data: {
          userId: member.id, amount, currency: cfg.currency, note: (input.note ?? '').trim().slice(0, 300) || null, tierLabel: tier?.label ?? null,
          daysGranted: tier?.days ?? 0, freeleechDays: tier?.freeleechDays ?? 0, hnrDays: tier?.hnrDays ?? 0, pointsGranted: tier?.bonusPoints ?? 0,
          recordedById: actor.userId, recordedByName: actor.username, receivedAt,
        },
      });
      await tx.user.update({
        where: { id: member.id },
        data: {
          donorSince: member.donorSince ?? now, donorTotal: { increment: amount }, donorUntil, freeleechUntil, hnrExemptUntil,
          donorInvites: tier ? Math.max(member.donorInvites, tier.invites) : member.donorInvites,
          ...(tier && tier.bonusPoints > 0 ? { bonusPoints: { increment: tier.bonusPoints }, donatedPoints: { increment: tier.bonusPoints } } : {}),
        },
      });
      return d;
    });

    const perks = tier
      ? [`statut donateur ❤️ jusqu'au ${donorUntil?.toLocaleDateString('fr-CA')}`, tier.freeleechDays ? `freeleech pendant ${tier.freeleechDays} jours` : '', tier.hnrDays ? `hit & run désactivé ${tier.hnrDays} jours` : '',
          tier.bonusPoints ? `+${tier.bonusPoints} points bonus` : '', tier.invites ? `${tier.invites} invitation${tier.invites > 1 ? 's' : ''} de plus` : ''].filter(Boolean)
      : ['statut donateur ❤️'];
    await this.notifications.notify({
      userId: member.id, type: 'SYSTEM', category: 'system', title: `Merci pour ton don de ${amount} ${cfg.currency} ❤️`, body: `Tes avantages : ${perks.join(', ')}.`, link: '/soutenir',
    }).catch(() => undefined);
    await this.audit.log(actor.userId, 'DONATION_RECORD', { userId: member.id, username: member.username, amount, tier: tier?.label ?? null, note: donation.note }, ip);
    await this.badges.checkAndAward(member.id).catch(() => undefined);
    return donation;
  }
}
