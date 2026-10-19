import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { WebmailService } from './webmail.service';
import { WebmailExtrasService } from './webmail-extras.service';

const viewerOf = (req: any) => ({ userId: req.user.userId, username: req.user.username, role: req.user.role });
const num = (v: unknown) => Math.floor(Number(v));
const uidList = (v: unknown): number[] => (Array.isArray(v) ? v : []).map(num);

/** Interface Courriel : toute l'équipe peut utiliser les boîtes auxquelles elle a accès ; seuls les administrateurs règlent des boîtes. Chacun règle les boîtes qu'il a ajoutées (et choisit qui d'autre y a accès) ; le rôle propriétaire du site règle toutes les boîtes. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER')
@Controller('webmail')
export class WebmailController {
  constructor(private mail: WebmailService, private extras: WebmailExtrasService) {}

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

  /** Les courriels de la même conversation (réception, envoyés, archives). */
  @Get('mailboxes/:id/thread')
  thread(@Param('id') id: string, @Query('subject') subject: string, @Request() req: any) { return this.mail.thread(viewerOf(req), id, String(subject ?? '')); }

  @Get('mailboxes/:id/templates')
  templates(@Param('id') id: string, @Request() req: any) { return this.extras.templates(viewerOf(req), id); }

  @Post('mailboxes/:id/templates')
  saveTemplate(@Param('id') id: string, @Body() b: any, @Request() req: any) { return this.extras.saveTemplate(viewerOf(req), id, b ?? {}); }

  @Delete('mailboxes/:id/templates/:tid')
  removeTemplate(@Param('id') id: string, @Param('tid') tid: string, @Request() req: any) { return this.extras.removeTemplate(viewerOf(req), id, tid); }

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
  @Get('mailboxes/:id/contacts')
  contacts(@Param('id') id: string, @Query('q') q: string, @Request() req: any) { return this.mail.contacts(viewerOf(req), id, q); }

  @Get('mailboxes/:id/draft')
  draft(@Param('id') id: string, @Query() q: any, @Request() req: any) { return this.mail.openDraft(viewerOf(req), id, String(q.folder || 'Drafts'), num(q.uid)); }

  @Get('mailboxes/:id/eml')
  async eml(@Param('id') id: string, @Query() q: any, @Request() req: any, @Res() res: any) {
    const buf = await this.mail.source(viewerOf(req), id, String(q.folder || 'INBOX'), num(q.uid));
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="courriel-${num(q.uid)}.eml"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(buf);
  }

  /** Brouillon : même formulaire que l'envoi, sans rien envoyer. */
  @Post('mailboxes/:id/draft')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 20 * 1024 * 1024, files: 10, fields: 20 } }))
  saveDraft(@Param('id') id: string, @Body('payload') payload: string, @UploadedFiles() files: any[], @Request() req: any) {
    let input: any = {};
    try { input = JSON.parse(String(payload ?? '{}')); } catch { /* corps invalide */ }
    return this.mail.saveDraft(viewerOf(req), id, input, (files ?? []).map((f) => ({ originalname: f.originalname, buffer: f.buffer, mimetype: f.mimetype, size: f.size })));
  }

  @Post('mailboxes/:id/send')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 20 * 1024 * 1024, files: 10, fields: 20 } }))
  send(@Param('id') id: string, @Body('payload') payload: string, @UploadedFiles() files: any[], @Request() req: any) {
    let input: any = {};
    try { input = JSON.parse(String(payload ?? '{}')); } catch { /* corps invalide : le service refusera */ }
    return this.mail.send(viewerOf(req), id, input, (files ?? []).map((f) => ({ originalname: f.originalname, buffer: f.buffer, mimetype: f.mimetype, size: f.size })), req.ip);
  }

  // ---- réglages des boîtes (le service vérifie que la boîte appartient bien à celui qui la règle)

  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  adminList(@Request() req: any) { return this.mail.adminList(viewerOf(req)); }

  @Roles('ADMIN', 'OWNER')
  @Post('admin/test')
  test(@Body() b: any, @Request() req: any) { return this.mail.test(viewerOf(req), b, b?.id); }

  @Roles('ADMIN', 'OWNER')
  @Post('admin/mailboxes')
  create(@Body() b: any, @Request() req: any) { return this.mail.create(viewerOf(req), b, req.ip); }

  @Roles('ADMIN', 'OWNER')
  @Put('admin/mailboxes/:id')
  update(@Param('id') id: string, @Body() b: any, @Request() req: any) { return this.mail.update(viewerOf(req), id, b, req.ip); }

  @Roles('ADMIN', 'OWNER')
  @Delete('admin/mailboxes/:id')
  del(@Param('id') id: string, @Request() req: any) { return this.mail.remove(viewerOf(req), id, req.ip); }
}
