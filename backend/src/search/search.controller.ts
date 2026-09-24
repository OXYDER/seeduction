import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { SearchService, SUGGEST_SCOPES } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  /** GET /search/suggest?q=dune&scopes=torrents,users,categories */
  @Get('suggest')
  suggest(@Query('q') q: string, @Query('scopes') scopes: string, @Request() req: any) {
    const requested = String(scopes ?? '').split(',').map((s) => s.trim()).filter((s): s is (typeof SUGGEST_SCOPES)[number] => (SUGGEST_SCOPES as readonly string[]).includes(s));
    return this.search.suggest(String(q ?? ''), requested.length ? requested : ['torrents', 'users', 'categories'], req.user.role, req.user.userId);
  }
}
