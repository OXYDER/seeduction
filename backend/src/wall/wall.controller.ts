import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WallService, WallViewer } from './wall.service';

const viewerOf = (req: any): WallViewer => ({ accountId: req.user.accountId ?? req.user.userId, role: req.user.role });

/** Le Mur (profils et teams) : réservé aux membres connectés. */
@UseGuards(JwtAuthGuard)
@Controller('wall')
export class WallController {
  constructor(private wall: WallService) {}

  @Get('feed')
  feed(@Query('before') before: string | undefined, @Request() req: any) { return this.wall.feed(viewerOf(req), before); }

  @Get('user/:id')
  user(@Param('id') id: string, @Query('before') before: string | undefined, @Request() req: any) { return this.wall.userWall(id, viewerOf(req), before); }

  @Get('team/:id')
  team(@Param('id') id: string, @Query('before') before: string | undefined, @Request() req: any) { return this.wall.teamWall(id, viewerOf(req), before); }

  @Post('posts')
  create(@Body() body: any, @Request() req: any) { return this.wall.create(viewerOf(req), body ?? {}); }

  @Patch('posts/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.wall.update(id, viewerOf(req), body ?? {}); }

  @Delete('posts/:id')
  remove(@Param('id') id: string, @Request() req: any) { return this.wall.remove(id, viewerOf(req)); }

  @Put('posts/:id/react')
  react(@Param('id') id: string, @Body('type') type: string, @Request() req: any) { return this.wall.react(id, viewerOf(req), type); }

  @Delete('posts/:id/react')
  unreact(@Param('id') id: string, @Request() req: any) { return this.wall.react(id, viewerOf(req), null); }

  @Get('posts/:id/comments')
  comments(@Param('id') id: string, @Request() req: any) { return this.wall.comments(id, viewerOf(req)); }

  @Post('posts/:id/comments')
  comment(@Param('id') id: string, @Body('content') content: string, @Request() req: any) { return this.wall.addComment(id, viewerOf(req), content); }

  @Patch('comments/:id')
  editComment(@Param('id') id: string, @Body('content') content: string, @Request() req: any) { return this.wall.editComment(id, viewerOf(req), content); }

  @Delete('comments/:id')
  removeComment(@Param('id') id: string, @Request() req: any) { return this.wall.removeComment(id, viewerOf(req)); }
}
