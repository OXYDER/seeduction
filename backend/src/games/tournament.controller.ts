import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { TournamentService } from './tournament.service';

/** Tournoi de la semaine : classement gratuit alimenté par les jeux gratuits. Rien n'est misé : aucune permission « dépenser » n'est demandée. */
@Controller('games/tournament')
export class TournamentController {
  constructor(private tournament: TournamentService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.tournament.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.tournament.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.tournament.saveConfig({ userId: req.user.userId, username: req.user.username }, body ?? {}, req.ip ?? null) }; }

  /** Gros lot de départ (reporté sur la prochaine semaine réglée). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/jackpot')
  jackpot(@Body('amount') amount: number, @Request() req: any) { return this.tournament.setJackpot({ userId: req.user.userId, username: req.user.username }, amount, req.ip ?? null); }

  /** Règle tout de suite les semaines terminées pas encore réglées (sinon : le lundi matin). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/settle')
  async settle() { return { settled: await this.tournament.settlePending() }; }
}
