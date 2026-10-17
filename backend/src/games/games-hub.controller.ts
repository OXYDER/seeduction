import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf } from '../common/utils/account';
import { GamesHubService } from './games-hub.service';

/** Page d'accueil des jeux : une case par jeu, avec ses statistiques. */
@Controller('games')
export class GamesHubController {
  constructor(private hub: GamesHubService) {}

  @UseGuards(JwtAuthGuard)
  @Get('summary')
  summary(@Request() req: any) { return this.hub.summary(accountOf(req)); }
}
