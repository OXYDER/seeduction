import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { PicksService } from './picks.service';

/** Pronostics gratuits sur la LNH : rien n'est misé, donc aucune permission « dépenser » n'est demandée aux profils d'un compte famille. */
@Controller('games/picks')
export class PicksController {
  constructor(private picks: PicksService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Query('day') day: string | undefined, @Request() req: any) { return this.picks.overview(accountOf(req), day); }

  @UseGuards(JwtAuthGuard)
  @Post('pick')
  pick(@Body() body: { gameId: number; pick: string }, @Request() req: any) { return this.picks.place(accountOf(req), { gameId: Number(body?.gameId), pick: String(body?.pick ?? '') }); }

  @UseGuards(JwtAuthGuard)
  @Delete('pick/:gameId')
  unpick(@Param('gameId', ParseIntPipe) gameId: number, @Request() req: any) { return this.picks.remove(accountOf(req), gameId); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.picks.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.picks.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/games/:id/settle')
  settle(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Request() req: any) { return this.picks.adminSettle({ userId: req.user.userId, username: req.user.username }, id, body, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/games/:id/void')
  void(@Param('id', ParseIntPipe) id: number, @Request() req: any) { return this.picks.adminVoid({ userId: req.user.userId, username: req.user.username }, id, req.ip); }
}
