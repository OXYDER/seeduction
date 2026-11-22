import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FoundersService } from './founders.service';

/** Membres fondateurs : mur et salon pour les membres ; validation des candidats pour l'administration (Admin > Fondateurs). */
@UseGuards(JwtAuthGuard)
@Controller('founders')
export class FoundersController {
  constructor(private founders: FoundersService) {}

  private who = (req: any): string => req.user.accountId ?? req.user.userId;

  @Get()
  wall(@Request() req: any) { return this.founders.wall(this.who(req)); }

  @Post('rename')
  rename(@Body('username') username: string, @Request() req: any) { return this.founders.rename(this.who(req), username, req.ip); }

  @Get('chat')
  chat(@Request() req: any) { return this.founders.salon(this.who(req)); }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  overview() { return this.founders.overview(); }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/config')
  async config(@Body() body: any, @Request() req: any) { await this.founders.setConfig(req.user.userId, body, req.ip); return this.founders.overview(); }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/grant')
  async grant(@Body('ids') ids: string[], @Request() req: any) {
    const res = await this.founders.grant(req.user.userId, ids, req.ip);
    return { ...res, overview: await this.founders.overview() };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/revoke')
  async revoke(@Body('id') id: string, @Request() req: any) {
    await this.founders.revoke(req.user.userId, id, req.ip);
    return this.founders.overview();
  }
}
