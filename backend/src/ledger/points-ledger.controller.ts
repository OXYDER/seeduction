import { Body, Controller, Get, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PointsLedgerService } from './points-ledger.service';

/** Économie des points : réservée à l'administration. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('admin/economy')
export class PointsLedgerController {
  constructor(private ledger: PointsLedgerService) {}

  @Get()
  overview(@Query('days') days?: string) { return this.ledger.overview(Number(days) || 14); }

  @Put('config')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.ledger.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
