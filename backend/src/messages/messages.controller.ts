import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get('inbox')
  inbox(@Request() req: any) {
    return this.messagesService.inbox(req.user.userId);
  }

  @Get('sent')
  sent(@Request() req: any) {
    return this.messagesService.sent(req.user.userId);
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.messagesService.unreadCount(req.user.userId);
  }

  @Post('send')
  send(@Body() body: { recipientUsername: string; subject: string; content: string }, @Request() req: any) {
    return this.messagesService.send(req.user.userId, req.user.username, body.recipientUsername, body.subject, body.content);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.messagesService.markRead(id, req.user.userId);
  }
}
