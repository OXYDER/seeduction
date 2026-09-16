import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PeerEvent } from '@prisma/client';

export interface AnnounceParams {
  infoHash: string;   // hex
  peerId: string;
  passkey: string;
  ip: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
  event?: 'started' | 'stopped' | 'completed';
  numwant?: number;
  compact?: boolean;
}

const EVENT_MAP: Record<string, PeerEvent> = {
  started: PeerEvent.STARTED,
  stopped: PeerEvent.STOPPED,
  completed: PeerEvent.COMPLETED,
};

const ANNOUNCE_INTERVAL = 1800; // 30 min — cadence conseillée aux clients

@Injectable()
export class TrackerService {
  constructor(private prisma: PrismaService) {}

  async announce(params: AnnounceParams) {
    const user = await this.prisma.user.findUnique({ where: { passkey: params.passkey } });
    if (!user) throw new ForbiddenException('Passkey invalide');
    if (user.status === 'BANNED') throw new ForbiddenException('Compte banni');

    const torrent = await this.prisma.torrent.findUnique({ where: { infoHash: params.infoHash } });
    if (!torrent) throw new NotFoundException('Torrent inconnu de ce tracker');

    // Enforcement ratio minimum : bloque le download (pas le seed) si ratio trop bas
    const isDownloading = params.left > 0;
    if (isDownloading && !torrent.freeleech) {
      const ratio = user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : Infinity;
      if (ratio < user.minRatio && user.downloaded > 0n) {
        throw new ForbiddenException(`Ratio insuffisant (${ratio.toFixed(2)} < ${user.minRatio})`);
      }
    }

    const existingPeer = await this.prisma.peer.findUnique({
      where: {
        torrentId_userId_peerId: {
          torrentId: torrent.id,
          userId: user.id,
          peerId: params.peerId,
        },
      },
    });

    // Delta = nouvelles données envoyées depuis le dernier announce (anti-cheat :
    // on ne fait jamais confiance aveuglément à un delta négatif ou aberrant)
    const prevUp = existingPeer?.uploaded ?? 0n;
    const prevDown = existingPeer?.downloaded ?? 0n;
    let deltaUp = BigInt(params.uploaded) - prevUp;
    let deltaDown = BigInt(params.downloaded) - prevDown;
    if (deltaUp < 0n) deltaUp = 0n; // client redémarré / reset -> ignore le delta négatif
    if (deltaDown < 0n) deltaDown = 0n;

    const multiplier = torrent.doubleUpload ? 2 : 1;
    const creditedUp = deltaUp * BigInt(multiplier);

    if (params.event === 'stopped') {
      if (existingPeer) {
        await this.prisma.peer.delete({ where: { id: existingPeer.id } });
      }
    } else {
      await this.prisma.peer.upsert({
        where: {
          torrentId_userId_peerId: {
            torrentId: torrent.id,
            userId: user.id,
            peerId: params.peerId,
          },
        },
        create: {
          torrentId: torrent.id,
          userId: user.id,
          peerId: params.peerId,
          ip: params.ip,
          port: params.port,
          uploaded: BigInt(params.uploaded),
          downloaded: BigInt(params.downloaded),
          left: BigInt(params.left),
          isSeeder: params.left === 0,
          lastEvent: EVENT_MAP[params.event ?? ''] ?? PeerEvent.NONE,
        },
        update: {
          ip: params.ip,
          port: params.port,
          uploaded: BigInt(params.uploaded),
          downloaded: BigInt(params.downloaded),
          left: BigInt(params.left),
          isSeeder: params.left === 0,
          lastEvent: EVENT_MAP[params.event ?? ''] ?? PeerEvent.NONE,
          lastAnnounceAt: new Date(),
        },
      });
    }

    // Crédite le user + garde une trace pour les snapshots de ratio
    if (deltaUp > 0n || deltaDown > 0n) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          uploaded: { increment: creditedUp },
          downloaded: { increment: deltaDown },
          lastSeenAt: new Date(),
          lastIp: params.ip,
        },
      });
    }

    if (params.event === 'completed') {
      await this.prisma.snatch.create({ data: { torrentId: torrent.id, userId: user.id } });
      await this.prisma.torrent.update({
        where: { id: torrent.id },
        data: { completedCount: { increment: 1 } },
      });
    }

    // Recalcule seeders/leechers du torrent
    const [seeders, leechers] = await Promise.all([
      this.prisma.peer.count({ where: { torrentId: torrent.id, isSeeder: true } }),
      this.prisma.peer.count({ where: { torrentId: torrent.id, isSeeder: false } }),
    ]);
    await this.prisma.torrent.update({ where: { id: torrent.id }, data: { seeders, leechers } });

    // Liste de peers à retourner (exclut le peer courant)
    const wanted = Math.min(params.numwant ?? 50, 100);
    const peers = await this.prisma.peer.findMany({
      where: { torrentId: torrent.id, NOT: { peerId: params.peerId } },
      take: wanted,
      select: { ip: true, port: true, peerId: true },
    });

    return {
      interval: ANNOUNCE_INTERVAL,
      minInterval: 900,
      complete: seeders,
      incomplete: leechers,
      peers,
    };
  }

  async scrape(infoHashes: string[]) {
    const torrents = await this.prisma.torrent.findMany({
      where: { infoHash: { in: infoHashes } },
      select: { infoHash: true, seeders: true, leechers: true, completedCount: true },
    });
    return torrents;
  }
}
