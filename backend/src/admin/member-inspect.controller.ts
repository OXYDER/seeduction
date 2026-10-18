import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { MemberInspectService } from './member-inspect.service';

/** Vue complète du compte d'un membre et réinitialisation obligatoire de son mot de passe : administrateurs seulement. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/users')
export class MemberInspectController {
  constructor(private inspect: MemberInspectService, private admin: AdminService, private audit: AuditService) {}

  private actor(req: any) { return { userId: req.user.userId, username: req.user.username, role: req.user.role }; }

  @Get(':id/inspect')
  overview(@Param('id') id: string, @Request() req: any) { return this.inspect.overview(this.actor(req), id); }

  @Get(':id/inspect/:section')
  list(@Param('id') id: string, @Param('section') section: string, @Query('page') page: string | undefined, @Request() req: any) {
    return this.inspect.list(this.actor(req), id, section, parseInt(page ?? '1', 10), req.ip);
  }

  /** Redemande le mot de passe (et le code 2FA) avant d'afficher le contenu de conversations ; valable 15 minutes. */
  @Post(':id/inspect-unlock')
  unlock(@Param('id') id: string, @Body() body: { password?: string; totpToken?: string }, @Request() req: any) {
    return this.inspect.unlock(this.actor(req), id, body, req.ip);
  }

  /** Réinitialisation obligatoire du mot de passe par courriel (ou `cancel: true` pour lever l'exigence). */
  @Post(':id/force-reset')
  async forceReset(@Param('id') id: string, @Body() body: { cancel?: boolean }, @Request() req: any) {
    const cancel = body?.cancel === true;
    const result = await this.admin.forceReset(this.actor(req), id, cancel, req.ip);
    await this.audit.log(req.user.userId, cancel ? 'PASSWORD_RESET_FORCE_CANCELED' : 'PASSWORD_RESET_FORCED', { targetId: id }, req.ip);
    return result;
  }
}
