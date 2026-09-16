import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'ADMIN', 'OWNER')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @Get('torrents/pending')
  pending() {
    return this.adminService.pendingTorrents();
  }

  @Post('torrents/:id/approve')
  approve(@Param('id') id: string) {
    return this.adminService.approveTorrent(id);
  }

  @Post('torrents/:id/reject')
  reject(@Param('id') id: string) {
    return this.adminService.rejectTorrent(id);
  }

  @Post('users/:id/warn')
  warn(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    return this.adminService.warnUser(id, reason, req.user.username);
  }

  @Post('users/:id/ban')
  ban(@Param('id') id: string, @Body() body: { reason: string; expiresAt?: string }, @Request() req: any) {
    return this.adminService.banUser(id, body.reason, req.user.username, body.expiresAt ? new Date(body.expiresAt) : undefined);
  }

  @Post('users/:id/unban')
  unban(@Param('id') id: string) {
    return this.adminService.unbanUser(id);
  }

  @Get('reports')
  reports(@Query('status') status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN') {
    return this.adminService.listReports(status);
  }

  @Post('reports/:id/resolve')
  resolve(@Param('id') id: string, @Body('status') status: 'RESOLVED' | 'DISMISSED') {
    return this.adminService.resolveReport(id, status);
  }
}
