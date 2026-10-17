import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MojService } from './moj.service';
import { SlotsService } from './slots.service';
import { HiLoService } from './hilo.service';
import { WheelService } from './wheel.service';
import { QuizService } from './quiz.service';
import { PicksService } from './picks.service';
import { BlackjackService } from './blackjack.service';
import { stakeable } from '../common/utils/points';

/** Page d'accueil des jeux : le portefeuille du membre et quelques statistiques de chaque jeu, pour les cases de la page. */
@Injectable()
export class GamesHubService {
  constructor(private prisma: PrismaService, private moj: MojService, private slots: SlotsService, private hilo: HiLoService, private wheel: WheelService, private quiz: QuizService, private picks: PicksService, private blackjack: BlackjackService) {}

  async summary(accountId: string) {
    const account = await this.prisma.user.findUnique({ where: { id: accountId }, select: { bonusPoints: true, donatedPoints: true, gamesOptOut: true } });
    const [moj, slots, hilo, wheel, quiz, picks, blackjack] = await Promise.all([this.moj.summary(accountId), this.slots.summary(accountId), this.hilo.summary(accountId), this.wheel.summary(accountId), this.quiz.summary(accountId), this.picks.summary(accountId), this.blackjack.summary(accountId)]);
    return {
      me: {
        points: Math.floor(account?.bonusPoints ?? 0), donated: Math.floor(Math.min(account?.donatedPoints ?? 0, account?.bonusPoints ?? 0)),
        stakeable: stakeable(account?.bonusPoints ?? 0, account?.donatedPoints ?? 0), optOut: !!account?.gamesOptOut,
      },
      moj, slots, hilo, wheel, quiz, picks, blackjack,
    };
  }
}
