import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PeerEvent } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ANNOUNCE_INTERVAL_SECONDS, ECONOMY, reseedReward } from '../common/utils/economy';

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
  // Announce venant du lecteur Seeduction (desktop) plutôt que du navigateur : c'est un vrai client BitTorrent
  // (WebTorrent) qui continue de seeder après la lecture, donc il est soumis aux mêmes règles hit & run qu'un
  // téléchargement classique. Le flag sert uniquement à alimenter un compteur séparé pour les statistiques.
  viaStream?: boolean;
}

const EVENT_MAP: Record<string, PeerEvent> = {
  started: PeerEvent.STARTED,
  stopped: PeerEvent.STOPPED,
  completed: PeerEvent.COMPLETED,
};

const ANNOUNCE_INTERVAL = ANNOUNCE_INTERVAL_SECONDS; // 30 min — cadence conseillée aux clients

@Injectable()
export class TrackerService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService) {}

  /**
   * Récompense de reseed : calcul commun (base + par Go + par jour resté mort, plafonnés) et crédit, une fois la
   * condition remplie (voir confirmReseedReward / confirmLongSeedPendingRewards). Silencieuse en cas d'erreur : ça
   * ne doit jamais faire échouer un announce.
   */
  private async payReseedReward(torrent: { id: string; name: string; size: bigint; diedAt: Date | null }, userId: string) {
    try {
      if (!torrent.diedAt) return;
      const points = reseedReward(torrent.size, torrent.diedAt);
      if (points <= 0) return;
      await this.prisma.user.update({ where: { id: userId }, data: { bonusPoints: { increment: points } } });
      // Mémoire des réanimations (page « Réanimation » : héros du mois, torrents ressuscités récemment).
      await this.prisma.torrentRevival.create({ data: { torrentId: torrent.id, userId, points, deadDays: Math.round(((Date.now() - torrent.diedAt.getTime()) / 86400_000) * 10) / 10 } }).catch(() => {});
      await this.notifications.notify({
        userId,
        type: 'SYSTEM',
        title: 'Torrent ressuscité !',
        body: `Merci d'avoir remis « ${torrent.name} » en seed — ça a permis à quelqu'un de le télécharger : +${points} points bonus.`,
        link: `/torrents/${torrent.id}`,
      });
    } catch { /* un announce ne doit jamais échouer à cause de la récompense */ }
  }

  /**
   * Confirme (et crédite) une récompense de reseed en attente : un AUTRE membre vient de finir de télécharger ce
   * torrent, preuve que le reseed a vraiment servi à quelqu'un plutôt que d'être resté sans effet. `updateMany` avec
   * la valeur attendue de revivedByUserId dans le `where` sert de verrou optimiste : si deux téléchargements se
   * terminent presque en même temps, un seul des deux crédite (l'autre trouve `count: 0` et ne fait rien).
   */
  private async confirmReseedReward(torrent: { id: string; name: string; size: bigint; diedAt: Date | null }, revivedByUserId: string) {
    try {
      const cleared = await this.prisma.torrent.updateMany({
        where: { id: torrent.id, revivedByUserId },
        data: { revivedByUserId: null, revivedAt: null },
      });
      if (cleared.count === 0) return; // déjà traité (crédité ou expiré) entre-temps
      await this.payReseedReward(torrent, revivedByUserId);
    } catch { /* un announce ne doit jamais échouer à cause de la récompense */ }
  }

  /**
   * Appelé par EconomyService (cron) : confirme les récompenses en attente pour lesquelles personne d'autre n'a
   * encore fini de télécharger, mais où le releveur a tenu le seed assez longtemps tout seul (ECONOMY.hnrSeedHours,
   * le même seuil que pour le hit & run — une durée déjà considérée comme un engagement sérieux sur ce site) et
   * seed toujours activement au moment de la vérification.
   */
  async confirmLongSeedPendingRewards() {
    const cutoff = new Date(Date.now() - ECONOMY.hnrSeedHours * 3600_000);
    const pending = await this.prisma.torrent.findMany({
      where: { revivedByUserId: { not: null }, revivedAt: { lte: cutoff }, seeders: { gt: 0 } },
    });
    for (const t of pending) {
      if (!t.revivedByUserId) continue;
      const stillSeeding = await this.prisma.peer.findFirst({
        where: { torrentId: t.id, userId: t.revivedByUserId, isSeeder: true, lastAnnounceAt: { gte: new Date(Date.now() - 45 * 60_000) } },
      });
      if (!stillSeeding) continue; // pas confirmé cette fois — retentera plus tard, ou sera nettoyé s'il retombe à 0
      await this.confirmReseedReward(t, t.revivedByUserId);
    }
  }

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

    // Freeleech : sur ce torrent, pour tout le site (événement), par jeton personnel sur ce torrent précis, ou par
    // freeleech de compte (cadeau de bienvenue, récompense...) qui couvre tous les torrents jusqu'à une date.
    const [globalFreeleech, personal] = await Promise.all([
      this.settings.freeleechUntil(),
      this.prisma.personalFreeleech.findUnique({ where: { userId_torrentId: { userId: user.id, torrentId: torrent.id } } }),
    ]);
    const isFree = torrent.freeleech || !!globalFreeleech || (!!personal && personal.expiresAt > new Date())
      || (!!user.freeleechUntil && user.freeleechUntil > new Date());

    // Capturé avant toute écriture de cette requête (la création/mise à jour de Snatch plus bas mettrait sinon
    // toujours lastSeedAt à "maintenant", rendant ce test toujours vrai) : sert à décider, plus bas, si une
    // récompense de reseed doit être posée en attente quand ce torrent revient à la vie dans cet announce.
    const hadRecentSeedBeforeThisAnnounce = torrent.diedAt
      ? !!(await this.prisma.snatch.findFirst({
          where: {
            userId: user.id,
            torrentId: torrent.id,
            lastSeedAt: { gte: new Date(torrent.diedAt.getTime() - ECONOMY.reseedExclusionHours * 3600_000) },
          },
        }))
      : false;

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

    const multiplier = torrent.doubleUpload || (await this.settings.doubleUploadActive()) ? 2 : 1; // double upload du torrent, ou global (récompense du pot commun)
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
      // Le lecteur Seeduction est un vrai client BitTorrent qui continue de seeder après coup : un téléchargement
      // complété via le lecteur crée une obligation de seed normale, exactement comme n'importe quel client.
      await this.prisma.snatch.create({ data: { torrentId: torrent.id, userId: user.id, lastSeedAt: new Date() } });
      await this.prisma.torrent.update({
        where: { id: torrent.id },
        data: { completedCount: { increment: 1 }, ...(params.viaStream ? { streamCompletedCount: { increment: 1 } } : {}) },
      });
      // Un AUTRE membre vient de finir de télécharger ce torrent : si une récompense de reseed était en attente sur
      // lui (posée plus bas quand il est revenu à la vie), c'est la preuve que ça a vraiment servi — on la confirme.
      if (torrent.revivedByUserId && torrent.revivedByUserId !== user.id) {
        this.confirmReseedReward(torrent, torrent.revivedByUserId);
      }
    }

    if (params.left === 0) await this.trackSeeding(user.id, torrent, params.uploaded);

    // Recalcule seeders/leechers du torrent
    const [seeders, leechers] = await Promise.all([
      this.prisma.peer.count({ where: { torrentId: torrent.id, isSeeder: true } }),
      this.prisma.peer.count({ where: { torrentId: torrent.id, isSeeder: false } }),
    ]);
    const wasDead = torrent.status === 'DEAD';
    const revives = wasDead && seeders > 0;
    // Une récompense de reseed n'est posée que si ce membre ne seedait pas déjà avant la mort (voir plus haut) ;
    // `diedAt` reste renseigné tant qu'elle est en attente (confirmReseedReward / EconomyService en ont besoin pour
    // calculer le montant), et n'est remis à null que quand elle est tranchée (confirmée, payée, ou abandonnée).
    const marksPending = revives && !hadRecentSeedBeforeThisAnnounce;
    await this.prisma.torrent.update({
      where: { id: torrent.id },
      data: {
        seeders, leechers,
        // Un torrent marqué « mort » revient dès qu'il a de nouveau un seeder.
        ...(revives ? { status: 'APPROVED' as const } : {}),
        ...(marksPending ? { revivedByUserId: user.id, revivedAt: new Date() } : {}),
        ...(revives && !marksPending ? { diedAt: null } : {}), // relancé par celui qui l'a laissé mourir : rien à attendre
        // Suivi du délai de grâce avant DEAD (voir EconomyService.markDeadTorrents) : démarre dès que ça tombe à 0,
        // se réinitialise dès qu'un seeder revient. Si une récompense était en attente et que ça retombe à 0 avant
        // d'avoir été confirmée, le releveur a abandonné trop tôt : rien à payer, on efface l'attente.
        ...(seeders === 0 && torrent.seeders > 0 ? { zeroSeedersSince: new Date(), revivedByUserId: null, revivedAt: null, diedAt: null } : {}),
        ...(seeders > 0 ? { zeroSeedersSince: null } : {}),
      },
    });

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
