import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService, private chatGateway: ChatGateway) {}

  @Get('messages')
  list(@Query('limit') limit?: string) {
    return this.chatService.list(limit ? Number(limit) : undefined);
  }

  @UseGuards(RolesGuard)
  @Roles('MODERATOR', 'ADMIN', 'OWNER')
  @Delete('messages/:id')
  async remove(@Param('id') id: string) {
    await this.chatService.delete(id);
    this.chatGateway.broadcastDelete(id);
    return { ok: true };
  }
}
