import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Post()
  create(@Body() body: { title: string; content: string; pinned?: boolean }, @Request() req: any) {
    return this.announcementsService.create(req.user.userId, body.title, body.content, body.pinned);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.announcementsService.delete(id);
  }
}
