import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { RequestsService, RequestInput } from './requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { accountOf, assertPerm } from '../common/utils/account';

@Controller('requests')
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Query() query: Record<string, string>, @Request() req: any) {
    return this.requestsService.list({ ...query, userId: req.user ? accountOf(req) : undefined });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: RequestInput, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.requestsService.create(accountOf(req), body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/bounty')
  addBounty(@Param('id') id: string, @Body('amount') amount: number, @Request() req: any) {
    assertPerm(req, 'spend');
    return this.requestsService.addBounty(id, accountOf(req), amount);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/fill')
  fill(@Param('id') id: string, @Body('torrentId') torrentId: string, @Request() req: any) {
    return this.requestsService.fill(id, torrentId, { userId: accountOf(req), role: req.user.role, alt: req.user.userId });
  }

  /** Le demandeur confirme le torrent proposé par un autre membre. */
  @UseGuards(JwtAuthGuard)
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.confirm(id, { userId: accountOf(req), role: req.user.role });
  }

  /** Le demandeur refuse le torrent proposé : la demande reste ouverte. */
  @UseGuards(JwtAuthGuard)
  @Post(':id/decline')
  decline(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.decline(id, { userId: accountOf(req), role: req.user.role });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.remove(id, req.user);
  }
}
