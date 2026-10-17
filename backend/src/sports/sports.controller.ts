import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  async canadiens() {
    const d = await this.sports.canadiens();
    return d && (d as any).enabled ? { ...d, goalSound: await this.sports.goalSoundUrl() } : d;
  }

  /** Le son de but choisi par l'administration (public : joué par le navigateur des membres). */
  @Get('goal-sound')
  async goalSound(@Res() res: any) {
    const s = await this.sports.readGoalSound();
    if (!s) throw new NotFoundException();
    res.set({ 'Content-Type': s.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).send(s.data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/sound')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 900 * 1024 } }))
  uploadSound(@UploadedFile() file: any, @Request() req: any) { return this.sports.saveGoalSound(actorOf(req), file, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Delete('admin/sound')
  removeSound(@Request() req: any) { return this.sports.removeGoalSound(actorOf(req), req.ip); }

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
  async admin() {
    const s = await this.sports.goalSound();
    return { ...(await this.sports.config()), goalSound: s ? { name: s.name, url: await this.sports.goalSoundUrl() } : null };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  save(@Body() body: any, @Request() req: any) { return this.sports.saveConfig(actorOf(req), body, req.ip); }
}
