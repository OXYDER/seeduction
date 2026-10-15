import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SportsModule } from '../sports/sports.module';
import { GamesController } from './games.controller';
import { MojService } from './moj.service';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({ imports: [NotificationsModule, SportsModule], controllers: [GamesController, SlotsController], providers: [MojService, SlotsService], exports: [MojService, SlotsService] })
export class GamesModule {}
