import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { DonationsService } from './donations.service';

const actorOf = (req: any) => ({ userId: req.user.userId, username: req.user.username });

@UseGuards(JwtAuthGuard)
@Controller('donations')
export class DonationsController {
  constructor(private donations: DonationsService) {}

  /** Page « Soutenir » : textes, liens, objectif du mois, paliers d'avantages, mur des donateurs, ta situation. */
  @Get('info')
  info(@Request() req: any) {
    return this.donations.info(accountOf(req));
  }

  /** Identifiants des donateurs (pour le ❤️ à côté des pseudos). */
  @Get('donors')
  donors() {
    return this.donations.donors();
  }

  /** Apparaître (ou non) sur le mur des donateurs. */
  @Put('me/wall')
  wall(@Body('show') show: boolean, @Request() req: any) {
    return this.donations.setWall(accountOf(req), show === true);
  }

  // ---- administration (administrateurs et propriétaire) ----

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  adminOverview() {
    return this.donations.adminOverview();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/config')
  async saveConfig(@Body() body: any, @Request() req: any) {
    return this.donations.saveConfig(actorOf(req), body, req.ip);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/record')
  record(@Body() body: { userId?: string; username?: string; amount: number; note?: string; receivedAt?: string }, @Request() req: any) {
    return this.donations.record(actorOf(req), body ?? ({} as any), req.ip);
  }
}
