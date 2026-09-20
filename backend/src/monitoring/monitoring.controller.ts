import { Controller, Get, UseGuards } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private monitoringService: MonitoringService) {}

  @Get()
  snapshot() {
    return this.monitoringService.snapshot();
  }
}
