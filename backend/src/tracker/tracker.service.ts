import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PeerEvent } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { ANNOUNCE_INTERVAL_SECONDS, ECONOMY } from '../common/utils/economy';

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

const ANNOUNCE_INTERVAL = ANNOUNCE_INTERVAL_SECONDS; // 30 min — cadence conseillée aux clients

@Injectable()
export class TrackerService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  /**
   * Suivi du seed pour la règle « hit & run » : cumule le temps passé à seeder
   * un torrent complété, et le déclare « régularisé » dès que le temps requis ou
   * le ratio d'upload sur ce torrent est atteint.
   */
  private async trackSeeding(userId: string, torrent: { id: string; size: bigint }, uploadedThisSession: number) {
    const snatch = await this.prisma.snatch.findFirst({
      where: { userId, torrentId: torrent.id, satisfied: false },
      orderBy: { completedAt: 'desc' },
    });
    if (!snatch) return;

    const now = new Date();
    const since = snatch.lastSeedAt ?? snatch.completedAt;
    // Plafonné : un client qui reste silencieux ne doit pas cumuler du temps qu'il n'a pas seedé.
    const elapsed = Math.min(Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000)), ANNOUNCE_INTERVAL * 2);
    const seedSeconds = snatch.seedSeconds + elapsed;
    const ratioReached = Number(torrent.size) > 0 && uploadedThisSession / Number(torrent.size) >= ECONOMY.hnrRatio;
    const satisfied = seedSeconds >= ECONOMY.hnrSeedHours * 3600 || ratioReached;

    await this.prisma.snatch.update({ where: { id: snatch.id }, data: { seedSeconds, lastSeedAt: now, satisfied } });
  }

  async announce(params: AnnounceParams) {
    const user = await this.prisma.user.findUnique({ where: { passkey: params.passkey } });
    if (!user) throw new ForbiddenException('Passkey invalide');
    if (user.status === 'BANNED') throw new ForbiddenException('Compte banni');

    const torrent = await this.prisma.torrent.findUnique({ where: { infoHash: params.infoHash } });
    if (!torrent) throw new NotFoundException('Torrent inconnu de ce tracker');

    // Freeleech : sur ce torrent, pour tout le site (événement), ou par jeton personnel.
    const [globalFreeleech, personal] = await Promise.all([
      this.settings.freeleechUntil(),
      this.prisma.personalFreeleech.findUnique({ where: { userId_torrentId: { userId: user.id, torrentId: torrent.id } } }),
    ]);
    const isFree = torrent.freeleech || !!globalFreeleech || (!!personal && personal.expiresAt > new Date());

    const isDownloading = params.left > 0;
    if (isDownloading && !isFree) {
      // Enforcement ratio minimum : bloque le download (pas le seed) si ratio trop bas,
      // sauf pour les nouveaux membres qui n'ont pas encore téléchargé le volume de grâce.
      const graceBytes = BigInt(Math.round(ECONOMY.ratioGraceGb * 1e9));
      const ratio = user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : Infinity;
      if (user.downloaded > graceBytes && ratio < user.minRatio) {
        throw new ForbiddenException(`Ratio insuffisant (${ratio.toFixed(2)} < ${user.minRatio})`);
      }
    }
    // Trop de « hit & run » non régularisés : plus de nouveaux téléchargements tant que ce n'est pas réglé.
    if (isDownloading && params.event === 'started') {
      const unresolved = await this.prisma.snatch.count({ where: { userId: user.id, hnr: true, satisfied: false } });
      if (unresolved >= ECONOMY.hnrLimit) {
        throw new ForbiddenException(`${unresolved} torrents complétés ont été abandonnés trop tôt : reprends leur seed (voir ton profil) pour débloquer les téléchargements`);
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

    // Crédite le user + garde une trace pour les snapshots de ratio (un téléchargement freeleech ne compte pas).
    const creditedDown = isFree ? 0n : deltaDown;
    if (deltaUp > 0n || deltaDown > 0n) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          uploaded: { increment: creditedUp },
          downloaded: { increment: creditedDown },
          lastSeenAt: new Date(),
          lastIp: params.ip,
        },
      });
    }

    if (params.event === 'completed') {
      await this.prisma.snatch.create({ data: { torrentId: torrent.id, userId: user.id, lastSeedAt: new Date() } });
      await this.prisma.torrent.update({
        where: { id: torrent.id },
        data: { completedCount: { increment: 1 } },
      });
    }

    if (params.left === 0) await this.trackSeeding(user.id, torrent, params.uploaded);

    // Recalcule seeders/leechers du torrent
    const [seeders, leechers] = await Promise.all([
      this.prisma.peer.count({ where: { torrentId: torrent.id, isSeeder: true } }),
      this.prisma.peer.count({ where: { torrentId: torrent.id, isSeeder: false } }),
    ]);
    // Un torrent marqué « mort » revient dès qu'il a de nouveau un seeder.
    await this.prisma.torrent.update({ where: { id: torrent.id }, data: { seeders, leechers, ...(torrent.status === 'DEAD' && seeders > 0 ? { status: 'APPROVED' as const } : {}) } });

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
