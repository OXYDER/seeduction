import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ForumService } from './forum.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('forum')
export class ForumController {
  constructor(private forumService: ForumService) {}

  @Get('categories')
  categories() {
    return this.forumService.listCategories();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories')
  createCategory(@Body() body: { name: string; parentId?: string }) {
    return this.forumService.createCategory(body.name, body.parentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: { name?: string; parentId?: string | null }) {
    return this.forumService.updateCategory(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.forumService.deleteCategory(id);
  }

  @Get('categories/:id/topics')
  topics(@Param('id') id: string) {
    return this.forumService.listTopics(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('categories/:id/topics')
  createTopic(@Param('id') id: string, @Body() body: { title: string; content: string }, @Request() req: any) {
    return this.forumService.createTopic(id, req.user.userId, body.title, body.content);
  }

  @Get('topics/:id')
  topic(@Param('id') id: string) {
    return this.forumService.getTopic(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('topics/:id/reply')
  reply(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.forumService.reply(id, req.user.userId, content);
  }
}
