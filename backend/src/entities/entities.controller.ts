import { Controller, Get, Param, Query } from '@nestjs/common';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesController {
  constructor(private entitiesService: EntitiesService) {}

  @Get()
  search(@Query('query') query?: string, @Query('type') type?: string) {
    return this.entitiesService.search(query, type);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.entitiesService.get(id);
  }
}
