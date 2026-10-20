import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { normalizeTrustedConfig, shouldDemote, shouldPromote, TrustedConfig, UploaderStats } from '../common/utils/trusted-uploader';

const KEY = 'trustedUploaders';
const DAY = 86_400_000;
const FAULT_ACTIONS = ['TORRENT_HOLD', 'TORRENT_REJECT'];

/**
 * Rang « Uploadeur » automatique : promotion des membres dont les torrents sont presque toujours approuvés sans correction, rétrogradation de ceux qui cessent d'envoyer
 * ou accumulent fautes et signalements. Les Uploadeurs nommés à la main par l'équipe ne sont jamais rétrogradés automatiquement. Les torrents d'un Uploadeur sont approuvés dès l'envoi.
 */
@Injectable()
export class TrustedUploadersService {
  private readonly log = new Logger(TrustedUploadersService.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService, private audit: AuditService, private admin: AdminService) {}

  async config(): Promise<TrustedConfig> {
    return normalizeTrustedConfig(await this.settings.get(KEY));
  }

  async saveConfig(raw: any): Promise<TrustedConfig> {
    const cfg = normalizeTrustedConfig(raw);
    await this.settings.set(KEY, cfg);
    return cfg;
  }

  /** Mesures d'un membre, sur les fenêtres de réglage. */
  async statsFor(userId: string, c: TrustedConfig): Promise<UploaderStats> {
    const now = Date.now();
    const winSince = new Date(now - c.windowDays * DAY), keepSince = new Date(now - c.keepWindowDays * DAY);
    const [user, approvedTotal, inWindow, last, faults, reports, warnings, bans] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.torrent.count({ where: { uploaderId: userId, status: 'APPROVED' } }),
      this.prisma.torrent.findMany({ where: { uploaderId: userId, createdAt: { gte: winSince } }, select: { id: true, status: true }, take: 2000 }),
      this.prisma.torrent.findFirst({ where: { uploaderId: userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(DISTINCT a."meta"->>'torrentId')::int AS n FROM "ActivityLog" a JOIN "Torrent" t ON t."id" = a."meta"->>'torrentId' WHERE a."action" = ANY($1::text[]) AND a."createdAt" >= $2 AND t."uploaderId" = $3`,
        FAULT_ACTIONS, keepSince, userId),
      this.prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM "Report" r JOIN "Torrent" t ON t."id" = r."targetId" WHERE r."targetType" = 'torrent' AND r."status"::text <> 'DISMISSED' AND r."createdAt" >= $1 AND t."uploaderId" = $2`,
        keepSince, userId),
      this.prisma.warning.count({ where: { userId, createdAt: { gte: keepSince } } }),
      this.prisma.ban.count({ where: { userId, createdAt: { gte: keepSince } } }),
    ]);
    const ids = inWindow.map((t) => t.id);
    const faulted = new Set<string>(ids.length
      ? (await this.prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT DISTINCT a."meta"->>'torrentId' AS id FROM "ActivityLog" a WHERE a."action" = ANY($1::text[]) AND a."meta"->>'torrentId' = ANY($2::text[])`, FAULT_ACTIONS, ids)).map((r) => r.id)
      : []);
    for (const t of inWindow) if (t.status === 'REJECTED') faulted.add(t.id);
    const approvedClean = inWindow.filter((t) => t.status === 'APPROVED' && !faulted.has(t.id)).length;
    const reviewed = inWindow.filter((t) => t.status === 'APPROVED' || faulted.has(t.id)).length;
    return {
      accountDays: user ? Math.floor((now - user.createdAt.getTime()) / DAY) : 0,
      approvedTotal,
      window: { approvedClean, reviewed },
      keep: { faults: faults[0]?.n ?? 0, reports: reports[0]?.n ?? 0 },
      daysSinceLastUpload: last ? Math.floor((now - last.createdAt.getTime()) / DAY) : null,
      recentSanction: warnings + bans > 0,
    };
  }

  /** Un Uploadeur envoie un torrent : il est approuvé tout de suite (sans passer par la file de modération). Ne fait jamais échouer l'envoi. */
  async autoApproveIfTrusted(userId: string, torrentId: string): Promise<boolean> {
    try {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!u || u.role !== 'UPLOADER' || u.status !== 'ACTIVE') return false;
      await this.admin.approveTorrent(torrentId);
      return true;
    } catch (e: any) {
      this.log.warn(`Approbation automatique impossible : ${e?.message ?? e}`);
      return false;
    }
  }

  private async promote(user: { id: string; username: string }, reasons: string[]) {
    await this.prisma.user.update({ where: { id: user.id }, data: { role: 'UPLOADER', autoUploaderAt: new Date() } });
    await this.audit.log(null, 'UPLOADER_AUTO_PROMOTE', { targetId: user.id, target: user.username, reasons });
    await this.notifications.notify({
      userId: user.id, type: 'SYSTEM', category: 'torrents', title: '🎉 Tu es maintenant Uploadeur',
      body: 'Tes envois sont réguliers et sans faute : tes torrents sont désormais approuvés dès l\'envoi, sans passer par la modération. Pour garder ce rang, continue d\'envoyer régulièrement, sans erreur ni trop de signalements.',
      link: '/wiki/guide-uploadeur',
    });
  }

  private async demote(user: { id: string; username: string }, reasons: string[]) {
    await this.prisma.user.update({ where: { id: user.id }, data: { role: 'USER', autoUploaderAt: null } });
    await this.audit.log(null, 'UPLOADER_AUTO_DEMOTE', { targetId: user.id, target: user.username, reasons });
    await this.notifications.notify({
      userId: user.id, type: 'SYSTEM', category: 'torrents', title: 'Rang Uploadeur retiré',
      body: `Ton rang Uploadeur est retiré (${reasons.join(' ; ')}). Tes prochains torrents repassent par la modération ; tu pourras le retrouver en reprenant des envois réguliers et sans faute.`,
      link: '/wiki/guide-uploadeur',
    });
  }

  /** Évaluation complète : rétrograde ceux qui ne remplissent plus les conditions, promeut ceux qui les remplissent. */
  async run(): Promise<{ promoted: string[]; demoted: string[]; checked: number }> {
    const c = await this.config();
    const out = { promoted: [] as string[], demoted: [] as string[], checked: 0 };
    if (!c.enabled) return out;

    // 1. Uploadeurs promus automatiquement : gardent-ils leur rang ?
    const held = await this.prisma.user.findMany({ where: { role: 'UPLOADER', autoUploaderAt: { not: null }, status: 'ACTIVE', deletedAt: null }, select: { id: true, username: true, autoUploaderAt: true } });
    for (const u of held) {
      out.checked++;
      const s = await this.statsFor(u.id, c);
      // Un Uploadeur tout juste promu a un délai de grâce : l'inactivité ne compte qu'à partir de sa promotion.
      const sinceDays = Math.floor((Date.now() - u.autoUploaderAt!.getTime()) / DAY);
      const stats = s.daysSinceLastUpload === null || s.daysSinceLastUpload > sinceDays ? { ...s, daysSinceLastUpload: Math.min(s.daysSinceLastUpload ?? sinceDays, sinceDays) } : s;
      const v = shouldDemote(stats, c);
      if (v.action === 'demote') { await this.demote(u, v.reasons); out.demoted.push(u.username); }
    }

    // 2. Membres ordinaires assez actifs pour être examinés.
    const groups = await this.prisma.torrent.groupBy({ by: ['uploaderId'], where: { status: 'APPROVED' }, _count: { _all: true }, having: { uploaderId: { _count: { gte: c.minApproved } } } });
    if (groups.length) {
      const candidates = await this.prisma.user.findMany({
        where: { id: { in: groups.map((g) => g.uploaderId) }, role: 'USER', status: 'ACTIVE', parentId: null, deletedAt: null, profileType: { not: 'BOT' } },
        select: { id: true, username: true },
      });
      for (const u of candidates) {
        out.checked++;
        const v = shouldPromote(await this.statsFor(u.id, c), c);
        if (v.action === 'promote') { await this.promote(u, v.reasons); out.promoted.push(u.username); }
      }
    }
    return out;
  }

  @Cron('30 4 * * *')
  async nightly() {
    jobMonitor.run('uploadeurs.auto');
    try {
      const r = await this.run();
      if (r.promoted.length || r.demoted.length) this.log.log(`Uploadeurs : ${r.promoted.length} promu(s), ${r.demoted.length} rétrogradé(s)`);
    } catch (e) { jobMonitor.fail('uploadeurs.auto', e); this.log.warn(`Uploadeurs automatiques : ${(e as Error).message}`); }
  }

  /** Page d'administration : réglages, Uploadeurs (automatiques et nommés à la main) et membres proches de la promotion. */
  async overview() {
    const c = await this.config();
    const uploaders = await this.prisma.user.findMany({ where: { role: 'UPLOADER', deletedAt: null }, select: { id: true, username: true, autoUploaderAt: true, memberClass: true }, orderBy: { username: 'asc' }, take: 200 });
    const trusted: any[] = [];
    for (const u of uploaders) {
      const s = await this.statsFor(u.id, c);
      trusted.push({ id: u.id, username: u.username, auto: !!u.autoUploaderAt, since: u.autoUploaderAt, stats: s, risk: u.autoUploaderAt ? shouldDemote(s, c).reasons : [] });
    }
    const near = await this.prisma.torrent.groupBy({ by: ['uploaderId'], where: { status: 'APPROVED' }, _count: { _all: true }, having: { uploaderId: { _count: { gte: Math.max(1, Math.floor(c.minApproved / 2)) } } } });
    const people = near.length
      ? await this.prisma.user.findMany({ where: { id: { in: near.map((g) => g.uploaderId) }, role: 'USER', status: 'ACTIVE', parentId: null, deletedAt: null, profileType: { not: 'BOT' } }, select: { id: true, username: true }, take: 60 })
      : [];
    const candidates: any[] = [];
    for (const p of people) {
      const s = await this.statsFor(p.id, c);
      const v = shouldPromote(s, c);
      candidates.push({ id: p.id, username: p.username, stats: s, ready: v.action === 'promote', missing: v.action === 'promote' ? [] : v.reasons });
    }
    candidates.sort((a, b) => Number(b.ready) - Number(a.ready) || b.stats.approvedTotal - a.stats.approvedTotal);
    return { config: c, trusted, candidates: candidates.slice(0, 30) };
  }
}
