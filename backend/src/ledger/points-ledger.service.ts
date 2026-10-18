import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { HealthService } from '../monitoring/health.service';
import { jobMonitor } from '../common/utils/job-monitor';
import { DEFAULT_ECONOMY, EconomyConfig, SOURCES, byDay, createdFree, flagged, houseResult, normalizeEconomy, sourceMeta, topEarners, totalsBySource } from '../common/utils/ledger';

const KEY = 'economy';
const DAY = 86400_000;
const KEEP_DAYS = 120;

/** Le déclencheur qui note chaque changement de points : il attrape toutes les écritures, y compris celles que personne n'a pensé à étiqueter. */
const TRIGGER_SQL = [
  `CREATE OR REPLACE FUNCTION points_ledger_fn() RETURNS trigger AS $$
  DECLARE d double precision; src text;
  BEGIN
    d := NEW."bonusPoints" - OLD."bonusPoints";
    IF d <> 0 THEN
      src := COALESCE(NULLIF(current_setting('app.pts_source', true), ''), 'autre');
      INSERT INTO "PointsLedger" ("id", "userId", "source", "hour", "credit", "debit", "count")
      VALUES (md5(random()::text || clock_timestamp()::text), NEW."id", src, date_trunc('hour', now() AT TIME ZONE 'UTC'), GREATEST(d, 0), GREATEST(-d, 0), 1)
      ON CONFLICT ("userId", "source", "hour") DO UPDATE SET
        "credit" = "PointsLedger"."credit" + EXCLUDED."credit", "debit" = "PointsLedger"."debit" + EXCLUDED."debit", "count" = "PointsLedger"."count" + 1;
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS points_ledger_trg ON "User"`,
  `CREATE TRIGGER points_ledger_trg AFTER UPDATE OF "bonusPoints" ON "User" FOR EACH ROW EXECUTE FUNCTION points_ledger_fn()`,
];

export interface Actor { userId: string; username: string }

/**
 * Journal central des points : à chaque changement du solde d'un membre, une ligne regroupée par membre, source et heure (donc de taille bornée). Sert à voir combien de points
 * le site crée et reprend chaque jour, par source, et à repérer un membre qui gagne trop avec les jeux et les récompenses gratuites.
 */
@Injectable()
export class PointsLedgerService implements OnModuleInit {
  private readonly logger = new Logger(PointsLedgerService.name);
  installed = false;

  constructor(private prisma: PrismaService, private settings: SettingsService, private audit: AuditService, private health: HealthService) {}

  async onModuleInit() {
    await this.install();
    // la surveillance des gains inhabituels rejoint la santé du site (alerte aux administrateurs)
    this.health.register('economy', () => this.watch());
  }

  /** Installe (ou remet à jour) le déclencheur. Sans danger si on le refait : il est remplacé, jamais dupliqué. */
  async install(): Promise<boolean> {
    try {
      for (const sql of TRIGGER_SQL) await this.prisma.$executeRawUnsafe(sql);
      this.installed = true;
      this.logger.log('Journal des points : déclencheur installé');
    } catch (e) {
      this.installed = false;
      this.logger.warn(`Journal des points : déclencheur non installé (${(e as Error).message}). Lance « prisma db push » pour créer la table PointsLedger, puis redémarre.`);
    }
    return this.installed;
  }

