import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertPerm } from '../common/utils/account';
import { HiLoService } from './hilo.service';

/** « Plus haut ou plus bas ». Les points appartiennent au compte : les mises demandent la permission « dépenser » pour un profil du compte famille. */
@Controller('games/hilo')
export class HiLoController {
  constructor(private hilo: HiLoService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.hilo.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('start')
  start(@Body() body: { stake?: number; daily?: boolean }, @Request() req: any) {
    if (body?.daily !== true) assertPerm(req, 'spend');
    return this.hilo.start(accountOf(req), body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Post('guess')
  guess(@Body() body: { gameId: string; guess: string }, @Request() req: any) { return this.hilo.guess(accountOf(req), String(body?.gameId ?? ''), String(body?.guess ?? '')); }

  @UseGuards(JwtAuthGuard)
  @Post('cashout')
  cashOut(@Body() body: { gameId: string }, @Request() req: any) { return this.hilo.cashOut(accountOf(req), String(body?.gameId ?? '')); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.hilo.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.hilo.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
