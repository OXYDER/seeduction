import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffSecurityService } from './staff-security.service';

@Controller()
export class StaffSecurityController {
  constructor(private security: StaffSecurityService) {}

  /** Pour le bandeau « la 2FA est obligatoire pour l'équipe » : volontairement SANS RolesGuard, la personne bloquée doit pouvoir le lire. */
  @UseGuards(JwtAuthGuard)
  @Get('auth/staff-2fa')
  mine(@Request() req: any) { return this.security.mine(req.user.accountId ?? req.user.userId, req.user.role); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin/staff-security')
  status() { return this.security.status(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/staff-security')
  set(@Body('required') required: boolean, @Request() req: any) { return this.security.setRequired(req.user.accountId ?? req.user.userId, required === true, req.ip ?? null); }
}
