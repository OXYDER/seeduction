import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { parseTorrentFile, rewriteTorrentForUser } from '../common/utils/torrent-file';
import * as fs from 'fs/promises';
import * as path from 'path';

const STORAGE_DIR = process.env.TORRENT_STORAGE_DIR ?? './storage/torrents';
const ANNOUNCE_BASE_URL = process.env.ANNOUNCE_BASE_URL ?? 'https://tracker.example.com/tracker';

@Injectable()
export class TorrentsService {
  constructor(private prisma: PrismaService) {}

  async upload(params: {
    userId: string;
    fileBuffer: Buffer;
    name: string;
    description?: string;
    categoryId: string;
    tags: string[];
    anonymous: boolean;
  }) {
    const parsed = parseTorrentFile(params.fileBuffer);

    const existing = await this.prisma.torrent.findUnique({ where: { infoHash: parsed.infoHash } });
    if (existing) throw new BadRequestException('Ce torrent existe déjà sur le tracker (dupe)');

    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const storedPath = path.join(STORAGE_DIR, `${parsed.infoHash}.torrent`);
    await fs.writeFile(storedPath, params.fileBuffer);

    const torrent = await this.prisma.torrent.create({
      data: {
        infoHash: parsed.infoHash,
        name: params.name || parsed.name,
        description: params.description,
        filePath: storedPath,
        size: BigInt(parsed.totalSize),
        fileList: parsed.files,
        categoryId: params.categoryId,
        uploaderId: params.userId,
        anonymousUpload: params.anonymous,
        tags: params.tags,
      },
    });

    return torrent;
  }

  /** Génère à la volée le .torrent avec l'announce URL personnalisée (passkey) de l'utilisateur qui télécharge. */
  async getDownloadFile(torrentId: string, userId: string): Promise<Buffer> {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const original = await fs.readFile(torrent.filePath);
    const announceUrl = `${ANNOUNCE_BASE_URL}/${user.passkey}/announce`;
    return rewriteTorrentForUser(original, announceUrl);
  }

  async list(params: { categoryId?: string; search?: string; uploaderId?: string; page: number; pageSize: number }) {
    const where: any = { status: 'APPROVED' };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.uploaderId) where.uploaderId = params.uploaderId;

    const [items, total] = await Promise.all([
      this.prisma.torrent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { category: true, uploader: { select: { username: true } } },
      }),
      this.prisma.torrent.count({ where }),
    ]);

    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async findOne(id: string) {
    const torrent = await this.prisma.torrent.findUnique({
      where: { id },
      include: { category: true, uploader: { select: { username: true } } },
    });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    return torrent;
  }
}
