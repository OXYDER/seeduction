import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { WikiService, isWikiStaff } from './wiki.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('wiki')
export class WikiController {
  constructor(private wikiService: WikiService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  tree(@Request() req: any) {
    return this.wikiService.tree(isWikiStaff(req.user?.role));
  }

  @UseGuards(JwtAuthGuard)
  @Get('faq')
  faq(@Request() req: any) {
    return this.wikiService.faq(isWikiStaff(req.user?.role));
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('q') q: string, @Request() req: any) {
    return this.wikiService.search(q, isWikiStaff(req.user?.role));
  }

  @UseGuards(JwtAuthGuard)
  @Get('articles/:slug')
  findOne(@Param('slug') slug: string, @Request() req: any) {
    return this.wikiService.findBySlug(slug, isWikiStaff(req.user?.role));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories')
  createCategory(@Body() body: { name: string; icon?: string; order?: number }) {
    return this.wikiService.createCategory(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: { name?: string; icon?: string; order?: number }) {
    return this.wikiService.updateCategory(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.wikiService.deleteCategory(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('articles')
  createArticle(@Body() body: { categoryId: string; title: string; content: string; keywords?: string; isFaq?: boolean; order?: number }) {
    return this.wikiService.createArticle(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Patch('articles/:id')
  updateArticle(@Param('id') id: string, @Body() body: { categoryId?: string; title?: string; content?: string; keywords?: string; isFaq?: boolean; order?: number }) {
    return this.wikiService.updateArticle(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string) {
    return this.wikiService.deleteArticle(id);
  }
}
