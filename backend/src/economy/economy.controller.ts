import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
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
    const state = await this.settings.freeleechState();
    return { until: state.until, event: state.event, upcoming: state.upcoming };
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
  async setFreeleech(@Body() body: { hours?: number | null; until?: string | null }, @Request() req: any) {
    const result = await this.economy.setGlobalFreeleech({ hours: body?.hours === undefined || body?.hours === null ? null : Number(body.hours), until: body?.until ?? null });
    await this.audit.log(req.user.userId, 'FREELEECH_GLOBAL', { hours: body?.hours ?? null, until: body?.until ?? null });
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Get('events')
  events() {
    return this.economy.listEvents();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('events')
  async createEvent(@Body() body: { title: string; message?: string; startsAt: string; endsAt: string; announce?: boolean }, @Request() req: any) {
    const event = await this.economy.createEvent(req.user.userId, body);
    await this.audit.log(req.user.userId, 'FREELEECH_EVENT_CREATE', { title: event.title, startsAt: event.startsAt, endsAt: event.endsAt });
    return event;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Patch('events/:id')
  async updateEvent(@Param('id') id: string, @Body() body: { title?: string; message?: string | null; startsAt?: string; endsAt?: string }, @Request() req: any) {
    const event = await this.economy.updateEvent(id, body);
    await this.audit.log(req.user.userId, 'FREELEECH_EVENT_EDIT', { title: event.title });
    return event;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('events/:id')
  async deleteEvent(@Param('id') id: string, @Request() req: any) {
    const event = await this.economy.deleteEvent(id);
    await this.audit.log(req.user.userId, 'FREELEECH_EVENT_DELETE', { title: event.title });
    return event;
  }
}
