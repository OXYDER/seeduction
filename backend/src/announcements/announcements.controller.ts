import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private announcementsService: AnnouncementsService) {}

  @Get()
  list(@Query('limit') limit = '5') {
    return this.announcementsService.list(parseInt(limit, 10));
  }

  @Get('feed')
  feed(@Query('page') page = '1', @Query('pageSize') pageSize = '10') {
    return this.announcementsService.feed(parseInt(page, 10), Math.min(30, parseInt(pageSize, 10) || 10));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.announcementsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { title?: string; content?: string; pinned?: boolean; summary?: string | null; imageUrl?: string | null }) {
    return this.announcementsService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post()
  create(@Body() body: { title: string; content: string; pinned?: boolean; summary?: string | null; imageUrl?: string | null }, @Request() req: any) {
    return this.announcementsService.create(req.user.userId, body.title, body.content, body.pinned, { summary: body.summary, imageUrl: body.imageUrl });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.announcementsService.delete(id);
  }
}
