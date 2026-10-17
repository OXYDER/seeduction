import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { CardsService } from './cards.service';

/** Cartes à collectionner : aucune mise, donc aucune permission « dépenser » n'est demandée aux profils d'un compte famille. */
@Controller('games/cards')
export class CardsController {
  constructor(private cards: CardsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.cards.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('daily')
  daily(@Request() req: any) { return this.cards.claimDaily(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('open')
  open(@Request() req: any) { return this.cards.open(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('craft')
  craft(@Body() body: { cardId?: string }, @Request() req: any) { return this.cards.craft(accountOf(req), String(body?.cardId ?? '')); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.cards.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.cards.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
