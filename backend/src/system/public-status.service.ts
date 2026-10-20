import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SystemService } from './system.service';
import { incidentSpan } from '../common/utils/site-history';
import { COMPONENTS, PUBLIC_CHECKS, componentStates, dayStatuses, lastDays, overallState, uptimePercent } from '../common/utils/public-status';

const DAYS = 90;
const CACHE_MS = 30_000;

/**
 * Page d'état publique : visible sans connexion, pour que les membres sachent si le site fonctionne (surtout pendant un déploiement) sans écrire à l'équipe.
 * Ne montre que des services aux noms simples, une grille de 90 jours et des incidents sans détail technique.
 */
@Injectable()
export class PublicStatusService {
  private cache: { at: number; value: any } | null = null;

  constructor(private prisma: PrismaService, private system: SystemService) {}

  async status() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return { ...this.cache.value, serverTime: new Date().toISOString() };
    const now = Date.now();
    const since = new Date(now - DAYS * 86_400_000);
    const [incidents, perDay, first, notice, base] = await Promise.all([
      this.prisma.healthIncident.findMany({ where: { OR: [{ startedAt: { gte: since } }, { resolvedAt: null }] }, orderBy: { startedAt: 'desc' }, take: 500, select: { checkId: true, level: true, startedAt: true, resolvedAt: true } }),
      this.prisma.$queryRaw<{ day: string; hours: number; requests: number; errors: number }[]>`
        SELECT to_char("hour", 'YYYY-MM-DD') AS day, COUNT(*)::int AS hours, COALESCE(SUM("requests"), 0)::float8 AS requests, COALESCE(SUM("errors"), 0)::float8 AS errors
        FROM "SiteSample" WHERE "hour" >= ${new Date(since.getTime() - 86_400_000)} GROUP BY 1`,
      this.prisma.$queryRaw<{ first: Date | null }[]>`SELECT MIN("hour") AS first FROM "SiteSample"`,
      this.system.notice(),
      this.system.status(),
    ]);
    const firstDay = first[0]?.first ? new Date(first[0].first).toISOString().slice(0, 10) : null;
    const days = dayStatuses({
      days: lastDays(DAYS, now), incidents, firstDay, now,
      hoursSeen: new Map(perDay.map((r) => [r.day, r.hours])), traffic: new Map(perDay.map((r) => [r.day, { requests: r.requests, errors: r.errors }])),
    });
    const states = componentStates(incidents.filter((i) => !i.resolvedAt));
    const overall = notice ? 'maintenance' : overallState(states);
    const value = {
      overall,
      maintenance: notice,
      components: COMPONENTS.map((c) => ({ id: c.id, label: c.label, status: states[c.id] })),
      days,
      uptime30: uptimePercent(days.slice(-30)),
      uptime90: uptimePercent(days),
      incidents: incidents
        .filter((i) => PUBLIC_CHECKS[i.checkId] && i.startedAt.getTime() >= now - 30 * 86_400_000)
        .slice(0, 20)
        .map((i) => ({ title: PUBLIC_CHECKS[i.checkId].label, severity: i.level === 'error' ? 'outage' : 'degraded', startedAt: i.startedAt, resolvedAt: i.resolvedAt, duration: incidentSpan(i.startedAt, i.resolvedAt), ongoing: !i.resolvedAt })),
      version: base.version,
    };
    this.cache = { at: now, value };
    return { ...value, serverTime: new Date().toISOString() };
  }
}
