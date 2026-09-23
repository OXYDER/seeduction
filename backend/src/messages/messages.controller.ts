import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
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

  @Get('threads')
  threads(@Request() req: any) {
    return this.messagesService.threads(req.user.userId);
  }

  @Get('thread/:threadId')
  thread(@Param('threadId') threadId: string, @Request() req: any) {
    return this.messagesService.thread(threadId, req.user.userId);
  }

  @Post('thread/:threadId/reply')
  reply(@Param('threadId') threadId: string, @Body('content') content: string, @Request() req: any) {
    return this.messagesService.reply(threadId, req.user.userId, req.user.username, content);
  }

  @Delete('thread/:threadId')
  deleteThread(@Param('threadId') threadId: string, @Request() req: any) {
    return this.messagesService.deleteThread(threadId, req.user.userId);
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
