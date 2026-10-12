import { Module } from '@nestjs/common';
import { AntiCheatController } from './anticheat.controller';
import { AntiCheatService } from './anticheat.service';
import { AntiCheatAnalysisService } from './anticheat-analysis.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AntiCheatController],
  providers: [AntiCheatService, AntiCheatAnalysisService],
  exports: [AntiCheatService],
})
export class AntiCheatModule {}
