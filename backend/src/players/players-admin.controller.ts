import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Request, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { isPlatform, PlayersService } from './players.service';

/** Admin > Lecteurs : publication des installateurs (envoi par morceaux), liste et retrait. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/players')
export class PlayersAdminController {
  constructor(private players: PlayersService, private audit: AuditService) {}

  @Get()
  overview() { return this.players.overview(); }

  @Post(':platform/start')
  start(@Param('platform') platform: string) {
    if (!isPlatform(platform)) throw new BadRequestException('Système inconnu.');
    return this.players.startUpload(platform);
  }

  /** Corps brut (application/octet-stream) : un morceau du fichier. */
  @Post('chunk')
  chunk(@Query('upload') upload: string, @Query('index') index: string, @Req() req: any) {
    return this.players.appendChunk(String(upload ?? ''), Number(index), req);
  }

  @Post('finish')
  async finish(@Body() body: { upload: string; version: string; notes?: string }, @Request() req: any) {
    const release = await this.players.finish(String(body?.upload ?? ''), body?.version, body?.notes);
    await this.audit.log(req.user.userId, 'PLAYER_PUBLISH', { file: release.file, version: release.version, size: release.size });
    return release;
  }

  @Delete(':platform')
  async remove(@Param('platform') platform: string, @Request() req: any) {
    if (!isPlatform(platform)) throw new BadRequestException('Système inconnu.');
    await this.players.remove(platform);
    await this.audit.log(req.user.userId, 'PLAYER_REMOVE', { platform });
    return { ok: true };
  }
}
