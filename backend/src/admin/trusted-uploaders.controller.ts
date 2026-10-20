import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { TrustedUploadersService } from './trusted-uploaders.service';

/** Admin > Uploadeurs : réglages de la promotion automatique, liste des Uploadeurs et des membres proches du rang. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/trusted-uploaders')
export class TrustedUploadersController {
  constructor(private trusted: TrustedUploadersService, private audit: AuditService) {}

  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Get()
  overview() { return this.trusted.overview(); }

  @Roles('ADMIN', 'OWNER')
  @Put('config')
  async saveConfig(@Body() body: any, @Request() req: any) {
    const cfg = await this.trusted.saveConfig(body);
    await this.audit.log(req.user.userId, 'UPLOADER_CONFIG', { config: cfg });
    return cfg;
  }

  /** Lance l'évaluation tout de suite (elle tourne aussi chaque nuit). */
  @Roles('ADMIN', 'OWNER')
  @Post('run')
  run() { return this.trusted.run(); }
}
