import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBytes(bytes: bigint | number) {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
  let n = Number(bytes), i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
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
  constructor(private prisma: PrismaService) {}

  listTorrents(params: { search?: string; categoryId?: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    return this.prisma.torrent.findMany({
      where: {
        status: 'APPROVED',
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params.search ? { name: { contains: params.search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: TORRENT_LIST_SELECT,
    });
  }

  async torrentDetail(id: string) {
    const torrent = await this.prisma.torrent.findFirst({
      where: { id, status: 'APPROVED' },
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
      this.prisma.user.count(),
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
