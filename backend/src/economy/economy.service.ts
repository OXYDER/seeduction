import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { ECONOMY, SHOP_ITEMS } from '../common/utils/economy';

const TOKEN_DURATION_MS = 7 * 86400_000;

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService, private settings: SettingsService) {}

  // ------------------------------------------------------------------ tâches planifiées

  /** Chaque heure : points bonus pour chaque torrent activement seedé. */
  @Cron(CronExpression.EVERY_HOUR)
  async accrueBonus() {
    const seeding = await this.prisma.$queryRaw<{ userId: string; n: bigint }[]>`
      SELECT "userId", COUNT(DISTINCT "torrentId") AS n FROM "Peer"
      WHERE "isSeeder" = true AND "lastAnnounceAt" > now() - interval '45 minutes'
      GROUP BY "userId"`;
    if (seeding.length === 0) return;
    await this.prisma.$transaction(seeding.map((s) => this.prisma.user.update({
      where: { id: s.userId },
      data: { bonusPoints: { increment: Math.min(Number(s.n), ECONOMY.bonusMaxTorrents) * ECONOMY.bonusPerTorrentHour } },
    })));
    this.logger.log(`Bonus crédité à ${seeding.length} membre(s)`);
  }

  /** Chaque heure : détecte les « hit & run » (torrent complété, délai de grâce écoulé, seed insuffisant, plus de seed en cours). */
  @Cron('15 * * * *')
  async detectHitAndRun() {
    const cutoff = new Date(Date.now() - ECONOMY.hnrGraceHours * 3600_000);
    const candidates = await this.prisma.snatch.findMany({
      where: { satisfied: false, hnr: false, completedAt: { lt: cutoff } },
      take: 500,
      orderBy: { completedAt: 'asc' },
    });
    for (const s of candidates) {
      const seeding = await this.prisma.peer.count({ where: { userId: s.userId, torrentId: s.torrentId, isSeeder: true } });
      if (seeding > 0) continue; // il seede encore : on lui laisse le temps
      const torrent = await this.prisma.torrent.findUnique({ where: { id: s.torrentId }, select: { name: true, uploaderId: true } });
      if (!torrent || torrent.uploaderId === s.userId) {
        await this.prisma.snatch.update({ where: { id: s.id }, data: { satisfied: true } }); // torrent supprimé ou à lui : rien à régulariser
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.snatch.update({ where: { id: s.id }, data: { hnr: true } }),
        this.prisma.warning.create({
          data: {
            userId: s.userId,
            reason: `Hit & run : « ${torrent.name} » abandonné après ${Math.floor(s.seedSeconds / 3600)} h de seed (minimum ${ECONOMY.hnrSeedHours} h)`,
            issuedBy: 'Système',
          },
        }),
      ]);
      await this.notifications.notify({
        userId: s.userId,
        type: 'SYSTEM',
        title: 'Hit & run détecté',
        body: `Reprends le seed de « ${torrent.name} » jusqu'à ${ECONOMY.hnrSeedHours} h (ou un ratio de ${ECONOMY.hnrRatio} sur ce torrent) pour régulariser.`,
        link: '/bonus',
      });
    }
  }

  /**
   * Chaque nuit : un torrent approuvé sans aucun seeder et sans aucune activité depuis DEAD_TORRENT_DAYS jours
   * (60 par défaut, 0 pour désactiver) passe en « mort » et disparaît des listes. Il revient tout seul
   * dès qu'un membre le seede de nouveau ; le staff peut aussi le remettre à la main.
   */
  @Cron('0 5 * * *')
  async markDeadTorrents() {
    const days = Number(process.env.DEAD_TORRENT_DAYS ?? 60);
    if (!Number.isFinite(days) || days <= 0) return;
    const cutoff = new Date(Date.now() - days * 86400_000);
    const dead = await this.prisma.torrent.findMany({
      where: { status: 'APPROVED', seeders: 0, updatedAt: { lt: cutoff } },
      select: { id: true, name: true, uploaderId: true },
      take: 500,
    });
    if (dead.length === 0) return;
    await this.prisma.torrent.updateMany({ where: { id: { in: dead.map((t) => t.id) } }, data: { status: 'DEAD' } });
    await this.prisma.notification.createMany({
      data: dead.map((t) => ({
        userId: t.uploaderId,
        type: 'SYSTEM' as const,
        title: 'Torrent sans seeder retiré des listes',
        body: `« ${t.name} » n'a plus de seeder depuis ${days} jours. Il revient automatiquement dès qu'il est de nouveau seedé.`,
        link: `/torrents/${t.id}`,
      })),
    });
    this.logger.log(`${dead.length} torrent(s) marqué(s) comme morts`);
  }

  /** Chaque nuit : supprime les jetons freeleech expirés. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanExpired() {
    await this.prisma.personalFreeleech.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  // ------------------------------------------------------------------ lecture

  async overview(userId: string) {
    const [user, seeding, hnrList, freeleechUntil] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { bonusPoints: true, freeleechTokens: true, uploaded: true, downloaded: true } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT "torrentId") AS n FROM "Peer" WHERE "userId" = ${userId} AND "isSeeder" = true AND "lastAnnounceAt" > now() - interval '45 minutes'`,
      this.prisma.snatch.findMany({ where: { userId, hnr: true, satisfied: false }, orderBy: { completedAt: 'desc' }, take: 50 }),
      this.settings.freeleechUntil(),
    ]);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const torrents = await this.prisma.torrent.findMany({ where: { id: { in: hnrList.map((h) => h.torrentId) } }, select: { id: true, name: true } });
    const names = new Map(torrents.map((t) => [t.id, t.name]));
    const seedingCount = Number(seeding[0]?.n ?? 0);

    return {
      points: user.bonusPoints,
      tokens: user.freeleechTokens,
      seedingCount,
      perHour: Math.min(seedingCount, ECONOMY.bonusMaxTorrents) * ECONOMY.bonusPerTorrentHour,
      freeleechUntil,
      rules: { hnrSeedHours: ECONOMY.hnrSeedHours, hnrRatio: ECONOMY.hnrRatio, hnrGraceHours: ECONOMY.hnrGraceHours, hnrLimit: ECONOMY.hnrLimit, ratioGraceGb: ECONOMY.ratioGraceGb },
      unresolved: hnrList.map((h) => ({
        id: h.id, torrentId: h.torrentId, name: names.get(h.torrentId) ?? '(torrent supprimé)',
        seedHours: Math.floor(h.seedSeconds / 3600), completedAt: h.completedAt,
      })),
      shop: SHOP_ITEMS,
    };
  }

  // ------------------------------------------------------------------ boutique

  async redeem(userId: string, itemId: string) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Article inconnu');

    // Débit atomique : ne passe que si le solde couvre le prix (deux clics simultanés ne peuvent pas dépenser deux fois).
    const debited = await this.prisma.user.updateMany({
      where: { id: userId, bonusPoints: { gte: item.cost } },
      data: { bonusPoints: { decrement: item.cost } },
    });
    if (debited.count === 0) throw new BadRequestException('Points bonus insuffisants');

    let code: string | undefined;
    try {
      if (item.id === 'upload_5gb') await this.prisma.user.update({ where: { id: userId }, data: { uploaded: { increment: 5_000_000_000n } } });
      else if (item.id === 'upload_20gb') await this.prisma.user.update({ where: { id: userId }, data: { uploaded: { increment: 20_000_000_000n } } });
      else if (item.id === 'freeleech_token') await this.prisma.user.update({ where: { id: userId }, data: { freeleechTokens: { increment: 1 } } });
      else if (item.id === 'invite') {
        code = randomBytes(16).toString('hex');
        await this.prisma.inviteCode.create({ data: { code, createdById: userId, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
      }
    } catch (err) {
      // L'effet a échoué : on rembourse.
      await this.prisma.user.update({ where: { id: userId }, data: { bonusPoints: { increment: item.cost } } });
      throw err;
    }
    return { ok: true, item: item.id, inviteCode: code };
  }

  async useToken(userId: string, torrentId: string) {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, freeleech: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    if (torrent.freeleech) throw new BadRequestException('Ce torrent est déjà freeleech pour tout le monde');
    const existing = await this.prisma.personalFreeleech.findUnique({ where: { userId_torrentId: { userId, torrentId } } });
    if (existing && existing.expiresAt > new Date()) throw new BadRequestException('Tu as déjà un jeton actif sur ce torrent');

    const spent = await this.prisma.user.updateMany({ where: { id: userId, freeleechTokens: { gte: 1 } }, data: { freeleechTokens: { decrement: 1 } } });
    if (spent.count === 0) throw new BadRequestException("Tu n'as aucun jeton freeleech (achète-en dans la boutique bonus)");
    const expiresAt = new Date(Date.now() + TOKEN_DURATION_MS);
    await this.prisma.personalFreeleech.upsert({
      where: { userId_torrentId: { userId, torrentId } },
      update: { expiresAt },
      create: { userId, torrentId, expiresAt },
    });
    return { expiresAt };
  }

  async tokenStatus(userId: string, torrentId: string) {
    const row = await this.prisma.personalFreeleech.findUnique({ where: { userId_torrentId: { userId, torrentId } } });
    return { activeUntil: row && row.expiresAt > new Date() ? row.expiresAt : null };
  }

  // ------------------------------------------------------------------ freeleech global (staff)

  /** Lance (ou arrête) un freeleech immédiat : soit pour N heures, soit jusqu'à une date précise. */
  async setGlobalFreeleech(input: { hours?: number | null; until?: string | null }) {
    const stopping = (input.hours === null || input.hours === undefined || input.hours <= 0) && !input.until;
    if (stopping) {
      await this.settings.set('freeleechUntil', null);
      return { freeleechUntil: null };
    }
    const until = input.until ? new Date(input.until) : new Date(Date.now() + Number(input.hours) * 3600_000);
    if (Number.isNaN(until.getTime())) throw new BadRequestException('Date invalide');
    if (until.getTime() <= Date.now()) throw new BadRequestException('La fin doit être dans le futur');
    if (until.getTime() - Date.now() > 31 * 86400_000) throw new BadRequestException('Durée maximale : 31 jours');
    await this.settings.set('freeleechUntil', until.toISOString());
    return { freeleechUntil: until };
  }

  // ------------------------------------------------------------------ événements freeleech programmés

  private parseEventDates(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Dates invalides');
    if (end <= start) throw new BadRequestException('La fin doit être après le début');
    if (end.getTime() - start.getTime() > 31 * 86400_000) throw new BadRequestException("Un événement dure 31 jours au maximum");
    return { start, end };
  }

  listEvents() {
    const from = new Date(Date.now() - 60 * 86400_000);
    return this.prisma.freeleechEvent.findMany({ where: { endsAt: { gt: from } }, orderBy: { startsAt: 'asc' }, take: 300 });
  }

  async createEvent(userId: string, data: { title: string; message?: string; startsAt: string; endsAt: string; announce?: boolean }) {
    const title = data.title?.trim();
    if (!title) throw new BadRequestException('Titre requis');
    const { start, end } = this.parseEventDates(data.startsAt, data.endsAt);
    if (end.getTime() <= Date.now()) throw new BadRequestException("Cet événement est déjà terminé");
    const event = await this.prisma.freeleechEvent.create({
      data: { title: title.slice(0, 120), message: data.message?.trim() || null, startsAt: start, endsAt: end, createdById: userId },
    });
    this.settings.invalidateFreeleech();

    if (data.announce) {
      const fmt = (d: Date) => d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Toronto' });
      const content = `[b]Du ${fmt(start)}\nau ${fmt(end)}[/b]\n\n${event.message ?? 'Les téléchargements ne comptent pas dans ton ratio pendant cet événement !'}`;
      await this.prisma.announcement.create({ data: { title: `🎉 ${event.title}`, content, pinned: false, authorId: userId } });
      await this.notifications.notifyAll({ type: 'ANNOUNCEMENT', title: `🎉 ${event.title}`, body: `Freeleech du ${fmt(start)} au ${fmt(end)}`, link: '/news' });
    }
    return event;
  }

  async updateEvent(id: string, data: { title?: string; message?: string | null; startsAt?: string; endsAt?: string }) {
    const current = await this.prisma.freeleechEvent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Événement introuvable');
    const { start, end } = this.parseEventDates(data.startsAt ?? current.startsAt.toISOString(), data.endsAt ?? current.endsAt.toISOString());
    const updated = await this.prisma.freeleechEvent.update({
      where: { id },
      data: {
        title: data.title?.trim() ? data.title.trim().slice(0, 120) : current.title,
        message: data.message !== undefined ? data.message?.trim() || null : current.message,
        startsAt: start, endsAt: end,
      },
    });
    this.settings.invalidateFreeleech();
    return updated;
  }

  async deleteEvent(id: string) {
    const removed = await this.prisma.freeleechEvent.delete({ where: { id } }).catch(() => null);
    if (!removed) throw new NotFoundException('Événement introuvable');
    this.settings.invalidateFreeleech();
    return removed;
  }
}
