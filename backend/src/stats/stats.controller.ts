import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Get('global')
  global() {
    return this.statsService.globalStats();
  }

  @Get('top-torrents')
  top(@Query('limit') limit = '10') {
    return this.statsService.topTorrents(parseInt(limit, 10));
  }
}
