import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { GoalBonusService } from './goal-bonus.service';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';

@Module({ imports: [NotificationsModule, PresenceModule], controllers: [SportsController], providers: [SportsService, GoalBonusService], exports: [SportsService] })
export class SportsModule {}
