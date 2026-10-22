import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Request, Req, UseGuards } from '@nestjs/common';
import { PublishKeyJwtAuthGuard } from './publish-key.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { isPlatform, PlayersService } from './players.service';

/** Admin > Lecteurs : publication des installateurs (envoi par morceaux), liste et retrait. */
@UseGuards(PublishKeyJwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/players')
export class PlayersAdminController {
  constructor(private players: PlayersService, private audit: AuditService) {}

  @Get()
  overview() { return this.players.overview(); }

  /** Gestion de la clé de publication : réservée à une vraie session d'administration (jamais à la clé elle-même). */
  @UseGuards(JwtAuthGuard)
  @Post('key')
  async createKey(@Request() req: any) {
    if (req.user.viaPublishKey) throw new ForbiddenException('Réservé à une session d\'administration.');
    const r = await this.players.createKey();
    await this.audit.log(req.user.userId, 'PLAYER_KEY', { action: 'create' });
    return r;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('key')
  async revokeKey(@Request() req: any) {
    if (req.user.viaPublishKey) throw new ForbiddenException('Réservé à une session d\'administration.');
    await this.players.revokeKey();
    await this.audit.log(req.user.userId, 'PLAYER_KEY', { action: 'revoke' });
    return { ok: true };
  }

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
