import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { assertMaster, accountOf } from '../common/utils/account';
import { LockdownService } from './lockdown.service';

const ipOf = (req: any): string | null => {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 2) || 2);
  const parts = String(req.headers?.['x-forwarded-for'] ?? '').split(',').map((p: string) => p.trim()).filter(Boolean);
  return parts.length ? (parts[Math.max(0, parts.length - hops)] ?? null) : (req.ip ?? null);
};

/** « Alerte générale » : seules `status` et `unlock` répondent quand le site est verrouillé (voir le filtre dans main.ts). */
@Controller('lockdown')
export class LockdownController {
  constructor(private lockdown: LockdownService) {}

  @Get('status')
  status() {
    return this.lockdown.status();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('preflight')
  preflight(@Request() req: any) {
    assertMaster(req);
    return this.lockdown.preflight(accountOf(req));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('start')
  start(@Body() body: { accountPassword?: string; totpToken?: string; lockPassword?: string; confirmText?: string }, @Request() req: any) {
    assertMaster(req);
    return this.lockdown.start(accountOf(req), body ?? {}, ipOf(req));
  }

  @Post('unlock')
  unlock(@Body('password') password: string, @Request() req: any) {
    return this.lockdown.unlock(password, ipOf(req));
  }
}
