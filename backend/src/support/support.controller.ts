import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Actor, SupportService } from './support.service';
import { SupportBotService } from './support-bot.service';
import { SupportAiService } from './support-ai.service';

const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username, role: req.user.role });
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] as const;
const ADMINS = ['ADMIN', 'OWNER'] as const;

/** Centre de support : billets des membres, assistant du canal « Support », administration par l'équipe. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private support: SupportService, private bot: SupportBotService, private ai: SupportAiService) {}

  // --- Membres ---

  @Get('overview')
  overview() { return this.bot.overview(); }

  @Get('categories')
  categories() { return this.support.categories(); }

  /** Articles du wiki qui répondent peut-être à la question, avant même d'ouvrir un billet. */
  @Get('suggest')
  suggest(@Query('q') q: string) { return this.support.suggest(q ?? ''); }

  @Get('badge')
  badge(@Request() req: any) { return this.support.badge(actorOf(req)); }

  @Get('tickets')
  mine(@Query('filter') filter: string | undefined, @Request() req: any) { return this.support.myTickets(actorOf(req), filter === 'open' ? 'open' : 'all'); }

  @Post('tickets')
  create(@Body() body: any, @Request() req: any) { return this.bot.createTicketFromChat(actorOf(req), body ?? {}); }

  @Get('tickets/:id')
  get(@Param('id') id: string, @Request() req: any) { return this.support.get(actorOf(req), id); }

  @Post('tickets/:id/reply')
  reply(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.support.reply(actorOf(req), id, body ?? {}); }

  @Post('tickets/:id/status')
  myStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    return this.support.setMyStatus(actorOf(req), id, status === 'CLOSED' ? 'CLOSED' : status === 'OPEN' ? 'OPEN' : 'RESOLVED');
  }

  @Post('tickets/:id/rate')
  rate(@Param('id') id: string, @Body() body: { rating: number; comment?: string }, @Request() req: any) { return this.support.rate(actorOf(req), id, body?.rating, body?.comment); }

  /** « Ça règle mon problème » / « Pas résolu » sous une réponse de l'assistant. */
  @Post('chat/feedback')
  feedback(@Body() body: { messageId: string; solved: boolean }, @Request() req: any) { return this.bot.feedback(actorOf(req), body?.messageId, !!body?.solved); }

  /** « Demander l'aide de l'équipe » : l'assistant se retire et l'équipe est prévenue. */
  @Post('chat/handoff')
  handoff(@Request() req: any) { return this.bot.requestHuman(actorOf(req)); }

  // --- Équipe ---

  @Roles(...STAFF)
  @Get('staff/queue')
  queue(@Query() q: any, @Request() req: any) { return this.support.queue({ ...q, page: Number(q.page) || 1 }, actorOf(req)); }

  @Roles(...STAFF)
  @Get('staff/counts')
  counts() { return this.support.counts(); }

  @Roles(...STAFF)
  @Get('staff/members')
  staff() { return this.support.staffList(); }

  @Roles(...STAFF)
  @Get('staff/stats')
  stats(@Query('days') days?: string) { return this.support.stats(Math.min(365, Math.max(1, Number(days) || 30))); }

  @Roles(...STAFF)
  @Get('staff/categories')
  allCategories() { return this.support.categories(true); }

  @Roles(...STAFF)
  @Patch('staff/tickets/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.support.staffUpdate(actorOf(req), id, body ?? {}); }

  /** Brouillon de réponse écrit par l'IA d'après le billet et le wiki. */
  @Roles(...STAFF)
  @Post('staff/tickets/:id/draft')
  draft(@Param('id') id: string, @Request() req: any) { return this.support.draftReply(actorOf(req), id); }

  @Roles(...STAFF)
  @Post('staff/from-message')
  fromMessage(@Body('messageId') messageId: string, @Request() req: any) { return this.bot.ticketFromMessage(actorOf(req), messageId); }

  @Roles(...STAFF)
  @Get('staff/canned')
  canned() { return this.support.canned(); }

  // --- Administration (administrateurs) ---

  @Roles(...ADMINS)
  @Get('admin/config')
  async config() {
    const cfg = await this.support.config();
    return { config: cfg, ai: this.ai.status(cfg), overview: await this.bot.overview() };
  }

  @Roles(...ADMINS)
  @Put('admin/config')
  async saveConfig(@Body() body: any) {
    const cfg = await this.support.saveConfig(body);
    this.bot.invalidate();
    await this.bot.ensureBot().catch(() => null);
    return { config: cfg, ai: this.ai.status(cfg), overview: await this.bot.overview() };
  }

  /** Modèles d'IA que la clé configurée peut utiliser. */
  @Roles(...ADMINS)
  @Get('admin/ai-models')
  async aiModels() { return this.ai.listModels(await this.support.config()); }

  @Roles(...ADMINS)
  @Post('admin/test')
  test(@Body('question') question: string) { return this.bot.test(question); }

  @Roles(...ADMINS)
  @Post('admin/channel')
  createChannel(@Request() req: any) { return this.bot.createChannel(actorOf(req)); }

  @Roles(...ADMINS)
  @Post('admin/categories')
  addCategory(@Body() body: any) { return this.support.saveCategory(null, body ?? {}); }

  @Roles(...ADMINS)
  @Patch('admin/categories/:id')
  editCategory(@Param('id') id: string, @Body() body: any) { return this.support.saveCategory(id, body ?? {}); }

  @Roles(...ADMINS)
  @Delete('admin/categories/:id')
  removeCategory(@Param('id') id: string) { return this.support.deleteCategory(id); }

  @Roles(...ADMINS)
  @Post('admin/canned')
  addCanned(@Body() body: any) { return this.support.saveCanned(null, body ?? {}); }

  @Roles(...ADMINS)
  @Patch('admin/canned/:id')
  editCanned(@Param('id') id: string, @Body() body: any) { return this.support.saveCanned(id, body ?? {}); }

  @Roles(...ADMINS)
  @Delete('admin/canned/:id')
  removeCanned(@Param('id') id: string) { return this.support.deleteCanned(id); }
}
