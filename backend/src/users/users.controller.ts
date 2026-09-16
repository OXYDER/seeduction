import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return this.usersService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/ratio-history')
  ratioHistory(@Request() req: any, @Query('days') days = '30') {
    return this.usersService.getRatioHistory(req.user.userId, parseInt(days, 10));
  }

  @Get('leaderboard')
  leaderboard(@Query('limit') limit = '50') {
    return this.usersService.leaderboard(parseInt(limit, 10));
  }

  @Get(':id')
  profile(@Param('id') id: string) {
    return this.usersService.getProfile(id);
  }
}
