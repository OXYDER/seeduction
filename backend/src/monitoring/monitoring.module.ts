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
import { TelegramModule } from '../telegram/telegram.module';
import { PresenceModule } from '../presence/presence.module';
import { SiteHistoryService } from './site-history.service';

@Module({
  imports: [NotificationsModule, SportsModule, TelegramModule, PresenceModule],
  controllers: [MonitoringController, CspReportController],
  providers: [MonitoringService, MetricsService, HealthService, SecurityWatchService, CspReportService, SiteHistoryService],
  exports: [MetricsService, HealthService],
})
export class MonitoringModule {}
