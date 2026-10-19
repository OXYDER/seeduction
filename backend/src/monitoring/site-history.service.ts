import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { MetricsService } from './metrics.service';
import { HOUR_MS, RANGES, type Range, type Sample, hourStart, incidentSpan, summarize, toPoints } from '../common/utils/site-history';

const KEEP_DAYS = 120;

/** Historique du site : enregistre chaque heure ce que le serveur a vu (en mémoire, il ne garde qu'une heure) pour pouvoir dessiner l'évolution sur 24 h, 7 ou 30 jours. */
@Injectable()
export class SiteHistoryService {
  private readonly logger = new Logger(SiteHistoryService.name);
  private peak = { hour: 0, online: 0 };
  private ticks = 0;

  constructor(private prisma: PrismaService, private metrics: MetricsService, private presence: PresenceService) {}

  /** Chaque minute : retient le pic de membres en ligne de l'heure ; toutes les 5 minutes, inscrit l'heure en cours. */
  @Interval(60_000)
  async tick() {
    try {
      const now = Date.now();
      const hour = hourStart(now).getTime();
      if (this.peak.hour !== hour) this.peak = { hour, online: 0 };
      this.peak.online = Math.max(this.peak.online, this.presence.listOnlineAll().length);
      if (++this.ticks % 5 === 0) await this.persist(hour);
      if (this.ticks % 1440 === 0) await this.prisma.siteSample.deleteMany({ where: { hour: { lt: new Date(now - KEEP_DAYS * 86_400_000) } } });
    } catch (e: any) { this.logger.warn(`Historique du site : ${e?.message ?? e}`); }
  }

  /** Inscrit (ou met à jour) l'heure : jamais de valeur plus basse qu'avant (un redémarrage du serveur remet les compteurs à zéro en cours d'heure). */
  async persist(hourMs = hourStart(Date.now()).getTime()) {
    const t = this.metrics.hourTotals(hourMs);
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    const lag = this.metrics.eventLoop().last30MinMs;
    // la colonne est une date sans fuseau, en UTC : la valeur est convertie explicitement (sinon le fuseau de la base la décale)
    const at = new Date(hourMs);
    await this.prisma.$executeRaw`
      INSERT INTO "SiteSample" ("hour", "requests", "errors", "announces", "onlinePeak", "rssMB", "lagMs")
      VALUES ((${at}::timestamptz AT TIME ZONE 'UTC'), ${t.requests}, ${t.errors}, ${t.announces}, ${this.peak.hour === hourMs ? this.peak.online : 0}, ${rss}, ${lag})
      ON CONFLICT ("hour") DO UPDATE SET
        "requests" = GREATEST("SiteSample"."requests", EXCLUDED."requests"), "errors" = GREATEST("SiteSample"."errors", EXCLUDED."errors"), "announces" = GREATEST("SiteSample"."announces", EXCLUDED."announces"),
        "onlinePeak" = GREATEST("SiteSample"."onlinePeak", EXCLUDED."onlinePeak"), "rssMB" = GREATEST("SiteSample"."rssMB", EXCLUDED."rssMB"), "lagMs" = GREATEST("SiteSample"."lagMs", EXCLUDED."lagMs")`;
  }

  async history(range: Range) {
    await this.persist().catch((e) => this.logger.warn(`Historique du site (heure en cours) : ${e?.message ?? e}`)); // l'heure en cours est à jour dans le graphique
    const since = new Date(Date.now() - RANGES[range] * HOUR_MS);
    const [rows, incidents] = await Promise.all([
      this.prisma.siteSample.findMany({ where: { hour: { gte: since } }, orderBy: { hour: 'asc' } }),
      this.prisma.healthIncident.findMany({ where: { startedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { startedAt: 'desc' }, take: 100 }),
    ]);
    const samples: Sample[] = rows;
    const now = new Date();
    return {
      range, points: toPoints(samples, range), summary: summarize(samples),
      incidents: incidents.map((i) => ({ id: i.id, checkId: i.checkId, label: i.label, level: i.level, detail: i.detail, startedAt: i.startedAt, resolvedAt: i.resolvedAt, duration: incidentSpan(i.startedAt, i.resolvedAt, now), open: !i.resolvedAt })),
    };
  }
}
