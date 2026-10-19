import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { assertPerm } from '../common/utils/account';
import { SubtitlesService } from './subtitles.service';

const userOf = (req: any) => ({ userId: req.user.userId, accountId: req.user.accountId ?? req.user.userId, role: req.user.role });
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" };

/** Sous-titres partagés : fiche du torrent (membres) et lecteur Seeduction (passkey). */
@Controller('subtitles')
export class SubtitlesController {
  constructor(private subs: SubtitlesService) {}

  /** Pour le lecteur Seeduction : les sous-titres du fichier lu (identifié par la passkey, comme le suivi de lecture). */
  @Get('player')
  player(@Query('passkey') passkey: string, @Query('torrentId') torrentId: string, @Query('fileIndex') fileIndex: string) {
    return this.subs.forPlayer(passkey, String(torrentId ?? ''), Math.max(0, Math.floor(Number(fileIndex) || 0)));
  }

  @Get(':id/play')
  async play(@Param('id') id: string, @Query('passkey') passkey: string, @Res() res: any) {
    res.set(TEXT_HEADERS).send(await this.subs.playFile(passkey, id));
  }

  @UseGuards(JwtAuthGuard)
  @Get('torrent/:torrentId')
  list(@Param('torrentId') torrentId: string, @Req() req: any) { return this.subs.list(torrentId, req.user.accountId ?? req.user.userId, req.user.role); }

  @UseGuards(JwtAuthGuard)
  @Post('torrent/:torrentId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 700 * 1024, files: 1 } }))
  upload(@Param('torrentId') torrentId: string, @UploadedFile() file: any, @Body() body: any, @Req() req: any) {
    assertPerm(req, 'write');
    return this.subs.upload(userOf(req), torrentId, file, body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req: any, @Res() res: any) {
    const f = await this.subs.download(userOf(req), id);
    res.set({ ...TEXT_HEADERS, 'Content-Type': 'application/x-subrip; charset=utf-8', 'Content-Disposition': `attachment; filename="${f.filename}"` }).send(f.text);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.subs.update(userOf(req), id, body ?? {}); }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) { return this.subs.remove(userOf(req), id); }
}
