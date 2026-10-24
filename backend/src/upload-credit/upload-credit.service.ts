import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isStaffRole } from '../common/utils/staff-2fa';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GB, UploadCreditConfig, creditBytes, normalizeUploadCredit, roomToday } from '../common/utils/upload-credit';

const KEY = 'uploadCredit';
const DAY = 86400_000;
const SEEDING_WINDOW = 45 * 60_000; // même fenêtre que le calcul des points bonus : une annonce dans les 45 dernières minutes
const SWEEP_WINDOW_DAYS = 30;

export interface Actor { userId: string; username: string }
export type CreditResult = 'credited' | 'skipped' | 'deferred';

const gbText = (bytes: bigint) => `${(Number(bytes) / GB).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} Go`;

/**
 * Crédit d'envoi. À l'approbation d'un torrent, 25 % de sa taille (réglable, plafonné) s'ajoutent à l'upload de son uploader, même si personne ne l'a encore
 * téléchargé. Conditions : l'uploader seede réellement le torrent, le plafond du jour n'est pas atteint, et ce n'est pas le robot d'import. Un torrent n'est
 * crédité qu'une fois ; supprimé ou rejeté ensuite, son crédit est repris. Ce qui ne peut pas être versé tout de suite (pas en train de seeder, plafond du jour)
 * est retenté toutes les dix minutes pendant 30 jours.
 */
