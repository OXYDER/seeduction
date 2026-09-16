import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('requests')
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @Get()
  list() {
    return this.requestsService.list();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: { title: string; description: string; bounty: number }, @Request() req: any) {
    return this.requestsService.create(req.user.userId, body.title, body.description, body.bounty);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/fill')
  fill(@Param('id') id: string, @Body('torrentId') torrentId: string, @Request() req: any) {
    return this.requestsService.fill(id, torrentId, req.user.userId);
  }
}
