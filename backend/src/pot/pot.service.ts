import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_POT, MAX_REWARD_HOURS, PotConfig, PotTier, nextAtHour, normalizePotConfig } from './pot.config';

const DAY = 86400_000;
const fmtDate = (d: Date) => d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Toronto' });

/**
 * Pot commun (« Le Pot du Plaisir ») : les membres y versent des points bonus. Quand le pot est plein, un freeleech global démarre
 * (avec, selon les réglages, un double upload, des points rendus aux donateurs, un bonus aux meilleurs donateurs...), puis un nouveau pot s'ouvre.
 * Un remplissage est un « cycle » : OPEN -> FULL (plein) -> DONE (récompense lancée).
 */
@Injectable()
export class PotService {
  private readonly logger = new Logger(PotService.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService) {}

  // ------------------------------------------------------------------ réglages

  async config(): Promise<PotConfig> {
    return normalizePotConfig(await this.settings.get('potConfig'), DEFAULT_POT);
  }

  /** Enregistre les réglages. Si l'objectif change, le pot en cours prend le nouvel objectif (et se déclenche s'il est déjà atteint). */
  async setConfig(raw: any) {
    const before = await this.config();
    const next = normalizePotConfig(raw, before);
    await this.settings.set('potConfig', next);
    if (next.enabled) {
      const cycle = await this.currentCycle(next);
      if (cycle.status === 'OPEN' && raw?.goal !== undefined && next.goal !== before.goal) {
        await this.prisma.potCycle.update({ where: { id: cycle.id }, data: { goal: next.goal } });
        await this.checkFull(cycle.id);
      }
    }
    return next;
  }

  /** Cycle en cours (le dernier ouvert ou plein) ; en crée un s'il n'y en a pas. */
  private async currentCycle(cfg: PotConfig) {
    const found = await this.prisma.potCycle.findFirst({ where: { status: { in: ['OPEN', 'FULL'] } }, orderBy: { number: 'desc' } });
    if (found) return found;
    const last = await this.prisma.potCycle.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    return this.prisma.potCycle.create({ data: { number: (last?.number ?? 0) + 1, goal: cfg.goal } });
  }

  // ------------------------------------------------------------------ lecture

