import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { assertPerm } from '../common/utils/account';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VodLiveService } from './vod-live.service';
import { VodService, type VodViewer } from './vod.service';

/** Octets aléatoires (non compressibles) servis pour mesurer la connexion de l'appareil. */
const SPEEDTEST_BYTES = randomBytes(4 * 1024 * 1024);

const viewerOf = (req: any): VodViewer => ({ userId: req.user.userId, accountId: req.user.accountId ?? req.user.userId, username: req.user.username, role: req.user.role, fam: !!req.user.fam });

/** « Seeduction TV » : catalogue vidéo de l'application Android, réservé aux donateurs, fondateurs et uploaders (voir VodService). */
@Controller('vod')
export class VodController {
  constructor(private vod: VodService, private live: VodLiveService) {}

  /** Pour la page « Lecteur » du site : ce compte a-t-il droit au catalogue, et pourquoi. */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  status(@Req() req: any) {
    return this.vod.status(viewerOf(req).accountId);
  }

  /** Code d'association à saisir (ou lien à ouvrir) dans l'application. */
  @UseGuards(JwtAuthGuard)
  @Post('pair')
  pair(@Req() req: any) {
    assertPerm(req, 'download');
    return this.vod.pair(viewerOf(req));
  }

  /** Appelé par l'application avec le code : pas de session, le code (5 minutes, une seule fois) en tient lieu. */
  @Post('exchange')
  exchange(@Body() body: { code?: string }) {
    return this.vod.exchange(body?.code ?? '');
  }

  /** Session longue de l'application, pour le compte déjà connecté (identifiant + mot de passe passés par /auth/login) : refusée sans droit au catalogue. */
  @UseGuards(JwtAuthGuard)
  @Post('token')
  token(@Req() req: any) {
    assertPerm(req, 'download');
    return this.vod.session(viewerOf(req));
  }

  /** Télé ou box : demande un code à afficher à l'écran (public). */
  @Post('device/start')
  deviceStart() {
    return this.vod.deviceStart();
  }

  /** La télé demande si le code a été saisi sur le site (public : le code secret de l'appareil en tient lieu). */
  @Post('device/poll')
  devicePoll(@Body() body: { deviceCode?: string }) {
    return this.vod.devicePoll(body?.deviceCode ?? '');
  }

  /** Le membre saisit sur le site le code affiché sur sa télé. */
  @UseGuards(JwtAuthGuard)
  @Post('device/approve')
  deviceApprove(@Body() body: { code?: string }, @Req() req: any) {
    assertPerm(req, 'download');
    return this.vod.deviceApprove(viewerOf(req), body?.code ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Get('home')
  home(@Req() req: any) {
    return this.vod.home(viewerOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('q') q: string, @Req() req: any) {
    return this.vod.search(viewerOf(req), q);
  }

  /** Liste paginée : onglets Films / Séries, « Tout voir », genres, A–Z (kind, genre, sort, letter, q, page, size). */
  @UseGuards(JwtAuthGuard)
  @Get('browse')
  browse(@Query() query: Record<string, string>, @Req() req: any) {
    return this.vod.browse(viewerOf(req), query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('genres')
  genres(@Query('kind') kind: string, @Req() req: any) {
    return this.vod.genres(viewerOf(req), kind);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sagas')
  sagas(@Req() req: any) {
    return this.vod.sagas(viewerOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('saga/:id')
  saga(@Param('id') id: string, @Req() req: any) {
    return this.vod.saga(viewerOf(req), id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('title/:id')
  title(@Param('id') id: string, @Query('mbps') mbps: string, @Query('lang') lang: string, @Req() req: any) {
    const speed = Number(mbps);
    return this.vod.title(viewerOf(req), id, { mbps: Number.isFinite(speed) && speed > 0 ? Math.min(speed, 10_000) : null, lang: /^(vff|vfq|vfi|vo)$/i.test(lang ?? '') ? lang.toLowerCase() : null });
  }

  /** Mesure de la connexion : l'appareil télécharge quelques Mo et calcule son débit (sert à recommander la qualité qui démarre vite). */
  @UseGuards(JwtAuthGuard)
  @Get('speedtest')
  speedtest(@Res() res: any) {
    res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Encoding': 'identity', 'Content-Length': String(SPEEDTEST_BYTES.length) });
    res.end(SPEEDTEST_BYTES);
  }

  /** L'épisode suivant (sans en sauter un) ; dit s'il en manque un, et si une demande existe déjà. */
  @UseGuards(JwtAuthGuard)
  @Get('next')
  next(@Query('torrentId') torrentId: string, @Query('fileIndex') fileIndex: string, @Req() req: any) {
    return this.vod.next(viewerOf(req), torrentId, fileIndex);
  }

  /** Demande sur le site d'un épisode manquant. */
  @UseGuards(JwtAuthGuard)
  @Post('request-episode')
  requestEpisode(@Body() body: { torrentId: string; season: number; episode: number }, @Req() req: any) {
    assertPerm(req, 'download');
    return this.vod.requestEpisode(viewerOf(req), body?.torrentId, body?.season, body?.episode);
  }

  @UseGuards(JwtAuthGuard)
  @Get('person/:id')
  person(@Param('id') id: string, @Req() req: any) {
    return this.vod.person(viewerOf(req), id);
  }

  /** Note interne : 1 à 5 étoiles (0 retire la note). */
  @UseGuards(JwtAuthGuard)
  @Post('rate')
  rate(@Body() body: { torrentId: string; score: number }, @Req() req: any) {
    return this.vod.rate(viewerOf(req), body?.torrentId, body?.score);
  }

  @UseGuards(JwtAuthGuard)
  @Get('ratings')
  async ratings(@Req() req: any) {
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return { items: await this.live.myRatings(v.userId) };
  }

  // ------------------------------------------------------------------ appareils, lecture en direct et statistiques (site et application)

  /** L'application se signale toutes les 3 s en lecture (12 s sinon) et reçoit les commandes envoyées depuis le site. */
  @UseGuards(JwtAuthGuard)
  @Post('devices/ping')
  async ping(@Body() body: any, @Req() req: any) {
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return this.live.ping(v.accountId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('devices')
  async devices(@Req() req: any) {
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return { items: await this.live.devices(v.accountId) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('devices/:id/command')
  async command(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    assertPerm(req, 'download');
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return this.live.command(v.accountId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('devices/:id')
  async rename(@Param('id') id: string, @Body() body: { name?: string }, @Req() req: any) {
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return this.live.rename(v.accountId, id, body?.name ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Delete('devices/:id')
  async forget(@Param('id') id: string, @Req() req: any) {
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return this.live.forget(v.accountId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async stats(@Req() req: any) {
    const v = viewerOf(req);
    await this.vod.assertAccess(v.accountId);
    return this.live.stats(v.accountId, v.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('play')
  play(@Body() body: { torrentId: string; fileIndex?: number }, @Req() req: any) {
    assertPerm(req, 'download');
    return this.vod.play(viewerOf(req), body?.torrentId, body?.fileIndex);
  }
}
