import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { LiveService } from './live.service';

/** Page « Direct » des membres : la diffusion en cours (avec l'adresse du relais) et les prochaines. */
@UseGuards(JwtAuthGuard)
@Controller('live')
export class LiveController {
  constructor(private live: LiveService) {}

  @Get()
  now() { return this.live.forMembers(); }
}

/** Admin > Direct : relais, flux et calendrier. Réservé à l'administration (les adresses des flux peuvent contenir des jetons). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/live')
export class LiveAdminController {
  constructor(private live: LiveService, private audit: AuditService) {}

  @Get()
  overview() { return this.live.overview(); }

  @Put('config')
  async saveConfig(@Body() body: any, @Request() req: any) {
    const cfg = await this.live.saveConfig(body);
    await this.audit.log(req.user.userId, 'LIVE_CONFIG', { enabled: cfg.enabled, controlUrl: cfg.controlUrl, onDemand: cfg.onDemand, timezone: cfg.timezone });
    return this.live.publicConfig(cfg);
  }

  @Post('test')
  test() { return this.live.testRelay(); }

  /** Renvoie tout de suite l'état voulu au relais (sinon c'est fait toutes les 20 secondes). */
  @Post('sync')
  async sync() { await this.live.sync(true); return this.live.overview(); }

  @Post('streams')
  async createStream(@Body() body: any, @Request() req: any) {
    const row = await this.live.createStream(body);
    await this.audit.log(req.user.userId, 'LIVE_STREAM_SAVE', { id: row.id, name: row.name });
    return row;
  }

  @Put('streams/:id')
  async updateStream(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const row = await this.live.updateStream(id, body);
    await this.audit.log(req.user.userId, 'LIVE_STREAM_SAVE', { id, name: row.name });
    return row;
  }

  @Delete('streams/:id')
  async deleteStream(@Param('id') id: string, @Request() req: any) {
    await this.live.deleteStream(id);
    await this.audit.log(req.user.userId, 'LIVE_STREAM_DELETE', { id });
    return { ok: true };
  }

  @Post('slots')
  async createSlot(@Body() body: any, @Request() req: any) {
    const row = await this.live.createSlot(body);
    await this.audit.log(req.user.userId, 'LIVE_SLOT_SAVE', { id: row.id, streamId: row.streamId, startsAt: row.startsAt, repeat: row.repeat });
    return row;
  }

  @Put('slots/:id')
  async updateSlot(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const row = await this.live.updateSlot(id, body);
    await this.audit.log(req.user.userId, 'LIVE_SLOT_SAVE', { id, streamId: row.streamId, startsAt: row.startsAt, repeat: row.repeat });
    return row;
  }

  @Delete('slots/:id')
  async deleteSlot(@Param('id') id: string, @Request() req: any) {
    await this.live.deleteSlot(id);
    await this.audit.log(req.user.userId, 'LIVE_SLOT_DELETE', { id });
    return { ok: true };
  }
}
