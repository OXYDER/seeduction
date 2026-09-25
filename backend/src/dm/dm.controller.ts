import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DmService } from './dm.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private dmService: DmService) {}

  @Get('conversations')
  conversations(@Request() req: any) {
    return this.dmService.conversations(req.user.userId);
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.dmService.unreadCount(req.user.userId);
  }

  @Get('thread/:friendId')
  history(@Param('friendId') friendId: string, @Request() req: any) {
    return this.dmService.history(req.user.userId, friendId);
  }

  /** Filet de sécurité si le socket n'est pas connecté (le direct passe normalement par la websocket /dm). */
  @Post('thread/:friendId')
  send(@Param('friendId') friendId: string, @Body('content') content: string, @Request() req: any) {
    return this.dmService.send(req.user.userId, req.user.username, friendId, content);
  }
}
