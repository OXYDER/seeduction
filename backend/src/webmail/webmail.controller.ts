import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { WebmailService } from './webmail.service';

const viewerOf = (req: any) => ({ userId: req.user.userId, username: req.user.username, role: req.user.role });
const num = (v: unknown) => Math.floor(Number(v));
const uidList = (v: unknown): number[] => (Array.isArray(v) ? v : []).map(num);

/** Interface Courriel : administrateurs seulement (le propriétaire règle les boîtes, chaque administrateur n'a accès qu'à celles qu'on lui donne). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('webmail')
export class WebmailController {
  constructor(private mail: WebmailService) {}

  @Get('mailboxes')
  mailboxes(@Request() req: any) { return this.mail.mailboxes(viewerOf(req)); }

  @Get('unread')
  unread(@Request() req: any) { return this.mail.unread(viewerOf(req)); }

  @Get('mailboxes/:id/folders')
  folders(@Param('id') id: string, @Request() req: any) { return this.mail.folders(viewerOf(req), id); }

  @Get('mailboxes/:id/messages')
  messages(@Param('id') id: string, @Query() q: any, @Request() req: any) {
    return this.mail.messages(viewerOf(req), id, { folder: q.folder, page: num(q.page) || 1, q: q.q, alias: q.alias, unseen: q.unseen === '1' });
  }

  @Get('mailboxes/:id/message')
  message(@Param('id') id: string, @Query() q: any, @Request() req: any) {
    return this.mail.message(viewerOf(req), id, String(q.folder || 'INBOX'), num(q.uid), { images: q.images === '1' });
  }

  @Get('mailboxes/:id/reply')
  reply(@Param('id') id: string, @Query() q: any, @Request() req: any) {
    return this.mail.replyDraft(viewerOf(req), id, String(q.folder || 'INBOX'), num(q.uid), q.mode === 'all' ? 'all' : q.mode === 'forward' ? 'forward' : 'reply');
  }

  @Get('mailboxes/:id/attachment')
  async attachment(@Param('id') id: string, @Query() q: any, @Request() req: any, @Res() res: any) {
    const a = await this.mail.attachment(viewerOf(req), id, String(q.folder || 'INBOX'), num(q.uid), num(q.index));
    res.set({ 'Content-Type': a.contentType, 'Content-Disposition': `attachment; filename="${a.filename}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" }).send(a.content);
  }

  @Post('mailboxes/:id/flags')
  flags(@Param('id') id: string, @Body() b: any, @Request() req: any) { return this.mail.setFlags(viewerOf(req), id, String(b?.folder || 'INBOX'), uidList(b?.uids), { seen: typeof b?.seen === 'boolean' ? b.seen : undefined, flagged: typeof b?.flagged === 'boolean' ? b.flagged : undefined }); }

  @Post('mailboxes/:id/move')
  move(@Param('id') id: string, @Body() b: any, @Request() req: any) { return this.mail.move(viewerOf(req), id, String(b?.folder || 'INBOX'), uidList(b?.uids), String(b?.target ?? '')); }

  @Post('mailboxes/:id/delete')
  remove(@Param('id') id: string, @Body() b: any, @Request() req: any) { return this.mail.remove_(viewerOf(req), id, String(b?.folder || 'INBOX'), uidList(b?.uids)); }

  /** Envoi : formulaire multipart (champ `payload` en JSON + pièces jointes). */
  @Post('mailboxes/:id/send')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 20 * 1024 * 1024, files: 10, fields: 20 } }))
  send(@Param('id') id: string, @Body('payload') payload: string, @UploadedFiles() files: any[], @Request() req: any) {
    let input: any = {};
    try { input = JSON.parse(String(payload ?? '{}')); } catch { /* corps invalide : le service refusera */ }
    return this.mail.send(viewerOf(req), id, input, (files ?? []).map((f) => ({ originalname: f.originalname, buffer: f.buffer, mimetype: f.mimetype, size: f.size })), req.ip);
  }

  // ---- propriétaire : réglages des boîtes

  @Roles('OWNER')
  @Get('admin')
  adminList() { return this.mail.adminList(); }

  @Roles('OWNER')
  @Post('admin/test')
  test(@Body() b: any) { return this.mail.test(b, b?.id); }

  @Roles('OWNER')
  @Post('admin/mailboxes')
  create(@Body() b: any, @Request() req: any) { return this.mail.create(viewerOf(req), b, req.ip); }

  @Roles('OWNER')
  @Put('admin/mailboxes/:id')
  update(@Param('id') id: string, @Body() b: any, @Request() req: any) { return this.mail.update(viewerOf(req), id, b, req.ip); }

  @Roles('OWNER')
  @Delete('admin/mailboxes/:id')
  del(@Param('id') id: string, @Request() req: any) { return this.mail.remove(viewerOf(req), id, req.ip); }
}
