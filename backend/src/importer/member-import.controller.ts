import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf, assertMaster, assertPerm } from '../common/utils/account';
import { AuditService } from '../audit/audit.service';
import { MemberImportService } from './member-import.service';

/**
 * Page « Envoyer » > « Plusieurs torrents » : le membre connecte SON qBittorrent (et son FTP), le site propose ses releases, il corrige et confirme.
 * Réservé au profil principal du compte qui a le droit d'envoyer (les accès au client sont ceux du compte).
 */
@UseGuards(JwtAuthGuard)
@Controller('member-import')
export class MemberImportController {
  constructor(private service: MemberImportService, private audit: AuditService) {}

  private who(req: any) {
    assertMaster(req);
    assertPerm(req, 'upload');
    return accountOf(req);
  }

  /** Réglages (sans mot de passe), opération en cours et compteurs. */
  @Get()
  get(@Request() req: any) {
    return this.service.get(this.who(req));
  }

  @Put('connection')
  async save(@Body() body: any, @Request() req: any) {
    const r = await this.service.save(this.who(req), body);
    await this.audit.log(req.user.userId, 'MEMBER_SEEDBOX_SAVE', { qbit: r?.qbit.url, ftp: r?.ftp?.host ?? null });
    return r;
  }

  @Delete('connection')
  async remove(@Request() req: any) {
    const r = await this.service.remove(this.who(req));
    await this.audit.log(req.user.userId, 'MEMBER_SEEDBOX_DELETE', {});
    return r;
  }

  @Post('test')
  test(@Request() req: any) {
    return this.service.startTest(this.who(req));
  }

  @Post('scan')
  scan(@Request() req: any) {
    return this.service.startScan(this.who(req));
  }

  @Post('seed')
  seed(@Request() req: any) {
    return this.service.startSeed(this.who(req));
  }

  @Get('items')
  items(@Request() req: any, @Query('status') status?: string) {
    return this.service.items(this.who(req), status);
  }

  @Get('options')
  options(@Request() req: any) {
    this.who(req);
    return this.service.options();
  }

  @Get('search')
  search(@Request() req: any, @Query('kind') kind: string, @Query('q') q: string, @Query('year') year?: string) {
    this.who(req);
    return this.service.search(kind, String(q ?? '').trim(), year);
  }

  @Post('items/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.updateItem(this.who(req), id, body);
  }

  @Post('items/:id/retry')
  retry(@Param('id') id: string, @Request() req: any) {
    return this.service.retryItem(this.who(req), id);
  }

  @Post('items/:id/ignore')
  ignore(@Param('id') id: string, @Body() body: { undo?: boolean }, @Request() req: any) {
    return this.service.ignoreItem(this.who(req), id, !body?.undo);
  }

  /** Le membre confirme les lignes cochées : elles partent sur Seeduction (modération habituelle) puis reprennent le seed dans son client. */
  @Post('publish')
  async publish(@Body() body: { ids?: string[] }, @Request() req: any) {
    const r = await this.service.publish(this.who(req), body?.ids);
    await this.audit.log(req.user.userId, 'MEMBER_SEEDBOX_PUBLISH', { queued: r.queued });
    return r;
  }
}