  /** Tout ce que la page du pot affiche : jauge, mes dons, meilleurs donateurs, derniers dons, historique des récompenses. */
  async state(userId?: string) {
    const cfg = await this.config();
    if (!cfg.enabled) return { enabled: false as const };
    const cycle = await this.currentCycle(cfg);
    const now = Date.now();
    const [top, mine, lifetime, daily, recent, done, topAll] = await Promise.all([
      this.prisma.potDonation.groupBy({ by: ['userId'], where: { cycleId: cycle.id, topUp: false }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5 }),
      userId ? this.prisma.potDonation.aggregate({ where: { cycleId: cycle.id, userId, topUp: false }, _sum: { amount: true } }) : null,
      userId ? this.prisma.potDonation.aggregate({ where: { userId, topUp: false }, _sum: { amount: true } }) : null,
      userId && cfg.dailyLimit > 0 ? this.prisma.potDonation.aggregate({ where: { userId, topUp: false, createdAt: { gt: new Date(now - DAY) } }, _sum: { amount: true } }) : null,
      this.prisma.potDonation.findMany({ where: { cycleId: cycle.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.potCycle.findMany({ where: { status: 'DONE' }, orderBy: { number: 'desc' }, take: 5 }),
      this.prisma.potDonation.groupBy({ by: ['userId'], where: { topUp: false }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5 }),
    ]);
    const ids = [...new Set([...top.map((t) => t.userId), ...recent.map((r) => r.userId), ...topAll.map((t) => t.userId)])];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : [];
    const name = new Map(users.map((u) => [u.id, u.username]));
    const donorCounts = done.length ? await this.prisma.potDonation.groupBy({ by: ['cycleId', 'userId'], where: { cycleId: { in: done.map((d) => d.id) }, topUp: false } }) : [];
    const active = done.find((d) => d.rewardEndsAt && d.rewardEndsAt.getTime() > now && d.rewardStartsAt && d.rewardStartsAt.getTime() <= now) ?? null;
    const pending = done.find((d) => d.rewardStartsAt && d.rewardStartsAt.getTime() > now) ?? null;
    const dailyLeft = cfg.dailyLimit > 0 ? Math.max(0, cfg.dailyLimit - (daily?._sum.amount ?? 0)) : null;

    return {
      enabled: true as const,
      name: cfg.name, icon: cfg.icon,
      cycle: { number: cycle.number, goal: cycle.goal, collected: cycle.collected, percent: Math.min(100, Math.floor((cycle.collected / cycle.goal) * 100)), status: cycle.status, remaining: Math.max(0, cycle.goal - cycle.collected) },
      reward: {
        hours: cfg.rewardHours, freeleech: cfg.freeleechEnabled, doubleUpload: cfg.doubleUpload, doubleUploadHours: cfg.doubleUploadHours > 0 ? cfg.doubleUploadHours : cfg.rewardHours,
        fastFillHours: cfg.fastFillHours, fastFillBonusHours: cfg.fastFillBonusHours, tokens: cfg.rewardTokens, rainPoints: cfg.rainPoints,
        startDelayHours: cfg.startDelayHours, startAtHour: cfg.startAtHour, cooldownHours: cfg.cooldownHours, autoStart: cfg.autoStart, donorRefundPct: cfg.donorRefundPct, topDonorBonus: cfg.topDonorBonus,
      },
      rules: { minDonation: cfg.minDonation, maxDonation: cfg.maxDonation, dailyLimit: cfg.dailyLimit, dailyLeft, carryOver: cfg.carryOver, goalGrowthPct: cfg.goalGrowthPct, goalPerMember: cfg.goalPerMember, minAccountDays: cfg.minAccountDays },
      tiers: cfg.tiers.map((t) => ({ ...t, amount: Math.ceil((cycle.goal * t.atPct) / 100), reached: cycle.reached.includes(t.atPct) })),
      mine: userId ? { cycle: mine?._sum.amount ?? 0, lifetime: lifetime?._sum.amount ?? 0 } : null,
      top: top.map((t) => ({ username: name.get(t.userId) ?? '(membre supprimé)', amount: t._sum.amount ?? 0 })),
      topAllTime: topAll.map((t) => ({ username: name.get(t.userId) ?? '(membre supprimé)', amount: t._sum.amount ?? 0 })),
      recent: recent.map((r) => ({ username: r.topUp ? 'La maison' : name.get(r.userId) ?? '(membre supprimé)', amount: r.amount, houseTopUp: r.topUp, createdAt: r.createdAt })),
      active: active ? { startsAt: active.rewardStartsAt, endsAt: active.rewardEndsAt } : null,
      pending: pending ? { startsAt: pending.rewardStartsAt, endsAt: pending.rewardEndsAt } : null,
      history: done.map((d) => ({ number: d.number, goal: d.goal, startsAt: d.rewardStartsAt, endsAt: d.rewardEndsAt, hours: d.rewardHours, donors: donorCounts.filter((c) => c.cycleId === d.id).length })),
    };
  }

  // ------------------------------------------------------------------ dons

  /** Verse des points bonus dans le pot. Le débit, l'ajout au pot et le déclenchement sont protégés contre les clics simultanés. */
  async donate(userId: string, amountRaw: unknown) {
    const cfg = await this.config();
    if (!cfg.enabled) throw new BadRequestException(`${cfg.name} est fermé pour le moment`);
    let amount = Math.floor(Number(amountRaw));
    if (!Number.isFinite(amount) || amount < cfg.minDonation) throw new BadRequestException(`Don minimum : ${cfg.minDonation} points`);
    if (cfg.maxDonation > 0 && amount > cfg.maxDonation) throw new BadRequestException(`Don maximum : ${cfg.maxDonation} points à la fois`);
    if (cfg.minAccountDays > 0) {
      const who = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
      const age = who ? Math.floor((Date.now() - who.createdAt.getTime()) / DAY) : 0;
      if (age < cfg.minAccountDays) throw new BadRequestException(`Ton compte doit avoir au moins ${cfg.minAccountDays} jour${cfg.minAccountDays > 1 ? 's' : ''} pour donner (encore ${cfg.minAccountDays - age})`);
    }
    const cycle = await this.currentCycle(cfg);
    if (cycle.status !== 'OPEN') throw new BadRequestException(`${cfg.name} est plein : la récompense démarre bientôt, merci !`);
    if (cfg.dailyLimit > 0) {
      const sent = await this.prisma.potDonation.aggregate({ where: { userId, topUp: false, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { amount: true } });
      const left = cfg.dailyLimit - (sent._sum.amount ?? 0);
      if (amount > left) throw new BadRequestException(left > 0 ? `Limite journalière : tu ne peux plus donner que ${left} points aujourd'hui` : 'Limite journalière atteinte : reviens demain');
    }
    if (!cfg.carryOver) amount = Math.min(amount, cycle.goal - cycle.collected); // le dernier don est limité à ce qui manque
    if (amount < 1) throw new BadRequestException(`${cfg.name} est plein`);

    const before = cycle.collected;
    const updated = await this.prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({ where: { id: userId, bonusPoints: { gte: amount } }, data: { bonusPoints: { decrement: amount } } });
      if (debited.count === 0) throw new BadRequestException('Points bonus insuffisants');
      const added = await tx.potCycle.updateMany({ where: { id: cycle.id, status: 'OPEN' }, data: { collected: { increment: amount } } });
      if (added.count === 0) throw new BadRequestException(`${cfg.name} vient d'être rempli`); // annule aussi le débit
      await tx.potDonation.create({ data: { cycleId: cycle.id, userId, amount } });
      return tx.potCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    });
    await this.afterAdd(cfg, cycle.id, before, updated.collected, updated.goal);
    return { ok: true, given: amount, collected: updated.collected, goal: updated.goal, full: updated.collected >= updated.goal };
  }

  /** Mise de la maison : un administrateur ajoute des points au pot (aucun point débité). */
  async topUp(adminId: string, amountRaw: unknown) {
    const cfg = await this.config();
    if (!cfg.enabled) throw new BadRequestException('Active le pot avant de le remplir');
    const amount = Math.floor(Number(amountRaw));
    if (!Number.isFinite(amount) || amount < 1 || amount > 100_000_000) throw new BadRequestException('Montant invalide');
    const cycle = await this.currentCycle(cfg);
    if (cycle.status !== 'OPEN') throw new BadRequestException('Le pot est déjà plein');
    const updated = await this.prisma.$transaction(async (tx) => {
      const added = await tx.potCycle.updateMany({ where: { id: cycle.id, status: 'OPEN' }, data: { collected: { increment: amount } } });
      if (added.count === 0) throw new BadRequestException('Le pot vient d\'être rempli');
      await tx.potDonation.create({ data: { cycleId: cycle.id, userId: adminId, amount, topUp: true } });
      return tx.potCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    });
    await this.afterAdd(cfg, cycle.id, cycle.collected, updated.collected, updated.goal);
    return { ok: true, collected: updated.collected, goal: updated.goal };
  }

  /** Après un ajout : paliers de récompense, paliers de notification (50 % et 90 %), puis déclenchement si le pot est plein. */
  private async afterAdd(cfg: PotConfig, cycleId: string, before: number, after: number, goal: number) {
    await this.reachTiers(cfg, cycleId, before, after, goal);
    if (after >= goal) { await this.checkFull(cycleId); return; }
    if (!cfg.milestones) return;
    for (const pct of [50, 90]) {
      if (before * 100 < pct * goal && after * 100 >= pct * goal) {
        await this.notifications.notifyAll({ type: 'SYSTEM', title: `${cfg.icon} ${cfg.name} : ${pct} % !`, body: `Encore ${goal - after} points avant la récompense finale pour tout le monde. Donne ta part !`, link: '/pot' }).catch(() => undefined);
      }
    }
  }

  /** Débloque les paliers franchis par un ajout (chacun une seule fois par cycle, même avec des dons simultanés). */
  private async reachTiers(cfg: PotConfig, cycleId: string, before: number, after: number, goal: number) {
    for (const tier of cfg.tiers) {
      if (!(before * 100 < tier.atPct * goal && after * 100 >= tier.atPct * goal)) continue;
      const claimed = await this.prisma.$executeRaw`UPDATE "PotCycle" SET reached = array_append(reached, ${tier.atPct}::int) WHERE id = ${cycleId} AND NOT (${tier.atPct}::int = ANY(reached))`;
      if (claimed) await this.grantTier(cfg, tier, cycleId).catch((e) => this.logger.warn(`Palier ${tier.atPct} % : ${e?.message ?? e}`));
    }
  }

  /** Ajoute une fenêtre de double upload global (elles peuvent se suivre : un palier, puis la récompense finale). */
  private async addDoubleUpload(startsAt: Date, hours: number) {
    const raw = await this.settings.get<any>('potDoubleUpload');
    const now = Date.now();
    const kept = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((w: any) => new Date(w.endsAt).getTime() > now);
    kept.push({ startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + hours * 3600_000).toISOString() });
    await this.settings.set('potDoubleUpload', kept);
  }

  /** Récompense d'un palier : freeleech et / ou double upload (après un freeleech déjà en cours), jetons pour les donateurs, pluie de points. */
  private async grantTier(cfg: PotConfig, tier: PotTier, cycleId: string) {
    const fl = await this.settings.freeleechState();
    const startsAt = new Date(Math.max(Date.now(), fl.until?.getTime() ?? 0));
    const perks: string[] = [];
    if (tier.freeleechHours > 0) {
      const endsAt = new Date(startsAt.getTime() + tier.freeleechHours * 3600_000);
      await this.prisma.freeleechEvent.create({ data: { title: `${cfg.icon} ${cfg.name} — palier ${tier.atPct} %`, message: `Le palier ${tier.atPct} % du ${cfg.name} est atteint : merci aux donateurs ! Les téléchargements ne comptent pas dans ton ratio.`, startsAt, endsAt } });
      this.settings.invalidateFreeleech();
      perks.push(`freeleech global ${tier.freeleechHours} h`);
    }
    if (tier.doubleUploadHours > 0) { await this.addDoubleUpload(startsAt, tier.doubleUploadHours); perks.push(`double upload ${tier.doubleUploadHours} h`); }
    if (tier.tokens > 0) {
      const donors = await this.prisma.potDonation.groupBy({ by: ['userId'], where: { cycleId, topUp: false } });
      if (donors.length) await this.prisma.user.updateMany({ where: { id: { in: donors.map((d) => d.userId) } }, data: { freeleechTokens: { increment: tier.tokens } } });
      perks.push(`${tier.tokens} jeton${tier.tokens > 1 ? 's' : ''} freeleech pour les donateurs`);
    }
    if (tier.rainPoints > 0) { const n = await this.rain({ ...cfg, rainPoints: tier.rainPoints }); if (n > 0) perks.push(`${tier.rainPoints} points offerts à chaque membre actif`); }
    if (perks.length === 0) return;
    this.logger.log(`Palier ${tier.atPct} % du pot atteint : ${perks.join(', ')}`);
    if (cfg.announce) await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `${cfg.icon} ${cfg.name} : palier ${tier.atPct} % atteint !`, body: perks.join(' · '), link: '/pot' }).catch(() => undefined);
  }

  // ------------------------------------------------------------------ remplissage et récompense

  /** Passe le cycle à « plein » (une seule fois, même avec des dons simultanés), puis lance la récompense si le lancement est automatique. */
  private async checkFull(cycleId: string) {
    const flipped = await this.prisma.$executeRaw`UPDATE "PotCycle" SET status = 'FULL', "fullAt" = now() WHERE id = ${cycleId} AND status = 'OPEN' AND collected >= goal`;
    if (!flipped) return;
    const cfg = await this.config();
    this.logger.log(`${cfg.name} plein (cycle ${cycleId.slice(0, 8)})`);
    if (cfg.autoStart) { await this.start(cycleId); return; }
    await this.notifyAdmins(`${cfg.icon} ${cfg.name} est plein`, 'À toi de lancer la récompense : Admin > Pot commun.');
    if (cfg.announce) await this.notifications.notifyAll({ type: 'SYSTEM', title: `${cfg.icon} ${cfg.name} est plein !`, body: 'Merci à tous les donateurs : la récompense sera lancée très bientôt.', link: '/pot' }).catch(() => undefined);
  }

  /** Lance la récompense d'un pot plein (automatique, ou à la main par un administrateur). */
  async start(cycleId: string) {
    const claimed = await this.prisma.$executeRaw`UPDATE "PotCycle" SET status = 'DONE' WHERE id = ${cycleId} AND status = 'FULL'`;
    if (!claimed) throw new BadRequestException("Ce pot n'est pas en attente de lancement");
    const cfg = await this.config();
    const cycle = await this.prisma.potCycle.findUniqueOrThrow({ where: { id: cycleId } });

    // Remplissage rapide : si le pot s'est rempli assez vite, les récompenses durent plus longtemps.
    const fillHours = cycle.fullAt ? (cycle.fullAt.getTime() - cycle.startedAt.getTime()) / 3600_000 : Infinity;
    const fast = cfg.fastFillHours > 0 && cfg.fastFillBonusHours > 0 && fillHours <= cfg.fastFillHours;
    const bonusHours = fast ? cfg.fastFillBonusHours : 0;
    const freeleechHours = cfg.freeleechEnabled ? Math.min(MAX_REWARD_HOURS, cfg.rewardHours + bonusHours) : 0;
    const doubleHours = cfg.doubleUpload ? Math.min(MAX_REWARD_HOURS, (cfg.doubleUploadHours > 0 ? cfg.doubleUploadHours : cfg.rewardHours) + bonusHours) : 0;

    // Le départ : après le délai prévu, après un freeleech déjà en cours (jamais superposé, donc jamais perdu), après le délai entre deux récompenses,
    // puis, si une heure fixe est choisie, à la prochaine occurrence de cette heure.
    const fl = await this.settings.freeleechState();
    const lastDone = await this.prisma.potCycle.findFirst({ where: { status: 'DONE', rewardEndsAt: { not: null }, id: { not: cycleId } }, orderBy: { rewardEndsAt: 'desc' }, select: { rewardEndsAt: true } });
    let earliest = Math.max(Date.now() + cfg.startDelayHours * 3600_000, fl.until?.getTime() ?? 0, lastDone?.rewardEndsAt ? lastDone.rewardEndsAt.getTime() + cfg.cooldownHours * 3600_000 : 0);
    if (cfg.startAtHour >= 0) earliest = nextAtHour(new Date(earliest), cfg.startAtHour).getTime();
    const startsAt = new Date(earliest);
    const longest = Math.max(freeleechHours, doubleHours);
    const endsAt = new Date(earliest + longest * 3600_000);

    const title = `${cfg.icon} ${cfg.name}`;
    if (freeleechHours > 0) {
      const message = cfg.message || `Merci à tous les donateurs : ${cfg.name} est plein ! Les téléchargements ne comptent pas dans ton ratio${doubleHours > 0 ? ' et ton upload compte en double' : ''}.`;
      await this.prisma.freeleechEvent.create({ data: { title, message, startsAt, endsAt: new Date(earliest + freeleechHours * 3600_000) } });
      this.settings.invalidateFreeleech();
    }
    if (doubleHours > 0) await this.addDoubleUpload(startsAt, doubleHours);
    await this.prisma.potCycle.update({ where: { id: cycleId }, data: { rewardStartsAt: startsAt, rewardEndsAt: endsAt, rewardHours: longest } });

    await this.rewardDonors(cfg, cycleId);
    const rained = await this.rain(cfg);

    // Le pot suivant s'ouvre aussitôt : objectif proportionnel aux membres actifs, ou augmenté de X % ; l'excédent est reporté si prévu.
    let nextGoal = Math.max(100, Math.round(cycle.goal * (1 + cfg.goalGrowthPct / 100)));
    if (cfg.goalPerMember > 0) nextGoal = Math.max(cfg.goal, cfg.goalPerMember * (await this.activeMembers(30)));
    const carry = cfg.carryOver ? Math.min(Math.max(0, cycle.collected - cycle.goal), nextGoal - 1) : 0;
    const next = await this.prisma.potCycle.create({ data: { number: cycle.number + 1, goal: nextGoal, collected: carry } });
    if (carry > 0) await this.reachTiers(cfg, next.id, 0, carry, nextGoal);

    if (cfg.announce) await this.announce(cfg, startsAt, endsAt, { freeleechHours, doubleHours, fast, rained });
    return { started: true, startsAt, endsAt, freeleechHours, doubleHours, fastFill: fast };
  }

  /** Membres vus ces N derniers jours (comptes principaux actifs). */
  private activeMembers(days: number) {
    return this.prisma.user.count({ where: { parentId: null, status: 'ACTIVE', lastSeenAt: { gt: new Date(Date.now() - days * DAY) } } });
  }

  /** Pluie de points : chaque membre actif (vu ces 7 derniers jours) reçoit des points bonus. Renvoie le nombre de membres servis. */
  private async rain(cfg: PotConfig): Promise<number> {
    if (cfg.rainPoints <= 0) return 0;
    const { count } = await this.prisma.user.updateMany({ where: { parentId: null, status: 'ACTIVE', lastSeenAt: { gt: new Date(Date.now() - 7 * DAY) } }, data: { bonusPoints: { increment: cfg.rainPoints } } });
    return count;
  }

  /** Récompenses des donateurs : points rendus (pourcentage des dons), bonus du podium, jetons freeleech ; une notification de remerciement. */
  private async rewardDonors(cfg: PotConfig, cycleId: string) {
    if (cfg.donorRefundPct <= 0 && cfg.topDonorBonus <= 0 && cfg.rewardTokens <= 0) return;
    const byUser = await this.prisma.potDonation.groupBy({ by: ['userId'], where: { cycleId, topUp: false }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } });
    const podium = [1, 0.6, 0.3];
    for (const [rank, row] of byUser.entries()) {
      const refund = Math.floor(((row._sum.amount ?? 0) * cfg.donorRefundPct) / 100);
      const bonus = rank < 3 ? Math.floor(cfg.topDonorBonus * podium[rank]) : 0;
      const total = refund + bonus;
      if (total <= 0 && cfg.rewardTokens <= 0) continue;
      await this.prisma.user.update({ where: { id: row.userId }, data: { ...(total > 0 ? { bonusPoints: { increment: total } } : {}), ...(cfg.rewardTokens > 0 ? { freeleechTokens: { increment: cfg.rewardTokens } } : {}) } }).catch(() => undefined);
      const parts = [
        refund > 0 ? `${refund} points rendus (${cfg.donorRefundPct} % de tes dons)` : '',
        bonus > 0 ? `${bonus} points de bonus (n° ${rank + 1} des donateurs)` : '',
        cfg.rewardTokens > 0 ? `${cfg.rewardTokens} jeton${cfg.rewardTokens > 1 ? 's' : ''} freeleech` : '',
      ].filter(Boolean);
      await this.notifications.notify({ userId: row.userId, type: 'SYSTEM', title: `${cfg.icon} Merci pour ta générosité !`, body: parts.join(' + '), link: '/pot' }).catch(() => undefined);
    }
  }

  private async announce(cfg: PotConfig, startsAt: Date, endsAt: Date, r: { freeleechHours: number; doubleHours: number; fast: boolean; rained: number }) {
    const author = await this.prisma.user.findFirst({ where: { role: { in: ['OWNER', 'ADMIN'] as any }, parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const now = startsAt.getTime() <= Date.now() + 60_000;
    const perks = [
      r.freeleechHours > 0 ? `[b]Freeleech global ${r.freeleechHours} h[/b] : les téléchargements ne comptent pas dans ton ratio` : '',
      r.doubleHours > 0 ? `[b]Double upload global ${r.doubleHours} h[/b] : ce que tu envoies compte en double` : '',
      cfg.rainPoints > 0 && r.rained > 0 ? `[b]Pluie de points[/b] : ${cfg.rainPoints} points bonus offerts à chaque membre actif` : '',
      cfg.rewardTokens > 0 ? `[b]${cfg.rewardTokens} jeton${cfg.rewardTokens > 1 ? 's' : ''} freeleech[/b] pour chaque donateur` : '',
    ].filter(Boolean).map((x) => `• ${x}`).join('\n');
    const body = `[b]Du ${fmtDate(startsAt)}\nau ${fmtDate(endsAt)}[/b]\n\n${perks}${r.fast ? '\n\n⚡ Pot rempli en un temps record : les récompenses durent plus longtemps !' : ''}\n\nMerci à tous les donateurs !`;
    if (author) await this.prisma.announcement.create({ data: { title: `${cfg.icon} ${cfg.name} est plein !`, content: body, kind: 'EVENT', pinned: false, authorId: author.id } }).catch((e) => this.logger.warn(`Annonce du pot : ${e?.message ?? e}`));
    const what = r.freeleechHours > 0 ? 'Freeleech global' : r.doubleHours > 0 ? 'Double upload global' : 'Récompenses';
    await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `${cfg.icon} ${cfg.name} est plein !`, body: now ? `${what} jusqu'au ${fmtDate(endsAt)}` : `${what} du ${fmtDate(startsAt)} au ${fmtDate(endsAt)}`, link: '/pot' }).catch(() => undefined);
  }

  /** Lancement à la main d'un pot plein (quand « démarrage automatique » est décoché). */
  async trigger() {
    const cycle = await this.prisma.potCycle.findFirst({ where: { status: 'FULL' }, orderBy: { number: 'desc' } });
    if (!cycle) throw new NotFoundException("Le pot n'est pas plein");
    return this.start(cycle.id);
  }

  /** Si le pot est déjà plein au moment de l'activation ou d'un changement d'objectif, il se déclenche. */
  async refresh() {
    const cfg = await this.config();
    if (!cfg.enabled) return;
    const cycle = await this.currentCycle(cfg);
    if (cycle.status === 'OPEN') await this.checkFull(cycle.id);
  }

  private async notifyAdmins(title: string, body: string) {
    const admins = await this.prisma.user.findMany({ where: { role: { in: ['OWNER', 'ADMIN'] as any }, parentId: null, status: 'ACTIVE' }, select: { id: true } });
    await Promise.all(admins.map((a) => this.notifications.notify({ userId: a.id, type: 'SYSTEM', title, body, link: '/admin?tab=Pot%20commun' }).catch(() => undefined)));
  }
}
