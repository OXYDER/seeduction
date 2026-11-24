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
