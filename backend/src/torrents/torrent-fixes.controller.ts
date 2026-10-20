import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { TorrentFixesService } from './torrent-fixes.service';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Corrections proposées par les membres sur un torrent, et leur traitement par l'équipe. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TorrentFixesController {
  constructor(private fixes: TorrentFixesService) {}

  @Post('torrents/:id/fixes')
  propose(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.fixes.propose(accountOf(req), id, body ?? {});
  }

  @Get('torrents/:id/fixes')
  forTorrent(@Param('id') id: string, @Request() req: any) {
    return this.fixes.forTorrent(id, accountOf(req), STAFF.includes(req.user.role));
  }

  @Delete('torrent-fixes/:fixId')
  withdraw(@Param('fixId') fixId: string, @Request() req: any) {
    return this.fixes.withdraw(accountOf(req), fixId);
  }

  @Roles(...STAFF)
  @Get('admin/torrent-fixes')
  queue() {
    return this.fixes.queue();
  }

  @Roles(...STAFF)
  @Post('admin/torrent-fixes/:fixId/accept')
  accept(@Param('fixId') fixId: string, @Body() body: { note?: string }, @Request() req: any) {
    return this.fixes.accept({ userId: req.user.userId, username: req.user.username, role: req.user.role }, fixId, body?.note);
  }

  @Roles(...STAFF)
  @Post('admin/torrent-fixes/:fixId/reject')
  reject(@Param('fixId') fixId: string, @Body() body: { reason?: string }, @Request() req: any) {
    return this.fixes.reject({ userId: req.user.userId, username: req.user.username, role: req.user.role }, fixId, body?.reason);
  }
}
