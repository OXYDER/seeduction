import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { HealthService } from './health.service';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private monitoringService: MonitoringService, private health: HealthService) {}

  @Get()
  snapshot() {
    return this.monitoringService.snapshot();
  }

  /** Santé du site : contrôles et alertes. */
  @Get('health')
  healthSnapshot() { return this.health.current(); }

  /** Active ou coupe les notifications d'alerte envoyées aux administrateurs. */
  @Put('health/alerts')
  setAlerts(@Body() body: { enabled?: boolean }) { return this.health.setAlerts(body?.enabled !== false); }
}
