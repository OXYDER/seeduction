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
import { PicksController } from './picks.controller';
import { PicksService } from './picks.service';
import { BlackjackController } from './blackjack.controller';
import { BlackjackService } from './blackjack.service';
import { DiceController } from './dice.controller';
import { DiceService } from './dice.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { BoardsController } from './boards.controller';
import { DuelsController } from './duels.controller';
import { DuelsService } from './duels.service';
import { BoardsService } from './boards.service';

@Module({ imports: [NotificationsModule, SportsModule, PresenceModule], controllers: [GamesController, SlotsController, GamesHubController, HiLoController, WheelController, QuizController, PicksController, BlackjackController, DiceController, CardsController, ChallengesController, BoardsController, DuelsController], providers: [MojService, SlotsService, GamesHubService, HiLoService, GamesCashbackService, WheelService, QuizService, PicksService, BlackjackService, DiceService, CardsService, ChallengesService, BoardsService, DuelsService], exports: [MojService, SlotsService, HiLoService, GamesCashbackService, WheelService, QuizService, PicksService, BlackjackService, DiceService, CardsService, ChallengesService] })
export class GamesModule {}
