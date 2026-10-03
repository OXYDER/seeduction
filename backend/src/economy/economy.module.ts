import { Module } from '@nestjs/common';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { RanksService } from './ranks.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackerModule } from '../tracker/tracker.module';

@Module({
  imports: [NotificationsModule, TrackerModule],
  controllers: [EconomyController],
  providers: [EconomyService, RanksService],
  exports: [EconomyService],
})
export class EconomyModule {}
