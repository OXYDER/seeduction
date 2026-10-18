import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';
import { SecurityWatchService } from './security-watch.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SportsModule } from '../sports/sports.module';

@Module({
  imports: [NotificationsModule, SportsModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MetricsService, HealthService, SecurityWatchService],
  exports: [MetricsService, HealthService],
})
export class MonitoringModule {}
