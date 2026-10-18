import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
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
  constructor(private monitoringService: MonitoringService, private health: HealthService, private security: SecurityWatchService) {}

  @Get()
  snapshot() {
    return this.monitoringService.snapshot();
  }

  /** Santé du site : contrôles et alertes. */
  @Get('health')
  healthSnapshot() { return this.health.current(); }

  /** Activité suspecte (force brute, arrosage de comptes, compte ciblé, nouvelle adresse pour l'équipe) sur les dernières heures. */
  @Get('security')
  securityReport(@Query('hours') hours?: string) { return this.security.report(Math.min(168, Math.max(1, Number(hours) || 24))); }

  /** Active ou coupe les notifications d'alerte envoyées aux administrateurs. */
  @Put('health/alerts')
  setAlerts(@Body() body: { enabled?: boolean }) { return this.health.setAlerts(body?.enabled !== false); }
}
