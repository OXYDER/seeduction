import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AdminService, Actor } from './admin.service';
import { AdminInvitesService, InviteInput } from './admin-invites.service';
import { SiteConfigService } from './site-config.service';
import { AuditService } from '../audit/audit.service';
import { MemberActivityService } from '../member-activity/member-activity.service';
import { MetadataService } from '../metadata/metadata.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService, private invites: AdminInvitesService, private siteConfig: SiteConfigService, private audit: AuditService, private memberActivity: MemberActivityService, private metadata: MetadataService) {}

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

  /** Change la fiche (TMDB, Deezer, livres, jeux) d'un torrent déjà sur le site : l'ancienne est remplacée, l'affiche aussi si demandé. */
  @Post('torrents/:id/metadata')
  async replaceMetadata(@Param('id') id: string, @Body() body: { kind?: string; id?: string; replaceCover?: boolean }, @Request() req: any) {
    const result = await this.metadata.replaceFiche(id, String(body?.kind ?? ''), String(body?.id ?? ''), body?.replaceCover !== false);
    await this.audit.log(req.user.userId, 'TORRENT_EDIT', { torrentId: id, fields: ['metadata'], kind: body?.kind, ficheId: body?.id }, this.ip(req));
    return result;
  }

  /** Retire la fiche d'un torrent (mauvaise fiche). */
  @Delete('torrents/:id/metadata')
  async clearMetadata(@Param('id') id: string, @Request() req: any) {
    const result = await this.metadata.clearFiche(id);
    await this.audit.log(req.user.userId, 'TORRENT_EDIT', { torrentId: id, fields: ['metadata'], cleared: true }, this.ip(req));
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

  /** Journal de toutes les actions d'un membre (et de ses profils) : visible par l'équipe Seeduction uniquement. */
  @Get('users/:id/activity')
  memberLog(@Param('id') id: string, @Query('page') page?: string, @Query('category') category?: string) {
    return this.memberActivity.list(id, { page: parseInt(page ?? '1', 10), category: category || undefined });
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

  @Roles('ADMIN', 'OWNER')
  @Post('users/:id/delete')
  async deleteMember(@Param('id') id: string, @Body() body: { password?: string; totpToken?: string; confirmUsername?: string }, @Request() req: any) {
    const before = await this.adminService.userDetail(id);
    const result = await this.adminService.deleteMember(this.actor(req), id, body ?? {}, this.ip(req));
    await this.audit.log(req.user.userId, 'USER_DELETE', { targetId: id, target: before.username, email: before.email, reassigned: result.reassigned, erased: result.erased }, this.ip(req));
    return result;
  }

  @Roles('ADMIN', 'OWNER')
  @Post('users/:id/activate')
  async activateMember(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.activateMember(this.actor(req), id);
    await this.audit.log(req.user.userId, 'USER_ACTIVATE', { targetId: id }, this.ip(req));
    return result;
  }

  @Post('users/:id/unban')
  async unban(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.unbanUser(this.actor(req), id);
    await this.audit.log(req.user.userId, 'USER_UNBAN', { targetId: id }, this.ip(req));
    return result;
  }

  // ---- codes d'invitation génériques (administrateurs seulement)

  @Roles('ADMIN', 'OWNER')
  @Get('invites')
  listInvites(@Query('members') members?: string) {
    return this.invites.list(members === '1');
  }

  @Roles('ADMIN', 'OWNER')
  @Post('invites')
  async createInvites(@Body() body: InviteInput, @Request() req: any) {
    const result = await this.invites.create(req.user.userId, body ?? {});
    await this.audit.log(req.user.userId, 'INVITE_CREATE', { codes: result.codes.length, maxUses: body?.maxUses, perIpOnce: !!body?.perIpOnce, expiresAt: body?.expiresAt ?? null }, this.ip(req));
    return result;
  }

  @Roles('ADMIN', 'OWNER')
  @Patch('invites/:id')
  async updateInvite(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const result = await this.invites.update(id, body ?? {});
    await this.audit.log(req.user.userId, 'INVITE_EDIT', { inviteId: id, fields: Object.keys(body ?? {}) }, this.ip(req));
    return result;
  }

  @Roles('ADMIN', 'OWNER')
  @Delete('invites/:id')
  async deleteInvite(@Param('id') id: string, @Request() req: any) {
    const result = await this.invites.remove(id);
    await this.audit.log(req.user.userId, 'INVITE_DELETE', { code: result.code }, this.ip(req));
    return { ok: true };
  }

  @Roles('ADMIN', 'OWNER')
  @Get('invites/:id/uses')
  inviteUses(@Param('id') id: string) {
    return this.invites.uses(id);
  }

  // ---- paramètres du tracker (administrateurs seulement)

  @Roles('ADMIN', 'OWNER')
  @Get('config')
  config() {
    return this.siteConfig.list();
  }

  @Roles('ADMIN', 'OWNER')
  @Patch('config')
  async updateConfig(@Body() body: Record<string, unknown>, @Request() req: any) {
    const result = await this.siteConfig.update(body ?? {});
    await this.audit.log(req.user.userId, 'CONFIG_EDIT', { keys: Object.keys(body ?? {}) }, this.ip(req));
    return result;
  }

  @Roles('ADMIN', 'OWNER')
  @Post('config/reset')
  async resetConfig(@Body('keys') keys: string[] | undefined, @Request() req: any) {
    const result = await this.siteConfig.reset(Array.isArray(keys) ? keys : undefined);
    await this.audit.log(req.user.userId, 'CONFIG_RESET', { keys: keys ?? 'all' }, this.ip(req));
    return result;
  }

  @Roles('ADMIN', 'OWNER')
  @Post('config/apply-min-ratio')
  async applyMinRatio(@Request() req: any) {
    const result = await this.siteConfig.applyMinRatioToAll();
    await this.audit.log(req.user.userId, 'CONFIG_MIN_RATIO_ALL', result, this.ip(req));
    return result;
  }

  // ---- modification des membres (administrateurs et super modérateurs, vérifié dans le service)

  @Post('users/:id/clear-hnr')
  async clearHnr(@Param('id') id: string, @Body('snatchId') snatchId: string | undefined, @Request() req: any) {
    const result = await this.adminService.clearHitAndRun(this.actor(req), id, snatchId);
    await this.audit.log(req.user.userId, 'USER_CLEAR_HNR', { targetId: id, ...result, snatchId: snatchId ?? null }, this.ip(req));
    return result;
  }

  @Delete('users/:id/warnings/:wid')
  async deleteWarning(@Param('id') id: string, @Param('wid') wid: string, @Request() req: any) {
    const result = await this.adminService.deleteWarning(this.actor(req), id, wid);
    await this.audit.log(req.user.userId, 'USER_WARNING_DELETE', { targetId: id, warningId: wid }, this.ip(req));
    return result;
  }

  @Post('users/:id/passkey')
  async regenPasskey(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.regeneratePasskey(this.actor(req), id);
    await this.audit.log(req.user.userId, 'USER_PASSKEY_RESET', { targetId: id }, this.ip(req));
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
