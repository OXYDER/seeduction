import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';
import { SecurityWatchService } from './security-watch.service';
import { CspReportService } from './csp-report.service';
import { CspReportController } from './csp-report.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SportsModule } from '../sports/sports.module';

@Module({
  imports: [NotificationsModule, SportsModule],
  controllers: [MonitoringController, CspReportController],
  providers: [MonitoringService, MetricsService, HealthService, SecurityWatchService, CspReportService],
  exports: [MetricsService, HealthService],
})
export class MonitoringModule {}
