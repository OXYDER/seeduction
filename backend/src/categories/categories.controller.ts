import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Request() req: any, @Query('includeAdult') includeAdult?: string) {
    return this.categoriesService.list(req.user, includeAdult === '1');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('reset-to-recommended')
  resetToRecommended() {
    return this.categoriesService.resetToRecommended();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('simplify-legacy')
  simplifyLegacy() {
    return this.categoriesService.simplifyLegacy();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('install-recommended')
  installRecommended() {
    return this.categoriesService.installRecommended();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post()
  create(@Body() body: { name: string; parentId?: string; contentKind?: string | null; imageUrl?: string | null; adult?: boolean }) {
    return this.categoriesService.create(body.name, body.parentId, body.contentKind, body.imageUrl, body.adult);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; parentId?: string | null; contentKind?: string | null; imageUrl?: string | null; adult?: boolean }) {
    return this.categoriesService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.categoriesService.delete(id);
  }
}
