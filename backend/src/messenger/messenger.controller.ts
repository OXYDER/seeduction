import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CoversService } from '../covers/covers.service';
import { ChatFilesService } from '../chat/chat-files.service';
import { Actor, MessengerService, SendInput } from './messenger.service';
import { MessengerGifsService } from './messenger-gifs.service';
import { MessengerCallsService } from './messenger-calls.service';

const actorOf = (req: any): Actor => ({ userId: req.user.userId, username: req.user.username, role: req.user.role });

/** API REST du Messenger (la même logique que la websocket, qui reste le chemin normal pour le direct). */
@UseGuards(JwtAuthGuard)
@Controller('messenger')
export class MessengerController {
  constructor(private messenger: MessengerService, private covers: CoversService, private files: ChatFilesService, private gifs: MessengerGifsService, private calls: MessengerCallsService) {}

  @Get('conversations')
  list(@Query('archived') archived: string | undefined, @Request() req: any) {
    return this.messenger.list(actorOf(req), { archived: archived === '1' || archived === 'true' });
  }

  /** Recherche (ou tendances si `q` est vide) de GIF et d'autocollants. `enabled: false` tant que KLIPY_API_KEY n'est pas configurée. */
  @Get('gifs')
  async gifSearch(@Query('q') q: string | undefined, @Query('kind') kind: string | undefined, @Query('page') page: string | undefined, @Request() req: any) {
    if (!this.gifs.enabled()) return { enabled: false, items: [], hasNext: false };
    const n = Math.min(50, Math.max(1, parseInt(page ?? '1', 10) || 1));
    return { enabled: true, ...(await this.gifs.search(req.user.userId, kind === 'stickers' ? 'stickers' : 'gifs', q ?? '', n)) };
  }

  /** Serveurs STUN / TURN pour les appels. */
  @Get('calls/ice')
  callIce(@Request() req: any) {
    return this.calls.iceServers(req.user.userId);
  }

  @Get('unread')
  unread(@Request() req: any) {
    return this.messenger.unreadTotals(actorOf(req));
  }

  @Get('conversations/:id')
  get(@Param('id') id: string, @Request() req: any) {
    return this.messenger.get(actorOf(req), id);
  }

  @Post('direct')
  direct(@Body('userId') userId: string, @Request() req: any) {
    return this.messenger.openDirect(actorOf(req), userId);
  }

  @Post('groups')
  createGroup(@Body() body: { name: string; memberIds: string[] }, @Request() req: any) {
    return this.messenger.createGroup(actorOf(req), body?.name, body?.memberIds);
  }

  @Patch('conversations/:id')
  updateGroup(@Param('id') id: string, @Body() body: { name?: string; iconUrl?: string | null }, @Request() req: any) {
    return this.messenger.updateGroup(actorOf(req), id, body ?? {});
  }

  @Post('conversations/:id/members')
  addMembers(@Param('id') id: string, @Body('userIds') userIds: string[], @Request() req: any) {
    return this.messenger.addMembers(actorOf(req), id, userIds);
  }

  @Delete('conversations/:id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Request() req: any) {
    return this.messenger.removeMember(actorOf(req), id, userId);
  }

  @Patch('conversations/:id/members/:userId')
  setRole(@Param('id') id: string, @Param('userId') userId: string, @Body('role') role: string, @Request() req: any) {
    if (role !== 'ADMIN' && role !== 'MEMBER') throw new BadRequestException('Rôle invalide');
    return this.messenger.setMemberRole(actorOf(req), id, userId, role);
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string, @Query('before') before: string | undefined, @Query('limit') limit: string | undefined, @Request() req: any) {
    return this.messenger.messages(actorOf(req), id, before || undefined, limit ? Number(limit) : undefined);
  }

  @Get('conversations/:id/search')
  search(@Param('id') id: string, @Query('q') q: string, @Request() req: any) {
    return this.messenger.search(actorOf(req), id, q);
  }

  /** Filet de sécurité si la websocket n'est pas connectée. */
  @Post('conversations/:id/messages')
  send(@Param('id') id: string, @Body() body: SendInput, @Request() req: any) {
    return this.messenger.send(actorOf(req), id, body ?? {});
  }

