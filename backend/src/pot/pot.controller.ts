import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { accountOf, assertPerm } from '../common/utils/account';
import { PotService } from './pot.service';

/** Pot commun : tout le monde le voit et y donne ; les réglages et le lancement sont réservés aux administrateurs. */
@Controller('pot')
export class PotController {
  constructor(private pot: PotService, private audit: AuditService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  state(@Request() req: any) {
    return this.pot.state(accountOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('donate')
  donate(@Body('amount') amount: number, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.pot.donate(accountOf(req), amount);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('config')
  async config() {
    return { config: await this.pot.config(), state: await this.pot.state() };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('config')
  async setConfig(@Body() body: any, @Request() req: any) {
    const config = await this.pot.setConfig(body);
    await this.pot.refresh();
    await this.audit.log(req.user.userId, 'POT_CONFIG', { enabled: config.enabled, goal: config.goal, rewardHours: config.rewardHours });
    return { config, state: await this.pot.state() };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('trigger')
  async trigger(@Request() req: any) {
    const result = await this.pot.trigger();
    await this.audit.log(req.user.userId, 'POT_TRIGGER', {});
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('topup')
  async topUp(@Body('amount') amount: number, @Request() req: any) {
    const result = await this.pot.topUp(req.user.userId, amount);
    await this.audit.log(req.user.userId, 'POT_TOPUP', { amount });
    return result;
  }
}
