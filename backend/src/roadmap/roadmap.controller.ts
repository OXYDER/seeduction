import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RoadmapService } from './roadmap.service';

@Controller('roadmap')
export class RoadmapController {
  constructor(private roadmap: RoadmapService) {}

  /** Numéro de version et date de la dernière mise à jour (affichés en bas du menu, même avant la connexion). */
  @Get('version')
  version() {
    return this.roadmap.version();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  feed(@Query('limit') limit?: string, @Query('before') before?: string) {
    return this.roadmap.feed(limit ? Number(limit) : undefined, before);
  }

  /** Liste « À venir » du roadmap, rédigée à la main par les administrateurs. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('upcoming')
  upcoming(@Body('items') items: string[]) {
    return this.roadmap.setUpcoming(items);
  }
}
