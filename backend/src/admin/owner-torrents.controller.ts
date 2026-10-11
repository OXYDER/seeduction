import { BadRequestException, Body, Controller, Delete, ForbiddenException, NotFoundException, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../common/prisma.service';
import { MetadataService } from '../metadata/metadata.service';
import { AuditService } from '../audit/audit.service';
import { accountOf, assertPerm } from '../common/utils/account';
import { AdminService } from './admin.service';

/**
 * L'envoyeur modifie ses propres torrents en entier (nom, catégorie, langue, fiche, pochette, présentation, NFO, caractéristiques...) pour corriger
 * toute erreur. Seuls restent réservés à l'équipe : freeleech, double upload et statut. Un torrent rejeté qui est corrigé repart en validation.
 * Chaque modification est inscrite dans le journal (Admin > Journal).
 */
@UseGuards(JwtAuthGuard)
@Controller('my-torrents')
export class OwnerTorrentsController {
  constructor(private admin: AdminService, private metadata: MetadataService, private prisma: PrismaService, private audit: AuditService) {}

  private async own(req: any, id: string) {
    assertPerm(req, 'upload');
    const t = await this.prisma.torrent.findUnique({ where: { id }, select: { id: true, name: true, uploaderId: true, status: true, categoryId: true } });
    if (!t) throw new NotFoundException('Torrent introuvable');
    if (t.uploaderId !== accountOf(req) && t.uploaderId !== req.user.userId) throw new ForbiddenException('Ce torrent ne t\'appartient pas');
    return t;
  }

  /** Un membre ne peut ranger un torrent dans une catégorie pour adultes que s'il a activé le contenu adulte. */
  private async assertAdultAllowed(req: any, categoryId: string, current: string) {
    if (categoryId === current) return;
    const c = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { adult: true, parent: { select: { adult: true } } } });
    if (!c) return; // « catégorie introuvable » est signalé par la mise à jour
    if (!(c.adult || c.parent?.adult)) return;
    const u = await this.prisma.user.findUnique({ where: { id: accountOf(req) }, select: { showAdult: true } });
    if (!u?.showAdult) throw new ForbiddenException('Active l\'affichage du contenu pour adultes dans ton profil pour choisir cette catégorie');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const t = await this.own(req, id);
    if (typeof body?.categoryId === 'string' && body.categoryId) await this.assertAdultAllowed(req, body.categoryId, t.categoryId);
    const result = await this.admin.updateTorrent(id, body ?? {}, { owner: true });
    let status = result.status;
    // Un torrent rejeté, une fois corrigé, repart en validation.
    if (t.status === 'REJECTED') status = (await this.prisma.torrent.update({ where: { id }, data: { status: 'PENDING' } })).status;
    await this.audit.log(req.user.userId, 'TORRENT_EDIT_OWNER', { torrentId: id, name: result.name, fields: Object.keys(body ?? {}).filter((k) => k !== 'nfo'), nfoChanged: typeof body?.nfo === 'string', resubmitted: t.status === 'REJECTED' }, req.ip ?? null);
    return { ...result, status, resubmitted: t.status === 'REJECTED' };
  }

  /** Change la fiche (TMDB, Deezer, livres, jeux...). */
  @Post(':id/metadata')
  async replaceMetadata(@Param('id') id: string, @Body() body: { kind?: string; id?: string; replaceCover?: boolean }, @Request() req: any) {
    await this.own(req, id);
    const result = await this.metadata.replaceFiche(id, String(body?.kind ?? ''), String(body?.id ?? ''), body?.replaceCover !== false);
    await this.audit.log(req.user.userId, 'TORRENT_EDIT_OWNER', { torrentId: id, fields: ['metadata'], kind: body?.kind, ficheId: body?.id }, req.ip ?? null);
    return result;
  }

  @Delete(':id/metadata')
  async clearMetadata(@Param('id') id: string, @Request() req: any) {
    await this.own(req, id);
    const result = await this.metadata.clearFiche(id);
    await this.audit.log(req.user.userId, 'TORRENT_EDIT_OWNER', { torrentId: id, fields: ['metadata'], cleared: true }, req.ip ?? null);
    return result;
  }

  /** Supprimer son torrent : seulement tant qu'il est en attente ou rejeté. Une fois en ligne, c'est l'équipe qui le retire. */
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    const t = await this.own(req, id);
    if (!['PENDING', 'REJECTED'].includes(t.status)) throw new BadRequestException('Ce torrent est en ligne : demande son retrait à l\'équipe (Support)');
    const result = await this.admin.deleteTorrent(id);
    await this.audit.log(req.user.userId, 'TORRENT_DELETE_OWNER', { torrentId: id, name: result.name }, req.ip ?? null);
    return result;
  }
}
