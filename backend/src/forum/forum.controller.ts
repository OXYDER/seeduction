import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ForumService } from './forum.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('forum')
export class ForumController {
  constructor(private forumService: ForumService) {}

  @Get('categories')
  categories() {
    return this.forumService.listCategories();
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
