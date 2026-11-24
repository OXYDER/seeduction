import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { assertPerm } from '../common/utils/account';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VodService, type VodViewer } from './vod.service';

const viewerOf = (req: any): VodViewer => ({ userId: req.user.userId, accountId: req.user.accountId ?? req.user.userId, username: req.user.username, role: req.user.role, fam: !!req.user.fam });

/** « Seeduction Cinéma » : catalogue vidéo de l'application Android, réservé aux donateurs, fondateurs et uploaders (voir VodService). */
@Controller('vod')
export class VodController {
  constructor(private vod: VodService) {}

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
  title(@Param('id') id: string, @Req() req: any) {
    return this.vod.title(viewerOf(req), id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('play')
  play(@Body() body: { torrentId: string; fileIndex?: number }, @Req() req: any) {
    assertPerm(req, 'download');
    return this.vod.play(viewerOf(req), body?.torrentId, body?.fileIndex);
  }
}
