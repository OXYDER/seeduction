import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { accountOf, assertPerm } from '../common/utils/account';
import { Actor, SuggestionsService } from './suggestions.service';

/** Le vote et les limites se comptent par COMPTE (pas par profil famille) : un compte = un vote. */
const actorOf = (req: any): Actor => ({ userId: accountOf(req), username: req.user.username, role: req.user.role });

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suggestions')
export class SuggestionsController {
  constructor(private suggestions: SuggestionsService, private audit: AuditService) {}

  @Get('meta')
  meta() { return this.suggestions.meta(); }

  @Get('similar')
  similar(@Query('q') q: string) { return this.suggestions.similar(q ?? ''); }

  @Get()
  list(@Query() query: any, @Request() req: any) { return this.suggestions.list(accountOf(req), query); }

  @Post()
  create(@Body() body: any, @Request() req: any) { assertPerm(req, 'write'); return this.suggestions.create(actorOf(req), body ?? {}); }

  @Put('admin/config')
  @Roles('ADMIN', 'OWNER')
  async config(@Body('threshold') threshold: number, @Request() req: any) {
    const r = await this.suggestions.setThreshold(threshold);
    await this.audit.log(req.user.userId, 'SUGGESTION_CONFIG', { threshold: r.threshold }, null);
    return r;
  }

  @Delete('comments/:commentId')
  removeComment(@Param('commentId') commentId: string, @Request() req: any) { return this.suggestions.removeComment(actorOf(req), commentId); }

  @Get(':id')
  get(@Param('id') id: string, @Request() req: any) { return this.suggestions.get(accountOf(req), id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) { assertPerm(req, 'write'); return this.suggestions.update(actorOf(req), id, body ?? {}); }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) { return this.suggestions.remove(actorOf(req), id); }

  @Post(':id/vote')
  vote(@Param('id') id: string, @Request() req: any) { assertPerm(req, 'write'); return this.suggestions.toggleVote(actorOf(req), id); }

  @Post(':id/comments')
  comment(@Param('id') id: string, @Body() body: any, @Request() req: any) { assertPerm(req, 'write'); return this.suggestions.addComment(actorOf(req), id, body ?? {}); }

  @Post(':id/status')
  @Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
  async status(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const r = await this.suggestions.setStatus(actorOf(req), id, body ?? {});
    await this.audit.log(req.user.userId, 'SUGGESTION_STATUS', { suggestionId: id, status: body?.status }, null);
    return r;
  }
}
