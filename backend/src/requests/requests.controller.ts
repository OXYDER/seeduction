import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { RequestsService, RequestInput } from './requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { accountOf, assertNotChild } from '../common/utils/account';

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
    assertNotChild(req, 'Créer une demande');
    return this.requestsService.create(accountOf(req), body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/bounty')
  addBounty(@Param('id') id: string, @Body('amount') amount: number, @Request() req: any) {
    assertNotChild(req, 'Ajouter une prime');
    return this.requestsService.addBounty(id, accountOf(req), amount);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/fill')
  fill(@Param('id') id: string, @Body('torrentId') torrentId: string, @Request() req: any) {
    return this.requestsService.fill(id, torrentId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.remove(id, req.user);
  }
}
