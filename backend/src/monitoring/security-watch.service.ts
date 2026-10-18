import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { Finding, KIND_LABEL, analyzeFailures, newStaffIps } from '../common/utils/suspicious';

const EVERY_MS = 5 * 60_000;
const RENOTIFY_MS = 24 * 3600_000;
const STAFF_ROLES = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] as const;

/**
 * Surveillance de l'activité suspecte à partir du journal d'audit : force brute, arrosage de comptes, compte ciblé et connexion d'un membre de l'équipe depuis une adresse
 * jamais vue. Un rapport est consultable dans Admin > Monitoring, et les administrateurs reçoivent une notification (une seule fois par jour pour un même constat).
 */
@Injectable()
export class SecurityWatchService {
  private readonly logger = new Logger(SecurityWatchService.name);
  private notified = new Map<string, number>();

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Constats des `hours` dernières heures, avec quelques totaux. */
  async report(hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    const [failedRows, okCount, staffRows] = await Promise.all([
      this.prisma.activityLog.findMany({ where: { action: 'LOGIN_FAILED', createdAt: { gte: since } }, select: { ip: true, meta: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20_000 }),
      this.prisma.activityLog.count({ where: { action: 'LOGIN', createdAt: { gte: since } } }),
      this.prisma.activityLog.findMany({ where: { action: 'LOGIN', createdAt: { gte: since }, user: { role: { in: [...STAFF_ROLES] } } }, select: { userId: true, ip: true, createdAt: true, user: { select: { username: true, role: true } } }, take: 2_000 }),
    ]);
    const failed = failedRows.map((r) => ({ ip: r.ip, username: String((r.meta as any)?.username ?? ''), at: r.createdAt.getTime() }));
    const staff = staffRows.filter((r) => r.userId && r.user).map((r) => ({ userId: r.userId as string, username: r.user!.username, role: r.user!.role as string, ip: r.ip, at: r.createdAt.getTime() }));

    const staffIds = [...new Set(staff.map((s) => s.userId))];
    const known = new Map<string, Set<string>>();
    if (staffIds.length > 0) {
      const old = await this.prisma.activityLog.findMany({ where: { action: 'LOGIN', userId: { in: staffIds }, createdAt: { lt: since }, ip: { not: null } }, select: { userId: true, ip: true }, distinct: ['userId', 'ip'], take: 5_000 });
      for (const o of old) { const set = known.get(o.userId as string) ?? new Set<string>(); set.add(o.ip as string); known.set(o.userId as string, set); }
    }

    const findings: Finding[] = [...analyzeFailures(failed), ...newStaffIps(staff, known)];
    const perIp = new Map<string, number>();
    for (const e of failed) perIp.set(e.ip ?? 'inconnue', (perIp.get(e.ip ?? 'inconnue') ?? 0) + 1);
    const topIps = [...perIp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ip, count]) => ({ ip, count }));
    return { hours, at: new Date().toISOString(), totals: { failed: failed.length, failedIps: perIp.size, logins: okCount }, findings: findings.map((f) => ({ ...f, label: KIND_LABEL[f.kind] })), topIps };
  }

  @Interval(EVERY_MS)
  async watch() {
    jobMonitor.run('security.watch', EVERY_MS);
    try {
      const { findings } = await this.report(1);
      const now = Date.now();
      for (const [k, t] of this.notified) if (now - t > RENOTIFY_MS) this.notified.delete(k);
      const fresh = findings.filter((f) => !this.notified.has(f.key));
      if (fresh.length === 0) return;
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null }, select: { id: true } });
      for (const f of fresh.slice(0, 5)) {
        this.notified.set(f.key, now);
        for (const a of admins) {
          await this.notifications.notify({ userId: a.id, type: 'SYSTEM', category: 'system', groupKey: `security-${f.key}`, title: `${f.severity === 'high' ? '🔴' : '🟠'} Sécurité : ${KIND_LABEL[f.kind]} (${f.subject})`, body: f.detail.slice(0, 400), link: '/admin' }).catch(() => undefined);
        }
      }
    } catch (e) { jobMonitor.fail('security.watch', e); this.logger.warn(`Surveillance de sécurité : ${(e as Error).message}`); }
  }
}
