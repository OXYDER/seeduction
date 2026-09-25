import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Get()
  list(@Request() req: any) {
    return this.friendsService.list(req.user.userId);
  }

  @Post('request')
  request(@Body('username') username: string, @Request() req: any) {
    return this.friendsService.request(req.user.userId, req.user.username, username);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @Request() req: any) {
    return this.friendsService.accept(id, req.user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.friendsService.remove(id, req.user.userId);
  }
}
