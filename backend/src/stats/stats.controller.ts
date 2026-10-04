import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StatsService } from './stats.service';
import { StatsBoardsService } from './stats-boards.service';
import { DeadService } from './dead.service';

@Controller('stats')
export class StatsController {
  constructor(private statsService: StatsService, private boards: StatsBoardsService, private dead: DeadService) {}

  @Get('global')
  global() {
    return this.statsService.globalStats();
  }

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  overview(@Query('days') days: string | undefined, @Request() req: any) {
    return this.statsService.overview(req.user.userId, Number(days) || 30);
  }

  /** Classements des membres (ratio, hit & run, assiduité, commentaires...) et répartitions. */
  @UseGuards(JwtAuthGuard)
  @Get('members')
  members() {
    return this.boards.members();
  }

  /** Classements des torrents (moins téléchargés, plus petits, plus difficiles à obtenir...) et santé du réseau. */
  @UseGuards(JwtAuthGuard)
  @Get('torrents')
  torrents(@Request() req: any) {
    return this.boards.torrents(req.user.userId);
  }

  /** Où se situe le membre dans les classements. */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return this.boards.me(req.user.accountId ?? req.user.userId);
  }

  /** Page « Réanimation » : torrents sans seeder, récompenses, héros. */
  @UseGuards(JwtAuthGuard)
  @Get('dead')
  deadList(@Query() q: any, @Request() req: any) {
    return this.dead.list({ userId: req.user.userId, accountId: req.user.accountId ?? req.user.userId }, { sort: q.sort, q: q.q, category: q.category, mine: q.mine === '1' || q.mine === 'true', page: Number(q.page) || 1 });
  }

  /** Torrents sans seeder que le membre a déjà téléchargés (pastille du menu). */
  @UseGuards(JwtAuthGuard)
  @Get('dead/mine-count')
  async deadMine(@Request() req: any) {
    return { count: await this.dead.mineCount(req.user.accountId ?? req.user.userId, req.user.userId) };
  }

  @Get('top-torrents')
  top(@Query('limit') limit = '10') {
    return this.statsService.topTorrents(parseInt(limit, 10));
  }
}
