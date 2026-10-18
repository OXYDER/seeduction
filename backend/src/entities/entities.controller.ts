import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesController {
  constructor(private entitiesService: EntitiesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  search(@Query('query') query?: string, @Query('type') type?: string) {
    return this.entitiesService.search(query, type);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  get(@Param('id') id: string, @Request() req: any) {
    return this.entitiesService.get(id, req.user?.userId);
  }
}
