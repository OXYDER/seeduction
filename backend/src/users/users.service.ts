import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PresenceStatus, DmPrivacy } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { PresenceService } from '../presence/presence.service';
import { ALL_PERMS, permsOf, type Perms } from '../common/utils/family-perms';
import { COLORED_CLASSES, COLORED_ROLES, rankKeyOf } from '../common/utils/rank';

const PRESENCE_VALUES: PresenceStatus[] = ['ONLINE', 'AWAY', 'BUSY', 'INVISIBLE'];
const DM_PRIVACY_VALUES: DmPrivacy[] = ['EVERYONE', 'FRIENDS_ONLY'];
const VIEW_VALUES = ['list', 'comfortable', 'details', 'grid', 'posters', 'compact', 'grouped'];
const TIP_STYLES = ['poster', 'classic', 'cinema', 'minimal', 'off'];

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
        watchingTitle: true, watchingUntil: true, showWatchingStatus: true, defaultView: true, chatBubbles: true, goalSound: true, tipStyle: true,
        parentId: true, profileName: true, profileType: true, profilePerms: true, familyEnabled: true, deletedAt: true,
        _count: { select: { torrentsUploaded: true, invitees: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    // Compte famille : un profil montre les chiffres de son compte (ratio, upload, points, rang...), avec le nom du compte à côté.
    let profile: { name: string; perms: Perms; account: string; accountId: string; isMaster: boolean } | null = null;
    if (user.parentId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: user.parentId },
        select: { id: true, username: true, uploaded: true, downloaded: true, bonusPoints: true, minRatio: true, memberClass: true, freeleechUntil: true, createdAt: true, _count: { select: { torrentsUploaded: true, invitees: true } } },
      });
      if (owner) {
        profile = { name: user.profileName ?? user.username, perms: permsOf(user), account: owner.username, accountId: owner.id, isMaster: false };
        Object.assign(user, { uploaded: owner.uploaded, downloaded: owner.downloaded, bonusPoints: owner.bonusPoints, minRatio: owner.minRatio, memberClass: owner.memberClass, freeleechUntil: owner.freeleechUntil, createdAt: owner.createdAt, _count: owner._count });
      }
      user.email = '';
      user.passkey = '';
    } else if (user.familyEnabled) {
      profile = { name: user.username, perms: ALL_PERMS, account: user.username, accountId: user.id, isMaster: true };
    }

    const isStaff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(viewer?.role ?? '');
    // Le robot « Seeduction » n'est pas un membre : aucune statistique publique (le staff les voit dans Admin > Import).
    if (user.profileType === 'BOT' && !isStaff) Object.assign(user, { uploaded: 0n, downloaded: 0n, bonusPoints: 0 });
    const ratio = user.downloaded > 0n ? Number(user.uploaded) / Number(user.downloaded) : null;
    const isSelf = viewer?.userId === user.id;
    const { email, passkey, minRatio, showAdult, presenceStatus, dmPrivacy, freeleechUntil, watchingTitle, watchingUntil, showWatchingStatus, defaultView, chatBubbles, goalSound, tipStyle, parentId, profileName, profileType, profilePerms, familyEnabled, ...publicInfo } = user;
    const friend = viewer && !isSelf ? await this.friends.statusWith(viewer.userId, user.id) : undefined;
    const activeFreeleechUntil = freeleechUntil && freeleechUntil > new Date() ? freeleechUntil : null;
    const onlineStatus = this.presence.publicStatus(user.id);
    // Ce qu'on regarde en ce moment ne s'affiche que si le membre n'apparaît pas hors ligne (ça reviendrait à
    // trahir un statut "invisible" volontairement choisi) et que watchingUntil n'a pas expiré.
    const watching = onlineStatus !== 'OFFLINE' && watchingUntil && watchingUntil > new Date() ? watchingTitle : null;
    const teamRow = await this.prisma.teamMember.findFirst({ where: { userId: user.parentId ?? user.id }, include: { team: { select: { id: true, name: true, tag: true } } } });
    return {
      ...publicInfo,
      ...(teamRow ? { team: { ...teamRow.team, role: teamRow.role } } : {}),
      ...(profile ? { profile } : {}),
      ratio,
      watching,
      deleted: !!user.deletedAt,
      // « onlineStatus » est ce que voient les autres (ONLINE/AWAY/BUSY/OFFLINE, jamais INVISIBLE tel quel) ;
      // « presenceStatus » (préférence brute, y compris INVISIBLE) et « dmPrivacy » ne sont renvoyés qu'à l'intéressé.
      onlineStatus,
      ...(friend ? { friendStatus: friend.status, friendshipId: friend.friendshipId } : {}),
      ...(isSelf ? { email, passkey, minRatio, showAdult, presenceStatus, dmPrivacy, freeleechUntil: activeFreeleechUntil, showWatchingStatus, defaultView, chatBubbles, goalSound, tipStyle } : {}),
      ...(isStaff && !isSelf ? { email } : {}),
    };
  }

  /** Qui peut écrire au membre en chat privé sans être son ami (tout le monde par défaut, comme une demande de message Messenger). */
  async setDmPrivacy(userId: string, value: string) {
    if (!DM_PRIVACY_VALUES.includes(value as DmPrivacy)) throw new BadRequestException('Valeur invalide');
    await this.prisma.user.update({ where: { id: userId }, data: { dmPrivacy: value as DmPrivacy } });
    return { dmPrivacy: value };
  }

  /** Affichage par défaut des listes de torrents (chaque page peut ensuite être changée ponctuellement par le membre). */
  async setDefaultView(userId: string, view: string) {
    if (!VIEW_VALUES.includes(view)) throw new BadRequestException('Affichage inconnu');
    await this.prisma.user.update({ where: { id: userId }, data: { defaultView: view } });
    return { defaultView: view };
  }

  /** Sirène de but du Canadien : activée ou non pour ce membre (le réglage suit son compte). */
  async setGoalSound(userId: string, enabled: unknown) {
    const value = enabled === true || enabled === 'true';
    await this.prisma.user.update({ where: { id: userId }, data: { goalSound: value } });
    return { goalSound: value };
  }

  /** Bulles de discussion sur le côté gauche du site : activées ou non pour ce membre. */
  async setChatBubbles(userId: string, enabled: unknown) {
    const value = enabled === true || enabled === 'true';
    await this.prisma.user.update({ where: { id: userId }, data: { chatBubbles: value } });
    return { chatBubbles: value };
  }

  /** Membre (compte principal) d'après son pseudo, sans tenir compte de la casse. */
  async findByName(username: string) {
    const u = await this.prisma.user.findFirst({ where: { username: { equals: String(username ?? '').trim().slice(0, 50), mode: 'insensitive' }, parentId: null }, select: { id: true, username: true } });
    if (!u) throw new NotFoundException('Membre introuvable');
    return u;
  }

  /** Jusqu'à 8 pseudos qui commencent par ce texte (puis qui le contiennent), pour l'autocomplétion des @mentions. */
  async mentionSearch(q: string) {
    const text = String(q ?? '').trim().slice(0, 30);
    const where = { parentId: null, status: 'ACTIVE' as const };
    const starts = await this.prisma.user.findMany({ where: { ...where, username: { startsWith: text, mode: 'insensitive' } }, select: { id: true, username: true, avatarUrl: true }, orderBy: { username: 'asc' }, take: 8 });
    if (starts.length >= 8 || text.length < 2) return starts;
    const more = await this.prisma.user.findMany({ where: { ...where, username: { contains: text, mode: 'insensitive' }, id: { notIn: starts.map((s) => s.id) } }, select: { id: true, username: true, avatarUrl: true }, orderBy: { username: 'asc' }, take: 8 - starts.length });
    return [...starts, ...more];
  }

  /** Style des info-bulles de torrents (ou « off » pour les désactiver). */
  async setTipStyle(userId: string, style: string) {
    if (!TIP_STYLES.includes(style)) throw new BadRequestException('Style inconnu');
    await this.prisma.user.update({ where: { id: userId }, data: { tipStyle: style } });
    return { tipStyle: style };
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
    // « null » ou une chaîne vide efface le message ; « undefined » (champ absent) le laisse tel quel.
    const text = typeof statusText === 'string' ? statusText.trim().slice(0, 100) || null : statusText === null ? null : undefined;
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

  private rankCache: { at: number; value: { byId: Record<string, string[]>; byName: Record<string, string[]> } } | null = null;
  /** Rang coloré → identifiants des membres (staff, Uploadeur, Power User, Élite, Vétéran) : sert à colorer les pseudos partout, sans alourdir chaque réponse. Mis en cache une minute. */
  async rankColors(): Promise<{ byId: Record<string, string[]>; byName: Record<string, string[]> }> {
    if (this.rankCache && Date.now() - this.rankCache.at < 60_000) return this.rankCache.value;
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null, status: { not: 'DISABLED' }, OR: [{ role: { in: COLORED_ROLES as any } }, { memberClass: { in: COLORED_CLASSES as any } }] },
      select: { id: true, username: true, role: true, memberClass: true },
    });
    // Par identifiant (partout où on a le membre) et par pseudo en minuscules (classements et listes qui ne donnent que le pseudo).
    const value = { byId: {} as Record<string, string[]>, byName: {} as Record<string, string[]> };
    for (const u of rows) {
      const key = rankKeyOf(u.role, u.memberClass);
      if (!key) continue;
      (value.byId[key] ??= []).push(u.id);
      (value.byName[key] ??= []).push(u.username.toLowerCase());
    }
    this.rankCache = { at: Date.now(), value };
    return value;
  }

  /** Identifiants des comptes supprimés (le pseudo reste affiché avec une petite icône) : liste courte, sans aucune donnée personnelle. */
  async deletedIds(): Promise<string[]> {
    return (await this.prisma.user.findMany({ where: { deletedAt: { not: null } }, select: { id: true }, take: 5000 })).map((u) => u.id);
  }

  async leaderboard(limit = 50) {
    const users = await this.prisma.user.findMany({
      where: { parentId: null },
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
    const users = await this.prisma.user.findMany({ where: { parentId: null }, select: { id: true, uploaded: true, downloaded: true } });
    await this.prisma.ratioSnapshot.createMany({
      data: users.map((u) => ({ userId: u.id, uploaded: u.uploaded, downloaded: u.downloaded })),
    });
  }
}
