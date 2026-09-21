import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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

  @Get('detail')
  detail(@Query('kind') kind: string, @Query('id') id: string) {
    return this.metadataService.detail(kind, id);
  }
}
