import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { DuelsService } from './duels.service';

/** Duels entre membres sur des activités gratuites : rien n'est misé, donc aucune permission « dépenser » n'est demandée aux profils d'un compte famille. */
@Controller('games/duels')
export class DuelsController {
  constructor(private duels: DuelsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.duels.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.duels.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.duels.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: { opponent?: string; kind?: string; days?: number }, @Request() req: any) { return this.duels.create(accountOf(req), body); }

  @UseGuards(JwtAuthGuard)
  @Post(':id/accept')
  accept(@Param('id') id: string, @Request() req: any) { return this.duels.respond(accountOf(req), id, true); }

  @UseGuards(JwtAuthGuard)
  @Post(':id/decline')
  decline(@Param('id') id: string, @Request() req: any) { return this.duels.respond(accountOf(req), id, false); }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: any) { return this.duels.cancel(accountOf(req), id); }
}
