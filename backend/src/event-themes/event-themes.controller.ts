import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Actor, EventThemesService } from './event-themes.service';
import { EventId } from '../common/utils/event-themes';

const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username });

/** Thèmes d'événements : le thème en cours est public ; les réglages sont réservés aux administrateurs. */
@Controller('event-themes')
export class EventThemesController {
  constructor(private themes: EventThemesService) {}

  @Get('active')
  active() { return this.themes.active(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.themes.admin(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  save(@Body() body: any, @Request() req: any) { return this.themes.save(actorOf(req), body ?? {}, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/force')
  force(@Body() body: { id?: EventId | null; hours?: number | null }, @Request() req: any) {
    return this.themes.force(actorOf(req), body?.id ?? null, body?.hours ? Number(body.hours) : null, req.ip);
  }
}
