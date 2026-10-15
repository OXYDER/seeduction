import { Body, Controller, Get, NotFoundException, Param, Put, Request, Res, UseGuards } from '@nestjs/common';
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

  /** Logo d'une équipe (SVG), servi depuis notre serveur et mis en cache par les navigateurs. */
  @Get('logo/:abbrev')
  async logo(@Param('abbrev') abbrev: string, @Res() res: any) {
    const svg = await this.sports.logo(String(abbrev).toUpperCase());
    if (!svg) throw new NotFoundException();
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' }).send(svg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.sports.config(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  save(@Body() body: any, @Request() req: any) { return this.sports.saveConfig(actorOf(req), body, req.ip); }
}
