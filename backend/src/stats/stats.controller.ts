import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Get('global')
  global() {
    return this.statsService.globalStats();
  }

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  overview(@Request() req: any) {
    return this.statsService.overview(req.user.userId);
  }

  @Get('top-torrents')
  top(@Query('limit') limit = '10') {
    return this.statsService.topTorrents(parseInt(limit, 10));
  }
}