@Injectable()
export class UploadCreditService implements OnModuleInit {
  private readonly logger = new Logger(UploadCreditService.name);
  private sweeping = false;

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private notifications: NotificationsService) {}

  async config(): Promise<UploadCreditConfig> { return normalizeUploadCredit(await this.settings.get(KEY)); }

  /** Au premier démarrage : date d'activation = maintenant (les torrents déjà approuvés ne sont pas crédités rétroactivement). */
  async onModuleInit() {
    try {
      const cfg = await this.config();
      if (!cfg.startedAt) await this.settings.set(KEY, { ...cfg, startedAt: new Date().toISOString() });
    } catch (e) { this.logger.warn(`Réglage du crédit d'envoi : ${(e as Error).message}`); }
  }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeUploadCredit({ ...(body ?? {}), startedAt: undefined }, await this.config()); // la date d'activation ne se modifie pas à la main
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'UPLOAD_CREDIT_CONFIG', next as any, ip);
    return next;
  }

  /** À appeler juste après l'approbation d'un torrent. Ne bloque jamais l'approbation. */
  async onApproved(torrentId: string): Promise<void> {
    try { await this.credit(torrentId); } catch (e) { this.logger.warn(`Crédit d'envoi (${torrentId}) : ${(e as Error).message}`); }
  }

  /** Verse le crédit d'un torrent approuvé si toutes les conditions sont réunies. */
  async credit(torrentId: string, cfgIn?: UploadCreditConfig): Promise<CreditResult> {
    const cfg = cfgIn ?? (await this.config());
    if (!cfg.enabled || cfg.percent <= 0) return 'skipped';
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, name: true, size: true, status: true, uploaderId: true, approvedAt: true } });
    if (!torrent || torrent.status !== 'APPROVED' || !torrent.approvedAt) return 'skipped';
    if (cfg.startedAt && torrent.approvedAt < new Date(cfg.startedAt)) return 'skipped';

    const uploader = await this.prisma.user.findUnique({ where: { id: torrent.uploaderId }, select: { id: true, parentId: true, profileType: true, status: true, role: true } });
    if (!uploader || uploader.profileType === 'BOT' || uploader.status !== 'ACTIVE' || isStaffRole(uploader.role)) return 'skipped'; // ni le robot, ni l'équipe (ses transferts ne sont pas comptabilisés) // le robot d'import n'est pas un membre à récompenser
    const accountId = uploader.parentId ?? uploader.id;

    const existing = await this.prisma.uploadCredit.findUnique({ where: { torrentId } });
    if (existing && !existing.revokedAt) return 'skipped';

    let bytes = creditBytes(torrent.size, cfg);
    if (bytes <= 0n) return 'skipped';
    if (cfg.dailyMaxGb > 0) { const cap = BigInt(cfg.dailyMaxGb) * BigInt(GB); if (bytes > cap) bytes = cap; } // un seul torrent doit toujours pouvoir passer
    const today = await this.prisma.uploadCredit.aggregate({ where: { userId: accountId, revokedAt: null, createdAt: { gt: new Date(Date.now() - DAY) } }, _sum: { bytes: true } });
    const room = roomToday(cfg, today._sum.bytes ?? 0n);
    if (room !== null && bytes > room) return 'deferred';

    if (cfg.requireSeeding) {
      const seeding = await this.prisma.peer.count({ where: { torrentId, userId: { in: [...new Set([uploader.id, accountId])] }, isSeeder: true, lastAnnounceAt: { gt: new Date(Date.now() - SEEDING_WINDOW) } } });
      if (seeding === 0) return 'deferred';
    }

    try {
      await this.prisma.$transaction([
        existing
          ? this.prisma.uploadCredit.update({ where: { torrentId }, data: { revokedAt: null, bytes, percent: cfg.percent, userId: accountId, torrentName: torrent.name.slice(0, 300), createdAt: new Date() } })
          : this.prisma.uploadCredit.create({ data: { torrentId, userId: accountId, torrentName: torrent.name.slice(0, 300), bytes, percent: cfg.percent } }),
        this.prisma.user.update({ where: { id: accountId }, data: { uploaded: { increment: bytes } } }),
      ]);
    } catch (e: any) {
      if (e?.code === 'P2002') return 'skipped'; // versé en même temps par l'approbation et le rattrapage
      throw e;
    }
    this.logger.log(`Crédit d'envoi : ${gbText(bytes)} pour « ${torrent.name} »`);
    await this.notifications.notify({
      userId: accountId, type: 'SYSTEM', category: 'torrents',
      title: `🎁 +${gbText(bytes)} de crédit d'envoi`,
      body: `${torrent.name} : ${cfg.percent} % de sa taille est ajouté à ton upload, même si personne ne l'a encore téléchargé.`,
      link: `/torrents/${torrent.id}`,
    }).catch(() => undefined);
    return 'credited';
  }

  /** Reprend le crédit d'un torrent rejeté ou supprimé (l'upload ne descend jamais sous zéro). */
  async revoke(torrentId: string): Promise<void> {
    const row = await this.prisma.uploadCredit.findUnique({ where: { torrentId } });
    if (!row || row.revokedAt) return;
    await this.prisma.$transaction([
      this.prisma.uploadCredit.update({ where: { torrentId }, data: { revokedAt: new Date() } }),
      this.prisma.$executeRaw`UPDATE "User" SET "uploaded" = GREATEST(0, "uploaded" - ${row.bytes}) WHERE "id" = ${row.userId}`,
    ]);
    this.logger.log(`Crédit d'envoi repris : ${gbText(row.bytes)} (${row.torrentName})`);
  }

  /** Rattrape les crédits qui n'ont pas pu être versés à l'approbation (pas encore en seed, plafond du jour). */
  @Interval(600_000)
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const cfg = await this.config();
      if (!cfg.enabled || cfg.percent <= 0 || !cfg.startedAt) return;
      const since = new Date(Math.max(Date.parse(cfg.startedAt), Date.now() - SWEEP_WINDOW_DAYS * DAY));
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT t."id" FROM "Torrent" t
        WHERE t."status" = 'APPROVED' AND t."approvedAt" > ${since}
          AND NOT EXISTS (SELECT 1 FROM "UploadCredit" c WHERE c."torrentId" = t."id" AND c."revokedAt" IS NULL)
        ORDER BY t."approvedAt" ASC LIMIT 200`;
      let done = 0;
      for (const r of rows) if ((await this.credit(r.id, cfg).catch(() => 'skipped')) === 'credited') done++;
      if (done > 0) this.logger.log(`Crédit d'envoi : ${done} torrent(s) rattrapé(s)`);
    } catch (e) { this.logger.warn(`Rattrapage du crédit d'envoi : ${(e as Error).message}`); }
    finally { this.sweeping = false; }
  }

  // ------------------------------------------------------------------ lecture

  async mine(accountId: string) {
    const cfg = await this.config();
    const [sum, recent] = await Promise.all([
      this.prisma.uploadCredit.aggregate({ where: { userId: accountId, revokedAt: null }, _sum: { bytes: true }, _count: { _all: true } }),
      this.prisma.uploadCredit.findMany({ where: { userId: accountId, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 8, select: { torrentId: true, torrentName: true, bytes: true, createdAt: true } }),
    ]);
    return {
      enabled: cfg.enabled, percent: cfg.percent, maxPerTorrentGb: cfg.maxPerTorrentGb, dailyMaxGb: cfg.dailyMaxGb, requireSeeding: cfg.requireSeeding,
      totalBytes: Number(sum._sum.bytes ?? 0n), count: sum._count._all,
      recent: recent.map((r) => ({ torrentId: r.torrentId, name: r.torrentName, bytes: Number(r.bytes), at: r.createdAt })),
    };
  }
}
