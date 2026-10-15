import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SportsModule } from '../sports/sports.module';
import { GamesController } from './games.controller';
import { MojService } from './moj.service';

@Module({ imports: [NotificationsModule, SportsModule], controllers: [GamesController], providers: [MojService], exports: [MojService] })
export class GamesModule {}
