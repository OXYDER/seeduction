import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertMaster, assertPerm } from '../common/utils/account';
import { MojService, Actor } from './moj.service';

const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username });

/** Mise-O-jeu : paris et pronostics sur les matchs du Canadien. Les points appartiennent au compte : un profil du compte famille joue avec le compte (les mises demandent la permission « dépenser »). */
@Controller('games/moj')
export class GamesController {
  constructor(private moj: MojService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.moj.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('bet')
  bet(@Body() body: { matchId: string; market: string; pick: string; stake?: number }, @Request() req: any) {
    if (Number(body?.stake) > 0) assertPerm(req, 'spend');
    return this.moj.place(accountOf(req), body);
  }

  @UseGuards(JwtAuthGuard)
  @Put('opt-out')
  optOut(@Body('value') value: boolean, @Request() req: any) {
    assertMaster(req);
    return this.moj.setOptOut(accountOf(req), value === true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.moj.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async saveConfig(@Body() body: any, @Request() req: any) { return { config: await this.moj.saveConfig(actorOf(req), body, req.ip) }; }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/:id/refund')
  refund(@Param('id') id: string, @Request() req: any) { return this.moj.adminRefund(actorOf(req), id, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/:id/settle')
  settle(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.moj.adminSettle(actorOf(req), id, body, req.ip); }
}
