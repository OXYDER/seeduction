import { Module } from '@nestjs/common';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AntiCheatModule } from '../anticheat/anticheat.module';

@Module({
  imports: [NotificationsModule, AntiCheatModule],
  controllers: [TrackerController],
  providers: [TrackerService],
  exports: [TrackerService],
})
export class TrackerModule {}
