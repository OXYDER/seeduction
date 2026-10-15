import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Actor, SportsService } from './sports.service';

const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username });

/** Score des Canadiens (données publiques de la LNH, mises en cache : ouvert à tous, même sans connexion). */
@Controller('sports')
export class SportsController {
  constructor(private sports: SportsService) {}

  @Get('canadiens')
  canadiens() { return this.sports.canadiens(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.sports.config(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  save(@Body() body: any, @Request() req: any) { return this.sports.saveConfig(actorOf(req), body, req.ip); }
}
