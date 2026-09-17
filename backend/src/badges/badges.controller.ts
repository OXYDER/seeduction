import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('badges')
export class BadgesController {
  constructor(private badgesService: BadgesService) {}

  @Get('catalog')
  catalog() {
    return this.badgesService.catalog();
  }

  @Get('hall-of-fame')
  hallOfFame(@Query('limit') limit?: string) {
    return this.badgesService.hallOfFame(limit ? Number(limit) : undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@Request() req: any) {
    return this.badgesService.listForUser(req.user.userId);
  }

  @Get('user/:id')
  forUser(@Param('id') id: string) {
    return this.badgesService.listForUser(id);
  }
}
