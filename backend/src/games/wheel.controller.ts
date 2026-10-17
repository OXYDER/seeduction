import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { WheelService } from './wheel.service';

/** Roue de la fortune : un tour gratuit par jour. Rien n'est misé, donc aucune permission « dépenser » n'est demandée aux profils d'un compte famille. */
@Controller('games/wheel')
export class WheelController {
  constructor(private wheel: WheelService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.wheel.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('spin')
  spin(@Request() req: any) { return this.wheel.spin(accountOf(req)); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.wheel.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.wheel.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }
}
