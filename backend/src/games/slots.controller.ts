import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertPerm } from '../common/utils/account';
import { SlotsService } from './slots.service';

/** Machines à sous. Les points appartiennent au compte : un profil du compte famille joue avec le compte, et les mises demandent la permission « dépenser ». */
@Controller('games/slots')
export class SlotsController {
  constructor(private slots: SlotsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.slots.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('spin')
  spin(@Body() body: { machine: string; stake?: number; daily?: boolean }, @Request() req: any) {
    if (body?.daily !== true) assertPerm(req, 'spend');
    return this.slots.spin(accountOf(req), body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.slots.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.slots.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
