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

  /** Lance le test de la source en arrière-plan (réponse immédiate) ; le résultat se lit avec GET. */
  @Post('sources/:id/inspect')
  inspect(@Param('id') id: string) {
    return this.importer.startInspect(id);
  }

  @Get('sources/:id/inspect')
  inspectResult(@Param('id') id: string) {
    return this.importer.getInspect(id);
  }

  /** Cherche la langue des torrents importés qui n'en ont pas (arrière-plan) ; l'avancement se lit avec GET. */
  @Post('fix-languages')
  fixLanguages() {
    return this.importer.startLanguageFix();
  }

  @Get('fix-languages')
  fixLanguagesStatus() {
    return this.importer.getLanguageFix();
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

  /** Interférences en cours (même release déjà sur Seeduction), toutes sources confondues. */
  @Get('conflicts')
  conflicts() {
    return this.importer.conflicts();
  }

  /** « À vérifier » : sous-catégories et types de fiches disponibles. */
  @Get('review-options')
  reviewOptions() {
    return this.importer.reviewOptions();
  }

  /** « À vérifier » : recherche manuelle d'une fiche (TMDB, Deezer, livres, RAWG). */
  @Get('search')
  search(@Query('kind') kind: string, @Query('q') q: string, @Query('year') year?: string) {
    return this.importer.searchFiche(kind, String(q ?? '').trim(), year);
  }

  /** « À vérifier » : valide la release avec la catégorie et la fiche choisies (ou sans fiche) ; l'envoi se fait en arrière-plan. */
  @Post('items/:id/approve')
  approve(@Param('id') id: string, @Body() body: any) {
    return this.importer.approveItem(id, body);
  }

  @Post('items/:id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.importer.dismissItem(id);
  }

  /** Choix mémorisés (« À vérifier » > se souvenir) : la prochaine release qui ressemble est rangée toute seule. */
  @Get('memory')
  memory() {
    return this.importer.memory();
  }

  @Delete('memory/:id')
  async forget(@Param('id') id: string, @Request() req: any) {
    assertMaster(req);
    const r = await this.importer.forget(id);
    await this.audit.log(req.user.userId, 'IMPORT_MEMORY_FORGET', { id });
    return r;
  }

  /** Choix appris des membres au fil des acceptations (poids) : ce qui est suggéré ou rangé tout seul. */
  @Get('member-choices')
  memberChoices() {
    return this.importer.memberChoices();
  }

  @Delete('member-choices/:id')
  async forgetMemberChoice(@Param('id') id: string, @Request() req: any) {
    assertMaster(req);
    const r = await this.importer.forgetMemberChoice(id);
    await this.audit.log(req.user.userId, 'IMPORT_MEMBER_CHOICE_FORGET', { id });
    return r;
  }

  @Get('events')
  events(@Query('sourceId') sourceId?: string, @Query('limit') limit?: string) {
    return this.importer.events(sourceId, limit ? Number(limit) : 100);
  }
}
