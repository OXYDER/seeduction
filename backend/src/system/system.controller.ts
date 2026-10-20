import { Body, Controller, ForbiddenException, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { SystemService } from './system.service';
import { PublicStatusService } from './public-status.service';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Controller('system')
export class SystemController {
  constructor(private system: SystemService, private audit: AuditService, private publicStatus: PublicStatusService) {}

  /** Public (même sans connexion) : message de maintenance en cours et version du site. Interrogé toutes les 30 secondes par chaque page ouverte. */
  @Get('status')
  status() {
    return this.system.status();
  }

  /** Public (même sans connexion) : page d'état « le site fonctionne » — services, 90 jours de disponibilité, incidents récents (aucun détail technique). */
  @Get('public-status')
  publicStatusPage() {
    return this.publicStatus.status();
  }

  /**
   * Appelé par deploy.sh depuis le conteneur lui-même (docker compose exec) : accepté seulement s'il vient de la machine locale, jamais à travers le
   * proxy du site (qui ajoute ses en-têtes X-Forwarded-For / X-Real-IP).
   */
  @Post('maintenance')
  deploy(@Body() body: { action?: string; minutes?: number; message?: string }, @Request() req: any) {
    const local = LOOPBACK.has(String(req.socket?.remoteAddress ?? '')) && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'];
    if (!local) throw new ForbiddenException('Réservé au script de déploiement');
    return body?.action === 'end' ? this.system.end() : this.system.start(body?.minutes, body?.message);
  }

  /** Administrateurs : annoncer une maintenance à la main (ou la terminer). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('maintenance/admin')
  async admin(@Body() body: { action?: string; minutes?: number; message?: string }, @Request() req: any) {
    if (body?.action === 'end') {
      await this.audit.log(req.user.userId, 'MAINTENANCE_END', {}, req.ip);
      return this.system.end();
    }
    const notice = await this.system.start(body?.minutes, body?.message);
    await this.audit.log(req.user.userId, 'MAINTENANCE_START', { endsAt: notice.endsAt, message: notice.message }, req.ip);
    return notice;
  }
}
