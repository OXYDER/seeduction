import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('metadata')
export class MetadataController {
  constructor(private metadataService: MetadataService) {}

  @Get('kinds')
  supportedKinds() {
    return this.metadataService.supportedKinds;
  }

  @Get('search')
  search(@Query('kind') kind: string, @Query('query') query: string, @Query('year') year?: string) {
    return this.metadataService.search(kind, query, year);
  }

  @Get('tv/:id/season/:n')
  seasonEpisodes(@Param('id') id: string, @Param('n') n: string) {
    return this.metadataService.seasonEpisodes(id, Number(n));
  }

  /** Fiches de plusieurs films (pack), triées par date de sortie. */
  @Post('detail-many')
  detailMany(@Body() body: { kind?: string; ids?: string[] }) {
    return this.metadataService.detailMany(String(body?.kind ?? ''), Array.isArray(body?.ids) ? body.ids : []);
  }

  /** Les films de la saga d'un film (collection TMDB). */
  @Get('saga')
  saga(@Query('id') id: string) {
    return this.metadataService.saga(id);
  }

  @Get('detail')
  detail(@Query('kind') kind: string, @Query('id') id: string) {
    return this.metadataService.detail(kind, id);
  }
}
