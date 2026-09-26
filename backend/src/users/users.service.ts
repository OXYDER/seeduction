import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PresenceStatus, DmPrivacy } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { PresenceService } from '../presence/presence.service';

const PRESENCE_VALUES: PresenceStatus[] = ['ONLINE', 'AWAY', 'BUSY', 'INVISIBLE'];
const DM_PRIVACY_VALUES: DmPrivacy[] = ['EVERYONE', 'FRIENDS_ONLY'];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private friends: FriendsService, private presence: PresenceService) {}

  /**
   * Profil complet pour soi-même ; le staff voit en plus l'e-mail ; les autres
   * n'ont que les infos publiques (jamais la passkey ni l'e-mail).
   */
  async getProfile(userId: string, viewer?: { userId: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, role: true, uploaded: true,
        downloaded: true, bonusPoints: true, minRatio: true, createdAt: true,
        lastSeenAt: true, passkey: true, status: true, memberClass: true, avatarUrl: true, signature: true, showAdult: true,
        presenceStatus: true, dmPrivacy: true, statusText: true, freeleechUntil: true,
        watchingTitle: true, watchingUntil: true, showWatchingStatus: true,
        _count: { select: { torrentsUploaded: true, invitees: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const ratio = user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : null;
    const isSelf = viewer?.userId === user.id;
    const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '');
    const { email, passkey, minRatio, showAdult, presenceStatus, dmPrivacy, freeleechUntil, watchingTitle, watchingUntil, showWatchingStatus, ...publicInfo } = user;
    const friend = viewer && !isSelf ? await this.friends.statusWith(viewer.userId, user.id) : undefined;
    const activeFreeleechUntil = freeleechUntil && freeleechUntil > new Date() ? freeleechUntil : null;
    const onlineStatus = this.presence.publicStatus(user.id);
    // Ce qu'on regarde en ce moment ne s'affiche que si le membre n'apparaît pas hors ligne (ça reviendrait à
    // trahir un statut "invisible" volontairement choisi) et que watchingUntil n'a pas expiré.
    const watching = onlineStatus !== 'OFFLINE' && watchingUntil && watchingUntil > new Date() ? watchingTitle : null;
    return {
      ...publicInfo,
      ratio,
      watching,
      // « onlineStatus » est ce que voient les autres (ONLINE/AWAY/BUSY/OFFLINE, jamais INVISIBLE tel quel) ;
      // « presenceStatus » (préférence brute, y compris INVISIBLE) et « dmPrivacy » ne sont renvoyés qu'à l'intéressé.
      onlineStatus,
      ...(friend ? { friendStatus: friend.status, friendshipId: friend.friendshipId } : {}),
      ...(isSelf ? { email, passkey, minRatio, showAdult, presenceStatus, dmPrivacy, freeleechUntil: activeFreeleechUntil, showWatchingStatus } : {}),
      ...(isStaff && !isSelf ? { email } : {}),
    };
  }

  /** Qui peut écrire au membre en chat privé sans être son ami (tout le monde par défaut, comme une demande de message Messenger). */
  async setDmPrivacy(userId: string, value: string) {
    if (!DM_PRIVACY_VALUES.includes(value as DmPrivacy)) throw new BadRequestException('Valeur invalide');
    await this.prisma.user.update({ where: { id: userId }, data: { dmPrivacy: value as DmPrivacy } });
    return { dmPrivacy: value };
  }

  /** Afficher ou non « en train de regarder X » (voir StreamService.pingWatching) quand le lecteur desktop tourne. */
  async setShowWatchingStatus(userId: string, enabled: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { showWatchingStatus: !!enabled, ...(enabled ? {} : { watchingTitle: null, watchingUntil: null }) } });
    return { showWatchingStatus: !!enabled };
  }

  /**
   * Statut de présence choisi (En ligne / Absent / Occupé / Apparaître hors ligne), visible partout où le membre
   * apparaît, avec un petit message libre optionnel (ex. « En vacances jusqu'au 5 ») affiché à côté.
   */
  async setPresenceStatus(userId: string, status: string, statusText?: string | null) {
    if (!PRESENCE_VALUES.includes(status as PresenceStatus)) throw new BadRequestException('Statut invalide');
    const text = typeof statusText === 'string' ? statusText.trim().slice(0, 100) || null : undefined;
    await this.prisma.user.update({ where: { id: userId }, data: { presenceStatus: status as PresenceStatus, ...(text !== undefined ? { statusText: text } : {}) } });
    this.presence.setPreference(userId, status as PresenceStatus);
    return { presenceStatus: status, ...(text !== undefined ? { statusText: text } : {}) };
  }

  /** Avatar (image téléversée sur Seeduction, jamais un lien externe) et signature affichée sous les messages du forum. */
  async updateProfile(userId: string, data: { avatarUrl?: string | null; signature?: string | null }) {
    const payload: { avatarUrl?: string | null; signature?: string | null } = {};
    if (data.avatarUrl !== undefined) {
      if (data.avatarUrl && !/^\/api\/covers\/[\w.-]+$/.test(data.avatarUrl)) {
        throw new BadRequestException("L'avatar doit être une image téléversée sur Seeduction");
      }
      payload.avatarUrl = data.avatarUrl || null;
    }
    if (data.signature !== undefined) {
      const signature = (data.signature ?? '').trim();
      if (signature.length > 500) throw new BadRequestException('Signature trop longue (500 caractères maximum)');
      payload.signature = signature || null;
    }
    if (Object.keys(payload).length === 0) throw new BadRequestException('Aucune modification');
    await this.prisma.user.update({ where: { id: userId }, data: payload });
    return payload;
  }

  /** Affichage du contenu pour adultes : désactivé par défaut, à activer explicitement (avec confirmation d'âge). */
  async setAdultPreference(userId: string, enabled: boolean, confirmAge: boolean) {
    if (enabled && !confirmAge) throw new BadRequestException('Tu dois confirmer avoir 18 ans ou plus pour afficher ce contenu');
    await this.prisma.user.update({
      where: { id: userId },
      data: enabled ? { showAdult: true, adultAcceptedAt: new Date() } : { showAdult: false },
    });
    return { showAdult: enabled };
  }

  async getRatioHistory(userId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    return this.prisma.ratioSnapshot.findMany({
      where: { userId, takenAt: { gte: since } },
      orderBy: { takenAt: 'asc' },
    });
  }

  async leaderboard(limit = 50) {
    const users = await this.prisma.user.findMany({
      orderBy: { uploaded: 'desc' },
      take: limit,
      select: { id: true, username: true, uploaded: true, downloaded: true, bonusPoints: true },
    });
    return users.map((u) => ({
      ...u,
      ratio: u.downloaded > 0n ? Number(u.uploaded) / Number(u.downloaded) : null,
    }));
  }

  /** Job périodique (cron) à appeler pour figer un snapshot de ratio par user. */
  async snapshotAllRatios() {
    const users = await this.prisma.user.findMany({ select: { id: true, uploaded: true, downloaded: true } });
    await this.prisma.ratioSnapshot.createMany({
      data: users.map((u) => ({ userId: u.id, uploaded: u.uploaded, downloaded: u.downloaded })),
    });
  }
}
