import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: { targetType: string; targetId: string; reason: string }, @Request() req: any) {
    return this.reportsService.create(req.user.userId, body.targetType, body.targetId, body.reason);
  }
}
