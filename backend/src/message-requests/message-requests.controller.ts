import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MessageRequestsService } from './message-requests.service';

/** Demandes de message (voir MessageRequestsService). Le demandeur est le profil actif (un profil famille a ses propres demandes). */
@UseGuards(JwtAuthGuard)
@Controller('message-requests')
export class MessageRequestsController {
  constructor(private requests: MessageRequestsService) {}

  @Get()
  list(@Request() req: any) { return this.requests.list(req.user.userId); }

  @Get('status/:userId')
  status(@Param('userId') userId: string, @Request() req: any) { return this.requests.status(req.user.userId, userId); }

  @Post()
  send(@Body() body: { toId?: string; intro?: string }, @Request() req: any) { return this.requests.send(req.user.userId, String(body?.toId ?? ''), body?.intro); }

  @Post(':id/accept')
  accept(@Param('id') id: string, @Request() req: any) { return this.requests.accept(req.user.userId, id); }

  @Post(':id/decline')
  decline(@Param('id') id: string, @Request() req: any) { return this.requests.decline(req.user.userId, id); }

  @Delete(':id')
  cancel(@Param('id') id: string, @Request() req: any) { return this.requests.cancel(req.user.userId, id); }
}
