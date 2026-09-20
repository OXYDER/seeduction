import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, MetricsService, PrismaService],
  exports: [MetricsService],
})
export class MonitoringModule {}
