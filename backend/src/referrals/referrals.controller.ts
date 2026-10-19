import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertMaster } from '../common/utils/account';
import { AuthService } from '../auth/auth.service';
import { ReferralsService } from './referrals.service';

@Controller()
export class ReferralsController {
  constructor(private referrals: ReferralsService, private auth: AuthService) {}

  /** Mes invitations, mes invités et la prime de parrainage. */
  @UseGuards(JwtAuthGuard)
  @Get('referrals')
  overview(@Request() req: any) { assertMaster(req); return this.referrals.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('referrals/invite')
  async invite(@Request() req: any) {
    assertMaster(req);
    const code = await this.auth.createInvite(accountOf(req));
    return { id: code.id, code: code.code, expiresAt: code.expiresAt };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('referrals/invite/:id')
  revoke(@Param('id') id: string, @Request() req: any) { assertMaster(req); return this.referrals.revoke(accountOf(req), id); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin/referral')
  config() { return this.referrals.config(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/referral')
  saveConfig(@Body() body: any, @Request() req: any) { return this.referrals.saveConfig(accountOf(req), body ?? {}, req.ip ?? null); }

  /** Verse tout de suite les primes dues (sinon : chaque nuit). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/referral/run')
  async run() { return { paid: await this.referrals.rewardQualified() }; }
}
