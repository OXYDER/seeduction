import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { NewsImageService } from './news-image.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { assertPerm } from '../common/utils/account';

interface NewsBody { title?: string; content?: string; pinned?: boolean; summary?: string | null; imageUrl?: string | null; kind?: string; commentsLocked?: boolean }

@Controller('announcements')
export class AnnouncementsController {
  constructor(private announcementsService: AnnouncementsService, private newsImage: NewsImageService) {}

  @Get()
  list(@Query('limit') limit = '5') {
    return this.announcementsService.list(parseInt(limit, 10));
  }

  /** Les plus récentes, pour l'accueil. */
  @Get('latest')
  latest(@Query('limit') limit = '3') {
    return this.announcementsService.latest(parseInt(limit, 10));
  }

  @Get('feed')
  feed(@Query('page') page = '1', @Query('pageSize') pageSize = '10', @Query('kind') kind?: string, @Query('q') q?: string) {
    return this.announcementsService.feed(parseInt(page, 10), Math.min(30, parseInt(pageSize, 10) || 10), { kind, q });
  }

  /** Génération d'image par IA (Gemini) : état de la configuration. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Get('image-ai')
  imageStatus() {
    return this.newsImage.status();
  }

  /** Propositions de bannière pour une nouvelle : le logo de Seeduction est joint à chaque génération. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('generate-image')
  generateImage(@Body() body: { title?: string; summary?: string; content?: string; kind?: string; hint?: string; count?: number }, @Request() req: any) {
    return this.newsImage.generate(req.user.userId, { title: String(body?.title ?? ''), summary: body?.summary, content: body?.content, kind: body?.kind, hint: body?.hint }, Number(body?.count) || 2);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('comments/:cid')
  editComment(@Param('cid') cid: string, @Body('content') content: string, @Request() req: any) {
    return this.announcementsService.editComment(cid, req.user, content);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:cid')
  removeComment(@Param('cid') cid: string, @Request() req: any) {
    return this.announcementsService.removeComment(cid, req.user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.announcementsService.findOne(id, req.user?.userId);
  }

  @Get(':id/comments')
  comments(@Param('id') id: string, @Query('page') page = '1') {
    return this.announcementsService.comments(id, parseInt(page, 10));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    assertPerm(req, 'write');
    return this.announcementsService.addComment(id, req.user, content);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/reaction')
  react(@Param('id') id: string, @Body('emoji') emoji: string, @Request() req: any) {
    return this.announcementsService.react(id, req.user.userId, emoji);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/reaction')
  unreact(@Param('id') id: string, @Request() req: any) {
    return this.announcementsService.unreact(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: NewsBody) {
    return this.announcementsService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post()
  create(@Body() body: NewsBody & { title: string; content: string }, @Request() req: any) {
    return this.announcementsService.create(req.user.userId, body.title, body.content, body.pinned, { summary: body.summary, imageUrl: body.imageUrl, kind: body.kind, commentsLocked: body.commentsLocked });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.announcementsService.delete(id);
  }
}
