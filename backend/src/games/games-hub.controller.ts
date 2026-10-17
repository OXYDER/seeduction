import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf } from '../common/utils/account';
import { GamesHubService } from './games-hub.service';
import { GamesCashbackService } from './games-cashback.service';

/** Page d'accueil des jeux : une case par jeu, avec ses statistiques. */
@Controller('games')
export class GamesHubController {
  constructor(private hub: GamesHubService, private cashback: GamesCashbackService) {}

  @UseGuards(JwtAuthGuard)
  @Get('summary')
  summary(@Request() req: any) { return this.hub.summary(accountOf(req)); }

  /** Remise de fidélité (tous les jeux contre la maison) : réglages réservés à l'administration. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('cashback/admin')
  cashbackConfig() { return this.cashback.config(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('cashback/admin')
  saveCashback(@Body() body: any, @Request() req: any) { return this.cashback.saveConfig({ userId: req.user.userId }, body, req.ip); }
}
