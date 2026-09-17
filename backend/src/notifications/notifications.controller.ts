import { Controller, Get, Post, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  list(@Request() req: any, @Query('limit') limit = '30') {
    return this.notificationsService.list(req.user.userId, parseInt(limit, 10));
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.notificationsService.unreadCount(req.user.userId);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markRead(req.user.userId, id);
  }

  @Post('read-all')
  markAllRead(@Request() req: any) {
    return this.notificationsService.markAllRead(req.user.userId);
  }
}
