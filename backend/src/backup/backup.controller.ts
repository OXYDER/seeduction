import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthService } from '../auth/auth.service';
import { Actor, BackupService } from './backup.service';
import { writePlan } from './zip-writer';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username });

/** Sauvegardes : réservées aux administrateurs et au propriétaire (le téléchargement d'un paquet passe par un lien signé de 2 minutes). */
@Controller('backup')
export class BackupController {
  constructor(private backup: BackupService, private auth: AuthService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('status')
  status() { return this.backup.status(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('config')
  saveConfig(@Body() body: any, @Request() req: any) { return this.backup.saveConfig(actorOf(req), body ?? {}, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('run')
  run(@Request() req: any) { return this.backup.start('manual', actorOf(req), req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('restore-test')
  restoreTest(@Request() req: any) { return this.backup.restoreTest(actorOf(req), req.ip); }

  /** Affiche la phrase de récupération : demande le mot de passe (et le code 2FA) de l'administrateur, comme les autres actions sensibles. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('passphrase/reveal')
  async reveal(@Body() body: { password?: string; totpToken?: string }, @Request() req: any) {
    await this.auth.assertStaffReauth(req.user.userId, String(body?.password ?? ''), body?.totpToken, req.ip);
    return this.backup.revealPassphrase(actorOf(req), req.ip);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('passphrase/confirm')
  confirm(@Request() req: any) { return this.backup.confirmPassphrase(actorOf(req), req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('files/:name/link')
  link(@Param('name') name: string, @Body('format') format: string, @Request() req: any) { return this.backup.downloadLink(actorOf(req), name, format === 'raw' ? 'raw' : 'zip', req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('files/:name/delete')
  remove(@Param('name') name: string, @Request() req: any) { return this.backup.remove(actorOf(req), name, req.ip); }

  /** Téléchargement direct d'un paquet : le lien signé (2 minutes) tient lieu d'authentification, pour que le navigateur puisse diffuser un gros fichier. */
  @Get('download/:name')
  async download(@Param('name') name: string, @Query('e') e: string, @Query('s') s: string, @Query('f') f: string, @Res() res: Response) {
    const file = this.backup.resolveDownload(name, e, s, f);
    if (f === 'zip') {
      const { plan, filename } = await this.backup.zipPlan(name);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(plan.totalSize));
      await writePlan(plan, res);
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    fs.createReadStream(file).pipe(res);
  }

  private assertLocal(req: any) {
    const local = LOOPBACK.has(String(req.socket?.remoteAddress ?? '')) && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'];
    if (!local) throw new ForbiddenException('Réservé aux scripts du serveur');
  }

  /** Appelé par backup.sh depuis le conteneur lui-même : sauvegarde complète tout de suite, attendue jusqu'au bout. */
  @Post('local-run')
  async localRun(@Request() req: any) {
    this.assertLocal(req);
    return this.backup.runAndWait();
  }

  /**
   * Appelé par deploy.sh depuis le conteneur lui-même, juste avant une mise à jour : instantané de la base (accepté seulement depuis la machine locale,
   * jamais à travers le proxy du site).
   */
  @Post('predeploy')
  async predeploy(@Request() req: any) {
    this.assertLocal(req);
    return this.backup.runPredeploy();
  }
}
