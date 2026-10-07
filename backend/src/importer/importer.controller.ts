import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf, assertMaster } from '../common/utils/account';
import { AuditService } from '../audit/audit.service';
import { ImporterService } from './importer.service';

/** Admin > Import : réservé aux administrateurs (il gère des accès à des serveurs externes et publie au nom d'un compte). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
@Controller('importer')
export class ImporterController {
  constructor(private importer: ImporterService, private audit: AuditService) {}

  @Get('sources')
  list() {
    return this.importer.list();
  }

  /** Statistiques internes du robot « Seeduction » (le compte qui publie les torrents importés). */
  @Get('bot')
  bot() {
    return this.importer.botStats();
  }

  @Get('status')
  status() {
    return this.importer.status();
  }

  @Post('sources')
  async create(@Body() body: any, @Request() req: any) {
    assertMaster(req);
    const r = await this.importer.create(accountOf(req), body);
    await this.audit.log(req.user.userId, 'IMPORT_SOURCE_CREATE', { name: r.name });
    return r;
  }

  @Patch('sources/:id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    assertMaster(req);
    const r = await this.importer.update(id, body);
    await this.audit.log(req.user.userId, 'IMPORT_SOURCE_UPDATE', { id, name: r.name, enabled: r.enabled });
    return r;
  }

  @Delete('sources/:id')
  async remove(@Param('id') id: string, @Request() req: any) {
    assertMaster(req);
    const r = await this.importer.remove(id);
    await this.audit.log(req.user.userId, 'IMPORT_SOURCE_DELETE', { id });
    return r;
  }

  @Post('sources/:id/inspect')
  inspect(@Param('id') id: string) {
    return this.importer.inspect(id);
  }

  @Post('sources/:id/run')
  run(@Param('id') id: string, @Body() body: { dryRun?: boolean }) {
    return this.importer.start(id, !!body?.dryRun);
  }

  @Get('sources/:id/items')
  items(@Param('id') id: string, @Query('status') status?: string) {
    return this.importer.items(id, status);
  }

  @Post('items/:id/retry')
  retry(@Param('id') id: string) {
    return this.importer.retryItem(id);
  }

  @Get('events')
  events(@Query('sourceId') sourceId?: string, @Query('limit') limit?: string) {
    return this.importer.events(sourceId, limit ? Number(limit) : 100);
  }
}
