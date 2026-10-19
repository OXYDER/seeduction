import { Body, Controller, Get, Put, Query, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SiteHistoryService } from './site-history.service';
import { parseRange } from '../common/utils/site-history';
import { HealthService } from './health.service';
import { SecurityWatchService } from './security-watch.service';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private monitoringService: MonitoringService, private health: HealthService, private security: SecurityWatchService, private history: SiteHistoryService, private prisma: PrismaService) {}

  @Get()
  snapshot() {
    return this.monitoringService.snapshot();
  }

  /** Santé du site : contrôles et alertes. */
  @Get('health')
  async healthSnapshot(@Request() req: any) {
    const [h, telegram, link] = await Promise.all([this.health.current(), this.health.telegramAlerts(), this.prisma.telegramLink.findUnique({ where: { userId: req.user.accountId ?? req.user.userId }, select: { id: true } })]);
    return { ...h, telegram, telegramLinked: !!link };
  }

  /** Évolution du site (membres en ligne, requêtes, erreurs, mémoire) et incidents récents. */
  @Get('history')
  historyData(@Query('range') range?: string) { return this.history.history(parseRange(range)); }

  /** Active ou coupe l'envoi des problèmes graves par Telegram. */
  @Put('health/telegram')
  setTelegram(@Body() body: { enabled?: boolean }) { return this.health.setTelegramAlerts(body?.enabled !== false); }

  /** Activité suspecte (force brute, arrosage de comptes, compte ciblé, nouvelle adresse pour l'équipe) sur les dernières heures. */
  @Get('security')
  securityReport(@Query('hours') hours?: string) { return this.security.report(Math.min(168, Math.max(1, Number(hours) || 24))); }

  /** Active ou coupe les notifications d'alerte envoyées aux administrateurs. */
  @Put('health/alerts')
  setAlerts(@Body() body: { enabled?: boolean }) { return this.health.setAlerts(body?.enabled !== false); }
}
