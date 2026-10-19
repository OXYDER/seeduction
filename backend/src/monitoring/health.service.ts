import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
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

  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService, private sports: SportsService, private metrics: MetricsService, private telegram: TelegramService) {}

  /** Premier contrôle une minute après le démarrage (le temps que tout soit prêt). */
  onModuleInit() { setTimeout(() => { void this.tick(); }, 60_000).unref?.(); }

  /** Oublie les derniers résultats : le prochain affichage refait les mesures (après un changement de réglage). */
  invalidate() { this.last = null; }

  /** Permet à un autre module d'ajouter son propre contrôle (par exemple la surveillance de l'économie des points). */
  register(id: string, fn: ExtraCheck) { this.extra.set(id, fn); }

  async alertsEnabled(): Promise<boolean> { return ((await this.settings.get(KEY)) as { enabled?: boolean } | null)?.enabled !== false; }
  /** Les problèmes graves (rouges) sont aussi envoyés par Telegram aux administrateurs qui ont relié leur compte (activé par défaut). */
  async telegramAlerts(): Promise<boolean> { return ((await this.settings.get(KEY)) as { telegram?: boolean } | null)?.telegram !== false; }
  async setAlerts(enabled: boolean) { const cur = ((await this.settings.get(KEY)) as object | null) ?? {}; await this.settings.set(KEY, { ...cur, enabled }); return { enabled }; }
  async setTelegramAlerts(telegram: boolean) { const cur = ((await this.settings.get(KEY)) as object | null) ?? {}; await this.settings.set(KEY, { ...cur, telegram }); return { telegram }; }

  /** Ouvre un incident (sauf s'il y en a déjà un d'ouvert pour ce contrôle : un rappel n'en crée pas un second). */
  private async openIncident(c: Check) {
    try {
      const open = await this.prisma.healthIncident.findFirst({ where: { checkId: c.id, resolvedAt: null } });
      if (!open) await this.prisma.healthIncident.create({ data: { checkId: c.id, label: c.label.slice(0, 120), level: c.level, detail: c.detail.slice(0, 500) } });
      else if (open.level !== c.level) await this.prisma.healthIncident.update({ where: { id: open.id }, data: { level: c.level, detail: c.detail.slice(0, 500) } });
    } catch (e) { this.logger.warn(`Incident de santé : ${(e as Error).message}`); }
  }
  private async closeIncident(id: string) {
    try {
      const open = await this.prisma.healthIncident.findFirst({ where: { checkId: id, resolvedAt: null }, orderBy: { startedAt: 'desc' } });
      if (!open) return null;
      await this.prisma.healthIncident.updateMany({ where: { checkId: id, resolvedAt: null }, data: { resolvedAt: new Date() } });
      return open;
    } catch { return null; }
  }
  private esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
      // Historique des incidents (Admin > Monitoring) : ouverts à l'apparition d'un problème, fermés à son rétablissement.
      for (const c of plan.raise) await this.openIncident(c);
      const closed: { checkId: string; label: string; level: string }[] = [];
      for (const r of plan.resolve) { const inc = await this.closeIncident(r.id); if (inc) closed.push({ checkId: r.id, label: r.label, level: inc.level }); }
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
      // Telegram : seulement ce qui est grave (rouge) et son rétablissement, pour ne pas noyer les administrateurs.
      if (await this.telegramAlerts()) {
        const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
        for (const a of admins) {
          for (const c of plan.raise.filter((x) => x.level === 'error')) await this.telegram.dm(a.id, `🔴 <b>Seeduction : ${this.esc(c.label)}</b>\n${this.esc(c.detail.slice(0, 300))}${site ? `\n\n<a href="${site}/admin?tab=Monitoring">Ouvrir le monitoring</a>` : ''}`).catch(() => false);
          for (const r of closed.filter((x) => x.level === 'error')) await this.telegram.dm(a.id, `🟢 <b>Rétabli : ${this.esc(r.label)}</b>`).catch(() => false);
        }
      }
      if (plan.raise.length) this.logger.warn(`Santé du site : ${plan.raise.map((c) => `${c.label} (${c.level})`).join(', ')}`);
    } catch (e) { this.logger.warn(`Santé du site : ${(e as Error).message}`); }
    finally { this.running = false; }
  }
}