  async config(): Promise<EconomyConfig> { return normalizeEconomy(await this.settings.get(KEY), DEFAULT_ECONOMY); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeEconomy(body, await this.config());
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'ECONOMY_CONFIG', next as any, ip);
    this.health.invalidate();
    return next;
  }

  private async hourly(since: Date) {
    const rows = await this.prisma.pointsLedger.groupBy({ by: ['source', 'hour'], where: { hour: { gte: since } }, _sum: { credit: true, debit: true, count: true } });
    return rows.map((r) => ({ source: r.source, hour: r.hour, credit: r._sum.credit ?? 0, debit: r._sum.debit ?? 0, count: r._sum.count ?? 0 }));
  }

  private async earnersSince(since: Date) {
    const rows = await this.prisma.pointsLedger.groupBy({ by: ['userId', 'source'], where: { hour: { gte: since } }, _sum: { credit: true, debit: true } });
    return topEarners(rows.map((r) => ({ userId: r.userId, source: r.source, hour: since, credit: r._sum.credit ?? 0, debit: r._sum.debit ?? 0 })), 10);
  }

  /** Contrôle de santé : un membre dépasse-t-il le seuil de gains sur 24 h avec les jeux et les récompenses gratuites ? */
  async watch() {
    jobMonitor.run('economy.watch', 5 * 60_000);
    try {
      const cfg = await this.config();
      if (cfg.alertThreshold <= 0 || !this.installed) return null;
      const top = flagged(await this.earnersSince(new Date(Date.now() - DAY)), cfg.alertThreshold);
      if (top.length === 0) return { id: 'economy', label: 'Gains inhabituels (points)', level: 'ok' as const, detail: `Personne ne dépasse ${cfg.alertThreshold} points gagnés en 24 h avec les jeux et les récompenses gratuites` };
      const names = new Map((await this.prisma.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
      return {
        id: 'economy', label: 'Gains inhabituels (points)', level: 'warn' as const,
        detail: `${top.map((t) => `${names.get(t.userId) ?? 'membre supprimé'} : +${Math.round(t.net)} points en 24 h (${Object.entries(t.bySource).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => `${sourceMeta(s).label} ${Math.round(n)}`).join(', ')})`).join(' · ')}. À vérifier dans Admin > Jeux > Économie (comptes multiples ? faille ?).`,
      };
    } catch (e) { jobMonitor.fail('economy.watch', e); throw e; }
  }

  /** Tableau de bord : flux de points par source et par jour, résultat de la maison, plus gros gagnants. */
  async overview(days = 14) {
    const span = Math.min(Math.max(Math.floor(days) || 14, 1), 90);
    const since = new Date(Date.now() - span * DAY);
    const [rows, config, top24, top7] = await Promise.all([this.hourly(since), this.config(), this.earnersSince(new Date(Date.now() - DAY)), this.earnersSince(new Date(Date.now() - 7 * DAY))]);
    const window = (ms: number) => totalsBySource(rows.filter((r) => r.hour.getTime() >= Date.now() - ms));
    const wins = { h24: window(DAY), d7: window(7 * DAY), all: totalsBySource(rows) };
    const flow = (m: Map<string, { credit: number; debit: number; count: number }>) => SOURCES.map((s) => ({ id: s.id, label: s.label, kind: s.kind, credit: Math.round(m.get(s.id)?.credit ?? 0), debit: Math.round(m.get(s.id)?.debit ?? 0), count: m.get(s.id)?.count ?? 0 }));
    const activeMembers = await this.prisma.pointsLedger.groupBy({ by: ['userId'], where: { hour: { gte: new Date(Date.now() - DAY) }, source: { in: SOURCES.filter((s) => s.kind === 'free' || s.kind === 'house').map((s) => s.id) } } });
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set([...top24, ...top7].map((t) => t.userId))] } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    const shape = (e: { userId: string; net: number; bySource: Record<string, number> }) => ({ username: names.get(e.userId) ?? 'Membre supprimé', net: Math.round(e.net), bySource: Object.fromEntries(Object.entries(e.bySource).map(([k, v]) => [k, Math.round(v)])) });
    return {
      installed: this.installed, config, spanDays: span,
      sources: SOURCES,
      totals: { h24: flow(wins.h24), d7: flow(wins.d7), all: flow(wins.all) },
      summary: {
        createdFree24h: Math.round(createdFree(wins.h24)), createdFree7d: Math.round(createdFree(wins.d7)), houseResult24h: Math.round(houseResult(wins.h24)), houseResult7d: Math.round(houseResult(wins.d7)),
        playersFree24h: activeMembers.length, perPlayer24h: activeMembers.length ? Math.round(createdFree(wins.h24) / activeMembers.length) : 0,
      },
      daily: byDay(rows).map((d) => ({ day: d.day, free: Math.round(createdFree(d.sources)), house: Math.round(houseResult(d.sources)), seed: Math.round(d.sources.get('seed')?.credit ?? 0), other: Math.round(['echange', 'autre'].reduce((s, k) => s + ((d.sources.get(k)?.credit ?? 0) - (d.sources.get(k)?.debit ?? 0)), 0)) })),
      earners24h: top24.map(shape), earners7d: top7.map(shape), flagged24h: flagged(top24, config.alertThreshold).length,
    };
  }

  /** Les lignes de plus de quatre mois sont supprimées : le journal reste petit. */
  @Cron('40 4 * * *', { timeZone: 'America/Toronto' })
  async prune() {
    jobMonitor.run('ledger.prune');
    try {
      const r = await this.prisma.pointsLedger.deleteMany({ where: { hour: { lt: new Date(Date.now() - KEEP_DAYS * DAY) } } });
      if (r.count > 0) this.logger.log(`Journal des points : ${r.count} ligne(s) de plus de ${KEEP_DAYS} jours supprimée(s)`);
    } catch (e) { jobMonitor.fail('ledger.prune', e); this.logger.warn(`Journal des points : nettoyage impossible (${(e as Error).message})`); }
  }
}
