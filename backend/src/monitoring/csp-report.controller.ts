import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CspReportService } from './csp-report.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/** Réception des rapports de la politique de sécurité du navigateur (envoyés par le navigateur lui-même, sans connexion) et consultation par les administrateurs. */
@Controller('security')
export class CspReportController {
  constructor(private reports: CspReportService) {}

  @Post('csp-report')
  @HttpCode(204)
  receive(@Body() body: any) { this.reports.record(body); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('csp-report')
  list() { return { items: this.reports.list() }; }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Delete('csp-report')
  clear() { this.reports.clear(); return { ok: true }; }
}
