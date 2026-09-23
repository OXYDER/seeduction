import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get('torrent/:torrentId')
  list(@Param('torrentId') torrentId: string, @Query('page') page?: string) {
    return this.commentsService.list(torrentId, parseInt(page ?? '1', 10));
  }

  @UseGuards(JwtAuthGuard)
  @Post('torrent/:torrentId')
  create(@Param('torrentId') torrentId: string, @Body('content') content: string, @Request() req: any) {
    return this.commentsService.create(torrentId, req.user, content);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  edit(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.commentsService.edit(id, req.user, content);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.commentsService.remove(id, req.user);
  }
}
