import { Controller, Get, Query, Request, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { StaffLogService } from './staff-log.service';

/** Journal de modération : qui a fait quoi, sur qui ou sur quoi. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
@Controller('staff/mod-log')
export class StaffLogController {
  constructor(private log: StaffLogService, private audit: AuditService) {}

  @Get()
  list(@Query() q: any, @Request() req: any) { return this.log.list(req.user.role, q); }

  /** Export CSV : réservé aux administrateurs (il contient les adresses IP), et lui-même inscrit au journal. */
  @Roles('ADMIN', 'OWNER')
  @Get('export')
  async export(@Query() q: any, @Request() req: any, @Res() res: any) {
    const csv = await this.log.exportCsv(req.user.role, q);
    await this.audit.log(req.user.accountId ?? req.user.userId, 'MOD_LOG_EXPORT', { filters: Object.keys(q ?? {}).filter((k) => q[k]) }, req.ip ?? null);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="journal-moderation-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(csv);
  }
}
