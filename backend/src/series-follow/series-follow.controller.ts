import { Controller, Delete, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf } from '../common/utils/account';
import { SeriesFollowService } from './series-follow.service';

/** Séries suivies (« prévenez-moi quand le prochain épisode sort ») : suivre depuis la fiche d'un torrent, liste avec compte à rebours. */
@UseGuards(JwtAuthGuard)
@Controller('series-follow')
export class SeriesFollowController {
  constructor(private series: SeriesFollowService) {}

  @Get()
  list(@Request() req: any) { return this.series.list(accountOf(req)); }

  @Get('status')
  status(@Query('torrentId') torrentId: string, @Request() req: any) { return this.series.statusFor(accountOf(req), String(torrentId ?? '')); }

  @Post('torrent/:torrentId')
  follow(@Param('torrentId') torrentId: string, @Request() req: any) { return this.series.follow(accountOf(req), torrentId); }

  @Delete(':id')
  unfollow(@Param('id') id: string, @Request() req: any) { return this.series.unfollow(accountOf(req), id); }
}
