import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SportsModule } from '../sports/sports.module';
import { GamesController } from './games.controller';
import { MojService } from './moj.service';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
import { GamesHubController } from './games-hub.controller';
import { GamesHubService } from './games-hub.service';

@Module({ imports: [NotificationsModule, SportsModule], controllers: [GamesController, SlotsController, GamesHubController], providers: [MojService, SlotsService, GamesHubService], exports: [MojService, SlotsService] })
export class GamesModule {}
