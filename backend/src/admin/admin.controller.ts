import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AdminService, Actor } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'ADMIN', 'OWNER')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService, private audit: AuditService) {}

  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @Get('torrents/pending')
  pending() {
    return this.adminService.pendingTorrents();
  }

  /** Compteurs de la file de modération (torrents en attente + signalements ouverts). */
  @Get('queue')
  queue() {
    return this.adminService.queueCounts();
  }

  /** Torrents en attente de validation, avec pochette, envoyeur, extrait de description... */
  @Get('queue/torrents')
  queueTorrents() {
    return this.adminService.pendingQueue();
  }

  /** Approuve plusieurs torrents d'un coup (50 au plus). */
  @Post('torrents/approve-many')
  async approveMany(@Body('ids') ids: string[], @Request() req: any) {
    const list = Array.isArray(ids) ? [...new Set(ids.filter((i) => typeof i === 'string'))].slice(0, 50) : [];
    let approved = 0;
    for (const id of list) {
      try {
        const result = await this.adminService.approveTorrent(id);
        await this.audit.log(req.user.userId, 'TORRENT_APPROVE', { torrentId: id, name: result.name }, this.ip(req));
        approved++;
      } catch { /* torrent supprimé entre-temps : on continue avec les autres */ }
    }
    return { approved };
  }

  @Get('torrents')
  allTorrents(@Query('search') search?: string) {
    return this.adminService.allTorrents(search);
  }

  @Patch('torrents/:id')
  async updateTorrent(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const result = await this.adminService.updateTorrent(id, body);
    await this.audit.log(req.user.userId, 'TORRENT_EDIT', { torrentId: id, name: result.name, fields: Object.keys(body ?? {}) }, this.ip(req));
    return result;
  }

  @Delete('torrents/:id')
  async deleteTorrent(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.deleteTorrent(id);
    await this.audit.log(req.user.userId, 'TORRENT_DELETE', { torrentId: id, name: result.name }, this.ip(req));
    return result;
  }

  @Post('torrents/:id/approve')
  async approve(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.approveTorrent(id);
    await this.audit.log(req.user.userId, 'TORRENT_APPROVE', { torrentId: id, name: result.name }, this.ip(req));
    return result;
  }

  @Post('torrents/:id/reject')
  async reject(@Param('id') id: string, @Body('reason') reason: string | undefined, @Request() req: any) {
    const result = await this.adminService.rejectTorrent(id, reason);
    await this.audit.log(req.user.userId, 'TORRENT_REJECT', { torrentId: id, name: result.name, ...(reason ? { reason: String(reason).slice(0, 300) } : {}) }, this.ip(req));
    return result;
  }

  /** Journal d'audit : réservé aux administrateurs. */
  @Roles('ADMIN', 'OWNER')
  @Get('audit')
  auditLog(@Query('page') page?: string, @Query('action') action?: string, @Query('userId') userId?: string) {
    return this.audit.list({ page: parseInt(page ?? '1', 10), action: action || undefined, userId: userId || undefined });
  }

  private actor(req: any): Actor {
    return { userId: req.user.userId, username: req.user.username, role: req.user.role };
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.adminService.userDetail(id);
  }

  private ip(req: any): string | null {
    return (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const before = await this.adminService.userDetail(id);
    const result = await this.adminService.updateUser(this.actor(req), id, body ?? {});
    const changes: Record<string, any> = {};
    if (result.role !== before.role) changes.role = { from: before.role, to: result.role };
    if (result.username !== before.username) changes.username = { from: before.username, to: result.username };
    if (String(result.uploaded) !== String(before.uploaded)) changes.uploaded = { from: String(before.uploaded), to: String(result.uploaded) };
    if (String(result.downloaded) !== String(before.downloaded)) changes.downloaded = { from: String(before.downloaded), to: String(result.downloaded) };
    if (result.bonusPoints !== before.bonusPoints) changes.bonusPoints = { from: before.bonusPoints, to: result.bonusPoints };
    await this.audit.log(req.user.userId, 'USER_EDIT', { targetId: id, target: before.username, changes }, this.ip(req));
    return result;
  }

  @Post('users/:id/reset-link')
  async resetLink(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.issueResetLink(this.actor(req), id);
    await this.audit.log(req.user.userId, 'RESET_LINK_ISSUED', { targetId: id }, this.ip(req));
    return result;
  }

  @Post('users/:id/warn')
  async warn(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const result = await this.adminService.warnUser(this.actor(req), id, reason);
    await this.audit.log(req.user.userId, 'USER_WARN', { targetId: id, reason }, this.ip(req));
    return result;
  }

  @Post('users/:id/ban')
  async ban(@Param('id') id: string, @Body() body: { reason: string; expiresAt?: string }, @Request() req: any) {
    const result = await this.adminService.banUser(this.actor(req), id, body.reason, body.expiresAt ? new Date(body.expiresAt) : undefined);
    await this.audit.log(req.user.userId, 'USER_BAN', { targetId: id, reason: body.reason, expiresAt: body.expiresAt ?? null }, this.ip(req));
    return result;
  }

  @Post('users/:id/unban')
  async unban(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.unbanUser(this.actor(req), id);
    await this.audit.log(req.user.userId, 'USER_UNBAN', { targetId: id }, this.ip(req));
    return result;
  }

  @Get('reports')
  reports(@Query('status') status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN', @Query('targetType') targetType?: string, @Query('targetId') targetId?: string) {
    return this.adminService.listReports(status, { type: targetType, id: targetId });
  }

  @Post('reports/:id/resolve')
  resolve(@Param('id') id: string, @Body('status') status: 'RESOLVED' | 'DISMISSED') {
    return this.adminService.resolveReport(id, status);
  }
}
