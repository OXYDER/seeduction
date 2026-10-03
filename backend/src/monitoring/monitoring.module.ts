import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, MetricsService],
  exports: [MetricsService],
})
export class MonitoringModule {}
