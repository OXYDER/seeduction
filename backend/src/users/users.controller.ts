import { Body, Controller, Get, Param, Patch, Query, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return this.usersService.getProfile(req.user.userId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateProfile(@Body() body: { avatarUrl?: string | null; signature?: string | null }, @Request() req: any) {
    return this.usersService.updateProfile(req.user.userId, body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/presence')
  setPresence(@Body() body: { status: string; statusText?: string | null }, @Request() req: any) {
    return this.usersService.setPresenceStatus(req.user.userId, body.status, body.statusText);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/dm-privacy')
  setDmPrivacy(@Body('value') value: string, @Request() req: any) {
    return this.usersService.setDmPrivacy(req.user.userId, value);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/adult')
  setAdult(@Body() body: { enabled: boolean; confirmAge?: boolean }, @Request() req: any) {
    return this.usersService.setAdultPreference(req.user.userId, !!body?.enabled, !!body?.confirmAge);
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

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  profile(@Param('id') id: string, @Request() req: any) {
    return this.usersService.getProfile(id, req.user);
  }
}
