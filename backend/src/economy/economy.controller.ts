import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';

@Controller('bonus')
export class EconomyController {
  constructor(private economy: EconomyService, private settings: SettingsService, private audit: AuditService) {}

  /** Public : sert à afficher le bandeau « freeleech global » à tout le monde. */
  @Get('freeleech')
  async freeleech() {
    return { until: await this.settings.freeleechUntil() };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  overview(@Request() req: any) {
    return this.economy.overview(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('redeem')
  redeem(@Body('item') item: string, @Request() req: any) {
    return this.economy.redeem(req.user.userId, item);
  }

  @UseGuards(JwtAuthGuard)
  @Get('token/:torrentId')
  tokenStatus(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.economy.tokenStatus(req.user.userId, torrentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('token/:torrentId')
  useToken(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.economy.useToken(req.user.userId, torrentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('freeleech')
  async setFreeleech(@Body('hours') hours: number | null, @Request() req: any) {
    const result = await this.economy.setGlobalFreeleech(hours === null || hours === undefined ? null : Number(hours));
    await this.audit.log(req.user.userId, 'FREELEECH_GLOBAL', { hours });
    return result;
  }
}
