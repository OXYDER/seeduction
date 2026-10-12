import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Actor, AntiCheatService } from './anticheat.service';
import { AntiCheatAnalysisService } from './anticheat-analysis.service';

const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username, role: req.user.role });

/** Anti-triche : tableau de bord et dossiers pour l'équipe ; réglages et analyse manuelle pour les administrateurs. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
@Controller('anticheat')
export class AntiCheatController {
  constructor(private core: AntiCheatService, private analysis: AntiCheatAnalysisService) {}

  @Get('overview')
  overview() { return this.core.overview(); }

  @Get('cases')
  cases(@Query() q: { level?: string; status?: string; search?: string; page?: string }) {
    return this.core.list({ level: q.level, status: q.status, search: q.search, page: Number(q.page) || 1 });
  }

  /** Dossier d'un membre : par identifiant de dossier, de membre, ou pseudo. */
  @Get('cases/:id')
  detail(@Param('id') id: string) { return this.core.detail(id); }

  @Post('cases/:id/status')
  status(@Param('id') id: string, @Body() body: { status: string; note?: string }, @Request() req: any) {
    return this.core.setStatus(actorOf(req), id, body?.status, body?.note, req.ip);
  }

  @Post('cases/:id/notes')
  note(@Param('id') id: string, @Body('body') body: string, @Request() req: any) {
    return this.core.addNote(actorOf(req), id, body);
  }

  @Roles('ADMIN', 'OWNER')
  @Put('config')
  saveConfig(@Body() body: any, @Request() req: any) { return this.core.saveConfig(actorOf(req), body, req.ip); }

  /** Relance tout de suite les analyses croisées (normalement chaque heure). */
  @Roles('ADMIN', 'OWNER')
  @Post('run')
  run() { return this.analysis.runAll(); }
}
