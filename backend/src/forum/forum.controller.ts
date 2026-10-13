import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { assertPerm } from '../common/utils/account';
import { ForumService } from './forum.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';

const viewerOf = (req: any) => (req.user ? { userId: req.user.userId, role: req.user.role } : undefined);

@Controller('forum')
export class ForumController {
  constructor(private forumService: ForumService, private audit: AuditService) {}

  // ---------------------------------------------------------------- lecture

  @UseGuards(OptionalJwtAuthGuard)
  @Get('index')
  index(@Request() req: any) {
    return this.forumService.index(viewerOf(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('latest')
  latest(@Query('unread') unread: string, @Request() req: any) {
    return this.forumService.latest(viewerOf(req), unread === '1');
  }

  /** Nombre de sujets non lus (pastille du menu). */
  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.forumService.unreadTotal(viewerOf(req)!);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('search')
  search(@Query('q') q: string, @Request() req: any) {
    return this.forumService.search(q, viewerOf(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('forums/:id')
  forum(@Param('id') id: string, @Query('page') page: string, @Query('filter') filter: string, @Request() req: any) {
    return this.forumService.forumView(id, parseInt(page ?? '1', 10), viewerOf(req), filter);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('topics/:id')
  topic(@Param('id') id: string, @Query('page') page: string, @Request() req: any) {
    return this.forumService.getTopic(id, parseInt(page ?? '1', 10), viewerOf(req));
  }

  // ---------------------------------------------------------------- écriture (membres)

  @UseGuards(JwtAuthGuard)
  @Post('categories/:id/topics')
  createTopic(@Param('id') id: string, @Body() body: { title: string; content: string }, @Request() req: any) {
    assertPerm(req, 'write');
    return this.forumService.createTopic(id, req.user.userId, req.user.role, body.title, body.content);
  }

  @UseGuards(JwtAuthGuard)
  @Post('topics/:id/reply')
  reply(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    assertPerm(req, 'write');
    return this.forumService.reply(id, req.user.userId, req.user.role, content);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('posts/:id')
  editPost(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.forumService.editPost(id, viewerOf(req)!, content);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('posts/:id')
  deletePost(@Param('id') id: string, @Request() req: any) {
    return this.forumService.deletePost(id, viewerOf(req)!);
  }

  /** Forum d'entraide : l'auteur du sujet (ou l'équipe) marque la réponse qui règle le problème (postId nul = retirer la marque). */
  @UseGuards(JwtAuthGuard)
  @Post('topics/:id/solved')
  solved(@Param('id') id: string, @Body('postId') postId: string | null, @Request() req: any) {
    return this.forumService.markSolved(id, postId || null, viewerOf(req)!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('topics/:id/follow')
  follow(@Param('id') id: string, @Body('on') on: boolean, @Request() req: any) {
    return this.forumService.follow(id, req.user.userId, on !== false, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post('forums/:id/mark-read')
  markForumRead(@Param('id') id: string, @Request() req: any) {
    return this.forumService.markForumRead(id, viewerOf(req)!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mark-read')
  markAllRead(@Request() req: any) {
    return this.forumService.markAllRead(req.user.userId);
  }

  // ---------------------------------------------------------------- modération et administration

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('topics/:id/moderate')
  async moderate(@Param('id') id: string, @Body() body: { action: string; forumId?: string }, @Request() req: any) {
    const result = await this.forumService.moderateTopic(id, body.action, body.forumId);
    await this.audit.log(req.user.userId, `FORUM_TOPIC_${String(body.action).toUpperCase()}`, { topicId: id, title: result.title, forumId: body.forumId }, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Delete('topics/:id')
  async deleteTopic(@Param('id') id: string, @Request() req: any) {
    const result = await this.forumService.deleteTopic(id);
    await this.audit.log(req.user.userId, 'FORUM_TOPIC_DELETE', { topicId: id, title: result.title }, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Get('movable-forums')
  movable() {
    return this.forumService.movableForums();
  }

  /** Arbre complet de l'administration : tous les niveaux, réglages, compteurs, accès. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Get('admin/tree')
  adminTree() {
    return this.forumService.adminTree();
  }

  /** Aperçu de « Appliquer la structure recommandée » : ce qui serait créé et ce qui existe déjà. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin/preview-suggested')
  previewSuggested() {
    return this.forumService.previewSuggested();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Get('categories')
  categories() {
    return this.forumService.listCategories();
  }

  /** Ajoute la structure de forum suggérée (4 catégories, 11 forums) : ce qui existe déjà n'est pas recréé. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('suggested')
  async createSuggested(@Request() req: any) {
    const result = await this.forumService.createSuggested();
    await this.audit.log(req.user.userId, 'FORUM_STRUCTURE_CREATE', { suggested: result.created.length }, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories')
  async createCategory(@Body() body: { name: string; parentId?: string; isCategory?: boolean; description?: string; icon?: string; staffOnly?: boolean; locked?: boolean; archived?: boolean; qa?: boolean; rules?: string; access?: any }, @Request() req: any) {
    const result = await this.forumService.createCategory(body.name, body.parentId, !!body.isCategory, body);
    await this.audit.log(req.user.userId, 'FORUM_STRUCTURE_CREATE', { name: body.name, isCategory: !!body.isCategory }, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: { name?: string; parentId?: string | null; isCategory?: boolean; description?: string | null; icon?: string | null; staffOnly?: boolean; locked?: boolean; archived?: boolean; qa?: boolean; rules?: string | null; access?: any },
    @Request() req: any,
  ) {
    const result = await this.forumService.updateCategory(id, body);
    await this.audit.log(req.user.userId, 'FORUM_STRUCTURE_UPDATE', { id, name: result.name, fields: Object.keys(body ?? {}) }, null);
    return result;
  }

  /** Glisser-déposer : place l'élément sous un parent (ou au premier niveau) à la position donnée. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories/:id/place')
  async place(@Param('id') id: string, @Body() body: { parentId?: string | null; index?: number }, @Request() req: any) {
    const result = await this.forumService.place(id, body?.parentId || null, Number(body?.index));
    await this.audit.log(req.user.userId, 'FORUM_STRUCTURE_MOVE', { id, parentId: body?.parentId ?? null, index: body?.index }, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('categories/:id/merge')
  async merge(@Param('id') id: string, @Body('targetId') targetId: string, @Request() req: any) {
    const result = await this.forumService.merge(id, targetId);
    await this.audit.log(req.user.userId, 'FORUM_STRUCTURE_MERGE', result, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('categories/:id/move-topics')
  async moveTopics(@Param('id') id: string, @Body('targetId') targetId: string, @Request() req: any) {
    const result = await this.forumService.moveTopics(id, targetId);
    await this.audit.log(req.user.userId, 'FORUM_TOPICS_MOVE', { id, targetId, ...result }, null);
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  @Post('categories/:id/move')
  move(@Param('id') id: string, @Body('direction') direction: 'up' | 'down') {
    return this.forumService.move(id, direction === 'up' ? 'up' : 'down');
  }

  /** Supprime un forum ou une catégorie ; `moveTo` dit où envoyer les sujets (forum) ou les forums (catégorie ; « root » = premier niveau). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string, @Query('moveTo') moveTo: string, @Request() req: any) {
    const result = await this.forumService.deleteCategory(id, moveTo || undefined);
    await this.audit.log(req.user.userId, 'FORUM_STRUCTURE_DELETE', { ...result }, null);
    return result;
  }
}
