import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { StatsBoardsService } from './stats-boards.service';
import { DeadService } from './dead.service';
import { UsersModule } from '../users/users.module';
import { BadgesModule } from '../badges/badges.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [UsersModule, BadgesModule, PresenceModule],
  controllers: [StatsController],
  providers: [StatsService, StatsBoardsService, DeadService],
})
export class StatsModule {}
