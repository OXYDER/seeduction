import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertPerm } from '../common/utils/account';
import { DiceService } from './dice.service';

/** Dés. Les points appartiennent au compte : les mises demandent la permission « dépenser » pour un profil du compte famille. */
@Controller('games/dice')
export class DiceController {
  constructor(private dice: DiceService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.dice.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('roll')
  roll(@Body() body: { kind?: string; n?: number; stake?: number; daily?: boolean }, @Request() req: any) {
    if (body?.daily !== true) assertPerm(req, 'spend');
    return this.dice.roll(accountOf(req), body ?? {});
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.dice.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.dice.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
