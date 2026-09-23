import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ForumService } from './forum.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

const viewerOf = (req: any) => (req.user ? { userId: req.user.userId, role: req.user.role } : undefined);

@Controller('forum')
export class ForumController {
  constructor(private forumService: ForumService) {}

  // ---------------------------------------------------------------- lecture

  @UseGuards(OptionalJwtAuthGuard)
  @Get('index')
  index(@Request() req: any) {
    return this.forumService.index(viewerOf(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('latest')
  latest(@Request() req: any) {
    return this.forumService.latest(viewerOf(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('search')
  search(@Query('q') q: string, @Request() req: any) {
    return this.forumService.search(q, viewerOf(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('forums/:id')
  forum(@Param('id') id: string, @Query('page') page: string, @Request() req: any) {
    return this.forumService.forumView(id, parseInt(page ?? '1', 10), viewerOf(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('topics/:id')
  topic(@Param('id') id: string, @Query('page') page: string, @Request() req: any) {
    return this.forumService.getTopic(id, parseInt(page ?? '1', 10), viewerOf(req));
  }

  // ---------------------------------------------------------------- écriture (membres)

  @UseGuards(JwtAuthGuard)
  @Post('categories/:id/topics')
  createTopic(@Param('id') id: string, @Body() body: { title: string; content: string }, @Request() req: any) {
    return this.forumService.createTopic(id, req.user.userId, req.user.role, body.title, body.content);
  }

  @UseGuards(JwtAuthGuard)
  @Post('topics/:id/reply')
  reply(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.forumService.reply(id, req.user.userId, req.user.role, content);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('posts/:id')
  editPost(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.forumService.editPost(id, viewerOf(req)!, content);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('posts/:id')
  deletePost(@Param('id') id: string, @Request() req: any) {
    return this.forumService.deletePost(id, viewerOf(req)!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mark-read')
  markAllRead(@Request() req: any) {
    return this.forumService.markAllRead(req.user.userId);
  }

  // ---------------------------------------------------------------- modération et administration

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('topics/:id/moderate')
  moderate(@Param('id') id: string, @Body() body: { action: string; forumId?: string }) {
    return this.forumService.moderateTopic(id, body.action, body.forumId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('topics/:id')
  deleteTopic(@Param('id') id: string) {
    return this.forumService.deleteTopic(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Get('movable-forums')
  movable() {
    return this.forumService.movableForums();
  }

  @Get('categories')
  categories() {
    return this.forumService.listCategories();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories')
  createCategory(@Body() body: { name: string; parentId?: string; isCategory?: boolean; description?: string; icon?: string; staffOnly?: boolean; locked?: boolean }) {
    return this.forumService.createCategory(body.name, body.parentId, !!body.isCategory, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() body: { name?: string; parentId?: string | null; isCategory?: boolean; description?: string | null; icon?: string | null; staffOnly?: boolean; locked?: boolean },
  ) {
    return this.forumService.updateCategory(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories/:id/move')
  move(@Param('id') id: string, @Body('direction') direction: 'up' | 'down') {
    return this.forumService.move(id, direction === 'up' ? 'up' : 'down');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.forumService.deleteCategory(id);
  }
}
