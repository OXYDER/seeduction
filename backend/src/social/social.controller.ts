import { Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('social')
export class SocialController {
  constructor(private social: SocialService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('likes/:torrentId')
  likeStatus(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.social.likeStatus(torrentId, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('likes/:torrentId')
  like(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.social.like(torrentId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('likes/:torrentId')
  unlike(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.social.unlike(torrentId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('follows')
  myFollows(@Request() req: any) {
    return this.social.myFollows(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('follows/:entityId')
  isFollowing(@Param('entityId') entityId: string, @Request() req: any) {
    return this.social.isFollowing(entityId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('follows/:entityId')
  follow(@Param('entityId') entityId: string, @Request() req: any) {
    return this.social.follow(entityId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('follows/:entityId')
  unfollow(@Param('entityId') entityId: string, @Request() req: any) {
    return this.social.unfollow(entityId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('reseed/:torrentId')
  reseed(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.social.requestReseed(torrentId, req.user.userId);
  }
}
