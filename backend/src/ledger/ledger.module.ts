import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { PointsLedgerController } from './points-ledger.controller';
import { PointsLedgerService } from './points-ledger.service';

@Module({ imports: [MonitoringModule], controllers: [PointsLedgerController], providers: [PointsLedgerService], exports: [PointsLedgerService] })
export class LedgerModule {}
