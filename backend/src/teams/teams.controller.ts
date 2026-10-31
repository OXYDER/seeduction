import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TeamsService, Viewer } from './teams.service';

const viewerOf = (req: any): Viewer => ({ accountId: req.user.accountId ?? req.user.userId, role: req.user.role });

@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private teams: TeamsService) {}

  @Get()
  list(@Query() q: { q?: string; filter?: string; page?: string }, @Request() req: any) { return this.teams.list(viewerOf(req), { q: q.q, filter: q.filter, page: q.page ? Number(q.page) : 1 }); }

  /** Résout le nom d'une team (clé normalisée) en identifiant : lien depuis le nom d'une release. */
  @Get('slug/:slug')
  bySlug(@Param('slug') slug: string) { return this.teams.idBySlug(slug); }

  @Post()
  create(@Body() body: any, @Request() req: any) { return this.teams.create(viewerOf(req), body ?? {}); }

  @Post('applications/:appId/accept')
  accept(@Param('appId') appId: string, @Request() req: any) { return this.teams.decide(appId, viewerOf(req), true); }

  @Post('applications/:appId/decline')
  decline(@Param('appId') appId: string, @Request() req: any) { return this.teams.decide(appId, viewerOf(req), false); }

  /** Annonces de team visibles par tous les membres du site (avant la route « :id »). */
  @Get('posts/public')
  publicPosts() { return this.teams.publicPosts(); }

  @Get(':id')
  get(@Param('id') id: string, @Request() req: any) { return this.teams.get(id, viewerOf(req)); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.teams.update(id, viewerOf(req), body ?? {}); }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) { return this.teams.remove(id, viewerOf(req)); }

  @Post(':id/apply')
  apply(@Param('id') id: string, @Body() body: { message: string; proof?: string }, @Request() req: any) { return this.teams.apply(id, viewerOf(req), body?.message, body?.proof); }

  @Delete(':id/apply')
  withdraw(@Param('id') id: string, @Request() req: any) { return this.teams.withdraw(id, viewerOf(req)); }

  @Post(':id/leave')
  leave(@Param('id') id: string, @Request() req: any) { return this.teams.leave(id, viewerOf(req)); }

  @Patch(':id/members/:userId')
  setRole(@Param('id') id: string, @Param('userId') userId: string, @Body('role') role: string, @Request() req: any) { return this.teams.setRole(id, viewerOf(req), userId, role); }

  @Patch(':id/members/:userId/anonymous')
  setMemberAnonymous(@Param('id') id: string, @Param('userId') userId: string, @Body('anonymous') anonymous: boolean, @Request() req: any) { return this.teams.setMemberAnonymous(id, viewerOf(req), userId, anonymous); }

  @Get(':id/posts')
  posts(@Param('id') id: string, @Request() req: any) { return this.teams.listPosts(id, viewerOf(req)); }

  @Post(':id/posts')
  createPost(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.teams.createPost(id, viewerOf(req), body ?? {}); }

  @Patch(':id/posts/:postId')
  updatePost(@Param('id') id: string, @Param('postId') postId: string, @Body() body: any, @Request() req: any) { return this.teams.updatePost(id, postId, viewerOf(req), body ?? {}); }

  @Delete(':id/posts/:postId')
  deletePost(@Param('id') id: string, @Param('postId') postId: string, @Request() req: any) { return this.teams.deletePost(id, postId, viewerOf(req)); }

  @Post(':id/follow')
  follow(@Param('id') id: string, @Request() req: any) { return this.teams.setFollow(id, viewerOf(req), true); }

  @Delete(':id/follow')
  unfollow(@Param('id') id: string, @Request() req: any) { return this.teams.setFollow(id, viewerOf(req), false); }

  @Get(':id/history')
  history(@Param('id') id: string, @Request() req: any) { return this.teams.history(id, viewerOf(req)); }

  @Post(':id/chat')
  chat(@Param('id') id: string, @Request() req: any) { return this.teams.chat(id, viewerOf(req)); }

  @Get(':id/dashboard')
  dashboard(@Param('id') id: string, @Request() req: any) { return this.teams.dashboard(id, viewerOf(req)); }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Request() req: any) { return this.teams.removeMember(id, viewerOf(req), userId); }
}
