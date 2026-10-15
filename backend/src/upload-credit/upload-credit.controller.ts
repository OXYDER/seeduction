import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { UploadCreditService } from './upload-credit.service';

@Controller('upload-credit')
export class UploadCreditController {
  constructor(private credit: UploadCreditService) {}

  /** Le crédit d'envoi reçu par ce compte et les règles en vigueur. */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  mine(@Request() req: any) { return this.credit.mine(accountOf(req)); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.credit.config(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  save(@Body() body: any, @Request() req: any) { return this.credit.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip); }
}
