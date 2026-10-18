import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SportsService } from '../sports/sports.service';
import { MetricsService } from './metrics.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { configWeaknesses, secretWeakness } from '../common/utils/secret';
import { AlertState, Check, Level, evaluate, overall, planAlerts } from './health';

const KEY = 'healthAlerts';
const EVERY_MS = 5 * 60_000;

type ExtraCheck = () => Promise<Check | null>;

/**
 * Santé du site : évalue des contrôles (base, secret, tâches planifiées, API de la LNH, mémoire, erreurs, courriels) toutes les cinq minutes et prévient les
 * administrateurs par une notification (catégorie « système », qui ne peut pas être coupée) quand un problème apparaît ou disparaît.
 */
@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);
  private alerted = new Map<string, AlertState>();
  private extra = new Map<string, ExtraCheck>();
  private last: { at: number; checks: Check[] } | null = null;
  private running = false;

  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService, private sports: SportsService, private metrics: MetricsService) {}

  /** Premier contrôle une minute après le démarrage (le temps que tout soit prêt). */
  onModuleInit() { setTimeout(() => { void this.tick(); }, 60_000).unref?.(); }

  /** Oublie les derniers résultats : le prochain affichage refait les mesures (après un changement de réglage). */
  invalidate() { this.last = null; }

  /** Permet à un autre module d'ajouter son propre contrôle (par exemple la surveillance de l'économie des points). */
  register(id: string, fn: ExtraCheck) { this.extra.set(id, fn); }

  async alertsEnabled(): Promise<boolean> { return ((await this.settings.get(KEY)) as { enabled?: boolean } | null)?.enabled !== false; }
  async setAlerts(enabled: boolean) { await this.settings.set(KEY, { enabled }); return { enabled }; }

  async check(): Promise<{ at: string; level: Level; checks: Check[]; alerts: boolean }> {
    const start = Date.now();
    let db = { ok: true, latencyMs: 0 as number | null };
    try { await this.prisma.$queryRaw`SELECT 1`; db.latencyMs = Date.now() - start; } catch { db = { ok: false, latencyMs: null }; }
    const series = this.metrics.series().slice(-10);
    const staff = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null, twoFactorEnabled: false }, select: { username: true }, take: 50 }).catch(() => []);
    const checks = evaluate({
      db, secretWeakness: secretWeakness(), configWeaknesses: configWeaknesses(), staffWithout2fa: staff.map((u) => u.username), jobs: jobMonitor.snapshot(), jobMonitor, nhl: this.sports.nhl,
      rssMB: Math.round(process.memoryUsage().rss / 1048576), errors5xxLast10min: series.reduce((s, p) => s + p.errors, 0), smtpConfigured: !!process.env.SMTP_HOST,
    });
    for (const fn of this.extra.values()) { try { const c = await fn(); if (c) checks.push(c); } catch (e) { this.logger.warn(`Contrôle de santé : ${(e as Error).message}`); } }
    this.last = { at: Date.now(), checks };
    return { at: new Date().toISOString(), level: overall(checks), checks, alerts: await this.alertsEnabled() };
  }

  /** Les derniers contrôles connus (sans refaire les mesures si elles ont moins d'une minute). */
  async current() {
    if (this.last && Date.now() - this.last.at < 60_000) return { at: new Date(this.last.at).toISOString(), level: overall(this.last.checks), checks: this.last.checks, alerts: await this.alertsEnabled() };
    return this.check();
  }

  @Interval(EVERY_MS)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const { checks } = await this.check();
      if (!(await this.alertsEnabled())) return;
      const plan = planAlerts(checks, this.alerted, Date.now());
      this.alerted = plan.next;
      if (plan.raise.length === 0 && plan.resolve.length === 0) return;
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null }, select: { id: true } });
      for (const a of admins) {
        for (const c of plan.raise) {
          await this.notifications.notify({ userId: a.id, type: 'SYSTEM', category: 'system', groupKey: `health-${c.id}`, title: `${c.level === 'error' ? '🔴' : '🟠'} Santé du site : ${c.label}`, body: c.detail.slice(0, 400), link: '/admin' }).catch(() => undefined);
        }
        for (const r of plan.resolve) {
          await this.notifications.notify({ userId: a.id, type: 'SYSTEM', category: 'system', groupKey: `health-${r.id}`, title: `🟢 Rétabli : ${r.label}`, body: 'Le problème signalé a disparu.', link: '/admin' }).catch(() => undefined);
        }
      }
      if (plan.raise.length) this.logger.warn(`Santé du site : ${plan.raise.map((c) => `${c.label} (${c.level})`).join(', ')}`);
    } catch (e) { this.logger.warn(`Santé du site : ${(e as Error).message}`); }
    finally { this.running = false; }
  }
}
