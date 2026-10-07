import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

/** Compte « fantôme » qui reprend le contenu public (torrents, messages du forum...) d'un membre supprimé. */
export const DELETED_USER_ID = '00000000-0000-4000-8000-00000000dead';
export const DELETED_USER_NAME = '[compte supprimé]';

/** Contenu que les autres membres voient et qui doit survivre : il passe au compte « supprimé » plutôt que de disparaître. */
const REASSIGN: [table: string, column: string][] = [
  ['Torrent', 'uploaderId'],
  ['TorrentComment', 'authorId'],
  ['TorrentRequest', 'requestedById'],
  ['ForumTopic', 'authorId'],
  ['ForumPost', 'authorId'],
  ['Announcement', 'authorId'],
  ['AnnouncementComment', 'authorId'],
  ['ChatMessage', 'userId'],
  ['Message', 'senderId'],
  ['PrivateMessage', 'senderId'],
  ['Report', 'reporterId'],
  ['InviteCode', 'createdById'],
];

/** Données personnelles à effacer (celles qui n'ont pas de clé étrangère en cascade, ou qui la bloquent). */
const ERASE: [table: string, column: string][] = [
  ['Peer', 'userId'],
  ['RatioSnapshot', 'userId'],
  ['Ban', 'userId'],
  ['Warning', 'userId'],
  ['AnnouncementReaction', 'userId'],
  ['AnnouncementView', 'userId'],
  ['MemberActivity', 'userId'],
  ['PersonalFreeleech', 'userId'],
  ['PlaybackPosition', 'userId'],
  ['Snatch', 'userId'],
  ['SupportChatEvent', 'userId'],
  ['TeamApplication', 'userId'],
  ['TeamMember', 'userId'],
  ['TorrentRevival', 'userId'],
  ['InviteUse', 'userId'],
  ['PasswordReset', 'userId'],
  ['EmailChallenge', 'userId'],
  ['ImportSource', 'uploaderId'], // les imports automatiques configurés au nom de ce compte (ses éléments partent en cascade)
  ['PrivateMessage', 'recipientId'], // les messages reçus n'avaient de sens que pour lui
];

/**
 * Suppression définitive d'un compte (et de ses profils famille). Tout ce qui est personnel disparaît ; ce que les autres
 * membres voient (torrents, commentaires, forum, messages de groupe...) reste, attribué au compte « [compte supprimé] ».
 * Le reste (favoris, amis, notifications, clés API, badges, liste de lecture...) part en cascade avec le compte.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private prisma: PrismaService) {}

  async ensureTombstone() {
    await this.prisma.user.upsert({
      where: { id: DELETED_USER_ID },
      update: { parentId: DELETED_USER_ID, profileType: 'BOT', profileBlocked: true },
      create: {
        id: DELETED_USER_ID,
        username: DELETED_USER_NAME,
        email: 'deleted@seeduction.invalid',
        passwordHash: '!', // jamais un hash bcrypt valide : personne ne peut s'y connecter
        status: 'DISABLED',
        role: 'USER',
        minRatio: 0,
        // Comme le compte de l'assistant : « profil » de lui-même, donc jamais compté parmi les membres (classements, listes...).
        parentId: DELETED_USER_ID,
        profileType: 'BOT',
        profileBlocked: true,
      },
    });
  }

  /** Efface le compte `userId` (et ses profils). Renvoie un résumé de ce qui a été déplacé / effacé. */
  async deleteAccount(userId: string) {
    if (userId === DELETED_USER_ID) throw new Error('Le compte « supprimé » ne peut pas être supprimé');
    await this.ensureTombstone();
    const kids = await this.prisma.user.findMany({ where: { parentId: userId }, select: { id: true } });
    const ids = [userId, ...kids.map((k) => k.id)];
    const summary = { reassigned: {} as Record<string, number>, erased: {} as Record<string, number> };

    await this.prisma.$transaction(async (tx) => {
      // Codes d'invitation pas encore utilisés : on les supprime (inutile de les laisser au compte fantôme).
      await tx.$executeRawUnsafe(`DELETE FROM "InviteCode" WHERE "createdById" = ANY($1::text[]) AND "useCount" = 0`, ids);
      for (const [table, column] of ERASE) {
        const n = await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "${column}" = ANY($1::text[])`, ids);
        if (n) summary.erased[`${table}.${column}`] = n;
      }
      for (const [table, column] of REASSIGN) {
        const n = await tx.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $2 WHERE "${column}" = ANY($1::text[])`, ids, DELETED_USER_ID);
        if (n) summary.reassigned[`${table}.${column}`] = n;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "User" WHERE id = ANY($1::text[])`, ids);
    }, { timeout: 60_000, maxWait: 10_000 });

    return summary;
  }

  /**
   * Comptes jamais confirmés par courriel après 48 h : supprimés, et leur invitation redevient utilisable
   * (sinon un code resterait « brûlé » par une inscription abandonnée).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeUnverified() {
    try {
      const stale = await this.prisma.user.findMany({
        where: { status: 'PENDING_EMAIL', createdAt: { lt: new Date(Date.now() - 48 * 3600_000) } },
        select: { id: true, username: true },
        take: 200,
      });
      for (const u of stale) {
        const uses = await this.prisma.inviteUse.findMany({ where: { userId: u.id }, select: { inviteId: true } });
        await this.deleteAccount(u.id);
        for (const use of uses) {
          await this.prisma.inviteCode.updateMany({ where: { id: use.inviteId, useCount: { gt: 0 } }, data: { useCount: { decrement: 1 }, used: false, usedByEmail: null } });
        }
      }
      if (stale.length) this.logger.log(`${stale.length} compte(s) non confirmé(s) supprimé(s)`);
      await this.prisma.emailChallenge.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 86400_000) } }, { usedAt: { lt: new Date(Date.now() - 86400_000) } }] } });
    } catch (err: any) {
      this.logger.warn(`Purge des comptes non confirmés impossible : ${err?.message ?? err}`);
    }
  }
}
