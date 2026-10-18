import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { DonationsService } from './donations.service';
import { DonationWebhooksService } from './donation-webhooks.service';

const actorOf = (req: any) => ({ userId: req.user.userId, username: req.user.username });

@UseGuards(JwtAuthGuard)
@Controller('donations')
export class DonationsController {
  constructor(private donations: DonationsService, private hooks: DonationWebhooksService) {}

  private siteUrl(req: any) { return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, ''); }

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

  // ---- dons automatiques (Ko-fi, Buy Me a Coffee)

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin/webhooks')
  webhooks(@Request() req: any) { return this.hooks.config(this.siteUrl(req)); }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/webhooks')
  saveWebhooks(@Body() body: any, @Request() req: any) { return this.hooks.saveConfig(actorOf(req), body ?? {}, this.siteUrl(req), req.ip); }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin/events')
  async events() { return { items: await this.hooks.events() }; }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/events/:id/assign')
  assign(@Param('id') id: string, @Body() body: { username?: string; amount?: number }, @Request() req: any) { return this.hooks.assign(actorOf(req), id, String(body?.username ?? ''), Number(body?.amount) || undefined, req.ip); }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/events/:id/ignore')
  ignore(@Param('id') id: string, @Request() req: any) { return this.hooks.ignore(actorOf(req), id, req.ip); }
}
