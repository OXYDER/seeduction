import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { WikiService } from './wiki.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('wiki')
export class WikiController {
  constructor(private wikiService: WikiService) {}

  @Get()
  tree() {
    return this.wikiService.tree();
  }

  @Get('faq')
  faq() {
    return this.wikiService.faq();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.wikiService.search(q);
  }

  @Get('articles/:slug')
  findOne(@Param('slug') slug: string) {
    return this.wikiService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories')
  createCategory(@Body() body: { name: string; icon?: string; order?: number }) {
    return this.wikiService.createCategory(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: { name?: string; icon?: string; order?: number }) {
    return this.wikiService.updateCategory(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.wikiService.deleteCategory(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('articles')
  createArticle(@Body() body: { categoryId: string; title: string; content: string; keywords?: string; isFaq?: boolean; order?: number }) {
    return this.wikiService.createArticle(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Patch('articles/:id')
  updateArticle(@Param('id') id: string, @Body() body: { categoryId?: string; title?: string; content?: string; keywords?: string; isFaq?: boolean; order?: number }) {
    return this.wikiService.updateArticle(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string) {
    return this.wikiService.deleteArticle(id);
  }
}
