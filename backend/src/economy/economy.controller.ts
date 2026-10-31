import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { accountOf, assertPerm } from '../common/utils/account';
import { RanksService } from './ranks.service';
import { CLASS_LABELS } from '../common/utils/economy';

@Controller('bonus')
export class EconomyController {
  constructor(private economy: EconomyService, private settings: SettingsService, private audit: AuditService, private ranks: RanksService) {}

  /** Public : sert à afficher le bandeau « freeleech global » à tout le monde. */
  @UseGuards(JwtAuthGuard)
  @Get('freeleech')
  async freeleech() {
    const state = await this.settings.freeleechState();
    return { until: state.until, event: state.event, upcoming: state.upcoming };
  }

  /** Public : tout le calendrier des freeleech (passés, en cours, à venir) sur une période, pour la page « Calendrier freeleech ». */
  @UseGuards(JwtAuthGuard)
  @Get('freeleech/calendar')
  freeleechCalendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.settings.freeleechCalendar(from, to);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  overview(@Request() req: any) {
    return this.economy.overview(accountOf(req));
  }

  /** Seeds à terminer : torrents téléchargés dont l'obligation de seed n'est pas encore remplie. */
  @UseGuards(JwtAuthGuard)
  @Get('seeds')
  seeds(@Request() req: any) {
    return this.economy.seedObligations(accountOf(req));
  }

  /** Tous les torrents du membre (seeds, téléchargements en cours et terminés, envois) en une seule liste filtrable et triable côté page. */
  /** Où j'en suis vers le rang automatique suivant (ancienneté, upload, ratio) : barre « Niveau suivant » de l'accueil. */
  @UseGuards(JwtAuthGuard)
  @Get('rank')
  async rank(@Request() req: any) {
    const p = await this.ranks.progressOf(accountOf(req));
    return { ...p, currentLabel: CLASS_LABELS[p.current] ?? p.current, nextLabel: p.next ? CLASS_LABELS[p.next] ?? p.next : null };
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-torrents')
  myTorrents(@Request() req: any) {
    return this.economy.myTorrents(accountOf(req));
  }

  /** Page « Mon activité » : seeds, téléchargements en cours, historique des téléchargements terminés et envois du membre. */
  @UseGuards(JwtAuthGuard)
  @Get('activity')
  activity(@Request() req: any) {
    return this.economy.activity(accountOf(req));
  }

  /** Page « Mes seeds » : tout ce que le membre seede ou a téléchargé, avec l'état de l'obligation de partage. */
  @UseGuards(JwtAuthGuard)
  @Get('my-seeds')
  mySeeds(@Request() req: any) {
    return this.economy.mySeeds(accountOf(req));
  }

  /** Page « Hit & run » : les hit & run confirmés et le prix pour les effacer avec des points. */
  @UseGuards(JwtAuthGuard)
  @Get('hnr')
  hitAndRuns(@Request() req: any) {
    return this.economy.hitAndRuns(accountOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('hnr/:snatchId/clear')
  clearHnr(@Param('snatchId') snatchId: string, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.economy.clearHitAndRun(accountOf(req), snatchId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('transfers')
  transfers(@Request() req: any) {
    return this.economy.transfers(accountOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('transfer')
  transfer(@Body() body: { userId?: string; username?: string; amount: number; message?: string }, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.economy.transfer(accountOf(req), { userId: body?.userId, username: body?.username }, body?.amount, body?.message);
  }

  @UseGuards(JwtAuthGuard)
  @Post('redeem')
  redeem(@Body('item') item: string, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.economy.redeem(accountOf(req), item);
  }

  @UseGuards(JwtAuthGuard)
  @Get('token/:torrentId')
  tokenStatus(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.economy.tokenStatus(accountOf(req), torrentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('token/:torrentId')
  useToken(@Param('torrentId') torrentId: string, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.economy.useToken(accountOf(req), torrentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('freeleech')
  async setFreeleech(@Body() body: { hours?: number | null; until?: string | null }, @Request() req: any) {
    const result = await this.economy.setGlobalFreeleech({ hours: body?.hours === undefined || body?.hours === null ? null : Number(body.hours), until: body?.until ?? null });
    await this.audit.log(req.user.userId, 'FREELEECH_GLOBAL', { hours: body?.hours ?? null, until: body?.until ?? null });
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Get('events')
  events() {
    return this.economy.listEvents();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('events')
  async createEvent(@Body() body: { title: string; message?: string; startsAt: string; endsAt: string; announce?: boolean }, @Request() req: any) {
    const event = await this.economy.createEvent(req.user.userId, body);
    await this.audit.log(req.user.userId, 'FREELEECH_EVENT_CREATE', { title: event.title, startsAt: event.startsAt, endsAt: event.endsAt });
    return event;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Patch('events/:id')
  async updateEvent(@Param('id') id: string, @Body() body: { title?: string; message?: string | null; startsAt?: string; endsAt?: string }, @Request() req: any) {
    const event = await this.economy.updateEvent(id, body);
    await this.audit.log(req.user.userId, 'FREELEECH_EVENT_EDIT', { title: event.title });
    return event;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Delete('events/:id')
  async deleteEvent(@Param('id') id: string, @Request() req: any) {
    const event = await this.economy.deleteEvent(id);
    await this.audit.log(req.user.userId, 'FREELEECH_EVENT_DELETE', { title: event.title });
    return event;
  }
}
