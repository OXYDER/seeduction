import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SportsModule } from '../sports/sports.module';
import { PresenceModule } from '../presence/presence.module';
import { GamesController } from './games.controller';
import { MojService } from './moj.service';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
import { GamesHubController } from './games-hub.controller';
import { GamesHubService } from './games-hub.service';
import { HiLoController } from './hilo.controller';
import { HiLoService } from './hilo.service';
import { GamesCashbackService } from './games-cashback.service';
import { WheelController } from './wheel.controller';
import { WheelService } from './wheel.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({ imports: [NotificationsModule, SportsModule, PresenceModule], controllers: [GamesController, SlotsController, GamesHubController, HiLoController, WheelController, QuizController], providers: [MojService, SlotsService, GamesHubService, HiLoService, GamesCashbackService, WheelService, QuizService], exports: [MojService, SlotsService, HiLoService, GamesCashbackService, WheelService, QuizService] })
export class GamesModule {}