  @Post('conversations/:id/read')
  read(@Param('id') id: string, @Request() req: any) {
    return this.messenger.markRead(actorOf(req), id);
  }

  @Patch('conversations/:id/settings')
  settings(@Param('id') id: string, @Body() body: { mutedUntil?: string | null; pinned?: boolean; archived?: boolean }, @Request() req: any) {
    return this.messenger.setSettings(actorOf(req), id, body ?? {});
  }

  @Get('conversations/:id/pins')
  pins(@Param('id') id: string, @Request() req: any) {
    return this.messenger.pins(actorOf(req), id);
  }

  @Post('conversations/:id/pins')
  addPin(@Param('id') id: string, @Body('messageId') messageId: string, @Request() req: any) {
    return this.messenger.addPin(actorOf(req), id, messageId);
  }

  @Delete('conversations/:id/pins/:messageId')
  removePin(@Param('id') id: string, @Param('messageId') messageId: string, @Request() req: any) {
    return this.messenger.removePin(actorOf(req), id, messageId);
  }

  @Put('conversations/:id/motd')
  setMotd(@Param('id') id: string, @Body('motd') motd: string | null, @Request() req: any) {
    return this.messenger.setMotd(actorOf(req), id, motd);
  }

  @Post('conversations/:id/pin')
  pin(@Param('id') id: string, @Body('messageId') messageId: string | null, @Request() req: any) {
    return this.messenger.pinMessage(actorOf(req), id, messageId ?? null);
  }

  @Patch('messages/:id')
  edit(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.messenger.edit(actorOf(req), id, content);
  }

  @Delete('messages/:id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.messenger.remove(actorOf(req), id);
  }

  @Post('messages/:id/reactions')
  react(@Param('id') id: string, @Body('emoji') emoji: string, @Request() req: any) {
    return this.messenger.react(actorOf(req), id, emoji);
  }

  // --- Administration des canaux (ADMIN / OWNER) ---

  @Get('admin/channels')
  adminChannels(@Request() req: any) {
    return this.messenger.adminListChannels(actorOf(req));
  }

  @Post('admin/channels')
  createChannel(@Body() body: any, @Request() req: any) {
    return this.messenger.createChannel(actorOf(req), body ?? {});
  }

  @Patch('admin/channels/:id')
  updateChannel(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.messenger.updateChannel(actorOf(req), id, body ?? {});
  }

  @Delete('admin/channels/:id')
  deleteChannel(@Param('id') id: string, @Request() req: any) {
    return this.messenger.deleteChannel(actorOf(req), id);
  }

  /** Pièce jointe : une image (jpeg/png/webp) s'affiche en ligne, tout autre fichier devient un lien de téléchargement. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Query('voice') voice?: string) {
    if (!file) throw new BadRequestException('Fichier manquant');
    if (voice === '1') {
      // Message vocal : un enregistrement audio du navigateur, servi ensuite en lecture directe (voir MessengerFilesController).
      if (!/^audio\//i.test(file.mimetype)) throw new BadRequestException('Format audio invalide');
      const ext = /mp4|aac/i.test(file.mimetype) ? 'm4a' : /ogg/i.test(file.mimetype) ? 'ogg' : /mpeg|mp3/i.test(file.mimetype) ? 'mp3' : /wav/i.test(file.mimetype) ? 'wav' : 'webm';
      const saved = await this.files.saveUpload({ ...file, originalname: `vocal.${ext}` } as Express.Multer.File);
      return { kind: 'voice', url: saved.url.replace('/api/chat/files/', '/api/messenger/files/'), name: saved.name, size: saved.size, mime: file.mimetype };
    }
    if (/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) return { kind: 'image', url: await this.covers.saveChatImage(file), name: file.originalname, size: file.size, mime: file.mimetype };
    const saved = await this.files.saveUpload(file);
    return { kind: 'file', url: saved.url, name: saved.name, size: saved.size, mime: file.mimetype };
  }
}
