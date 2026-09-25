import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { RequestsService, RequestInput } from './requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('requests')
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Query() query: Record<string, string>, @Request() req: any) {
    return this.requestsService.list({ ...query, userId: req.user?.userId });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: RequestInput, @Request() req: any) {
    return this.requestsService.create(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/bounty')
  addBounty(@Param('id') id: string, @Body('amount') amount: number, @Request() req: any) {
    return this.requestsService.addBounty(id, req.user.userId, amount);
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
