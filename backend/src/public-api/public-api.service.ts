import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { TorrentsService } from '../torrents/torrents.service';
import { TrustedUploadersService } from '../admin/trusted-uploaders.service';
import { NFO_REQUIRED_MESSAGE, hasEnoughNfo, uploadParamsFromBody } from '../torrents/upload-params';

/** Un .nfo est en UTF-8 ou, pour les anciens, en CP437 / latin1. */
function decodeNfo(buf: Buffer): string {
  const u = buf.toString('utf8');
  return u.includes('�') ? buf.toString('latin1') : u;
}

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBytes(bytes: bigint | number) {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
  let n = Number(bytes), i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(2)} ${units[i]}`;
}

const TORRENT_LIST_SELECT = {
  id: true,
  name: true,
  size: true,
  seeders: true,
  leechers: true,
  createdAt: true,
  year: true,
  resolution: true,
  language: true,
  category: { select: { name: true, slug: true } },
};

@Injectable()
export class PublicApiService {
  constructor(private prisma: PrismaService, private adult: AdultService, private torrents: TorrentsService, private trusted: TrustedUploadersService) {}

  /** Les catégories d'envoi, avec leur parent : de quoi choisir `categoryId` (ou `category`, le nom ou le slug) à l'envoi. Le contenu adulte n'est pas listé. */
  async listCategories() {
    const hidden = await this.adult.adultCategoryIds();
    const rows = await this.prisma.category.findMany({ where: hidden.length ? { id: { notIn: hidden } } : {}, select: { id: true, name: true, slug: true, parentId: true }, orderBy: { name: 'asc' } });
    const parents = new Set(rows.map((r) => r.parentId).filter(Boolean));
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, parentId: r.parentId, /** Une sous-catégorie (sans enfant) : c'est celle qu'on choisit pour un envoi. */ leaf: !parents.has(r.id) }));
  }

  /** Une catégorie par identifiant, slug ou nom (sans tenir compte de la casse). */
  private async resolveCategory(body: Record<string, string>): Promise<string> {
    if (body.categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } });
      if (!c) throw new BadRequestException(`Catégorie inconnue : ${body.categoryId} (voir GET /api/public/categories)`);
      return c.id;
    }
    const wanted = (body.category ?? '').trim();
    if (!wanted) throw new BadRequestException('Catégorie manquante : envoie `categoryId` ou `category` (nom ou slug ; voir GET /api/public/categories)');
    const c = await this.prisma.category.findFirst({ where: { OR: [{ slug: { equals: wanted, mode: 'insensitive' } }, { name: { equals: wanted, mode: 'insensitive' } }] }, select: { id: true } });
    if (!c) throw new BadRequestException(`Catégorie inconnue : « ${wanted} » (voir GET /api/public/categories)`);
    return c.id;
  }

  /**
   * Envoi d'un torrent par l'API (clé avec la portée « torrents:upload ») : exactement le même traitement que le formulaire du site (nettoyage du .torrent, détection des filtres, modération,
   * approbation automatique d'un Uploadeur). Le compte doit être actif.
   */
  async uploadTorrent(userId: string, file: Express.Multer.File | undefined, nfoFile: Express.Multer.File | undefined, body: Record<string, string>, baseUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException("Ce compte ne peut pas envoyer de torrent pour l'instant.");
    if (!file?.buffer?.length) throw new BadRequestException('Fichier .torrent manquant : envoie-le dans le champ `torrentFile` (multipart/form-data).');
    if (!body.name?.trim()) throw new BadRequestException('Nom manquant : champ `name`.');
    const nfo = body.nfo?.trim() ? body.nfo : nfoFile ? decodeNfo(nfoFile.buffer) : '';
    if (!hasEnoughNfo(nfo)) throw new BadRequestException(NFO_REQUIRED_MESSAGE.replace('ajoute le fichier .nfo ou colle le texte du MediaInfo', 'envoie-le dans le champ `nfo` (texte) ou `nfoFile` (fichier)'));
    const categoryId = await this.resolveCategory(body);
    const created = await this.torrents.upload(uploadParamsFromBody(userId, file.buffer, { ...body, nfo }, categoryId));
    const approved = await this.trusted.autoApproveIfTrusted(userId, created.id);
    return {
      id: created.id, name: created.name, infoHash: (created as any).infoHash ?? null, status: approved ? 'APPROVED' : created.status,
      url: `${baseUrl.replace(/\/$/, '')}/torrents/${created.id}`,
      message: approved ? 'Torrent approuvé tout de suite.' : "Torrent reçu : il est en attente de validation par l'équipe.",
    };
  }

  async listTorrents(params: { search?: string; categoryId?: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const hidden = await this.adult.adultCategoryIds(); // l'API publique et le flux RSS n'exposent jamais le contenu adulte
    return this.prisma.torrent.findMany({
      where: {
        status: 'APPROVED',
        ...(hidden.length ? { categoryId: { notIn: hidden } } : {}),
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params.search ? { name: { contains: params.search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: TORRENT_LIST_SELECT,
    });
  }

  async torrentDetail(id: string) {
    const hidden = await this.adult.adultCategoryIds();
    const torrent = await this.prisma.torrent.findFirst({
      where: { id, status: 'APPROVED', ...(hidden.length ? { categoryId: { notIn: hidden } } : {}) },
      select: {
        id: true, name: true, description: true, size: true, seeders: true, leechers: true,
        completedCount: true, createdAt: true, tags: true,
        year: true, resolution: true, codec: true, hdr: true, audio: true, source: true, containerFormat: true,
        category: { select: { name: true, slug: true } },
      },
    });
    if (!torrent) throw new NotFoundException('Torrent introuvable ou non approuvé');
    return torrent;
  }

  async meStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true, uploaded: true, downloaded: true, bonusPoints: true, createdAt: true,
        _count: { select: { torrentsUploaded: true, invitees: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return { ...user, ratio: user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : null };
  }

  async globalStats() {
    const [totalUsers, totalTorrents, totalSeeders, totalLeechers] = await Promise.all([
      this.prisma.user.count({ where: { profileType: { not: 'BOT' }, deletedAt: null } }),
      this.prisma.torrent.count({ where: { status: 'APPROVED' } }),
      this.prisma.peer.count({ where: { isSeeder: true } }),
      this.prisma.peer.count({ where: { isSeeder: false } }),
    ]);
    return { totalUsers, totalTorrents, totalSeeders, totalLeechers };
  }

  async rssFeed(params: { categoryId?: string; limit?: number }, baseUrl: string) {
    const torrents = await this.listTorrents({ categoryId: params.categoryId, limit: params.limit ?? 25 });
    const items = torrents
      .map(
        (t) => `
    <item>
      <title>${escapeXml(t.name)}</title>
      <link>${baseUrl}/torrents/${t.id}</link>
      <guid isPermaLink="false">${t.id}</guid>
      <pubDate>${new Date(t.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(`${t.category?.name ?? ''} — ${formatBytes(t.size)}`)}</description>
    </item>`,
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Seeduction — Derniers torrents</title>
    <link>${baseUrl}</link>
    <description>Flux RSS des derniers torrents approuvés sur Seeduction</description>${items}
  </channel>
</rss>`;
  }
}
