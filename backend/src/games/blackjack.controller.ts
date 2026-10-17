import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertPerm } from '../common/utils/account';
import { BlackjackService } from './blackjack.service';

/** Blackjack. Les points appartiennent au compte : les mises demandent la permission « dépenser » pour un profil du compte famille. */
@Controller('games/blackjack')
export class BlackjackController {
  constructor(private bj: BlackjackService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.bj.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('start')
  start(@Body() body: { stake?: number; daily?: boolean }, @Request() req: any) {
    if (body?.daily !== true) assertPerm(req, 'spend');
    return this.bj.start(accountOf(req), body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Post('action')
  action(@Body() body: { gameId: string; action: string }, @Request() req: any) {
    if (body?.action === 'double' || body?.action === 'split') assertPerm(req, 'spend');
    return this.bj.action(accountOf(req), String(body?.gameId ?? ''), String(body?.action ?? ''));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.bj.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.bj.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
