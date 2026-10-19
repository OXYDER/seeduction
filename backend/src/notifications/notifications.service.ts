import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * Catégories de notifications : les onglets de la page Notifications et les préférences du membre. « system » (sanctions, sécurité, compte) ne se coupe pas.
 */
export const NOTIFICATION_CATEGORIES = [
  { key: 'messages', label: 'Messages et mentions', icon: '💬', hint: 'Messages privés et mentions dans le chat quand tu es hors ligne.', locked: false },
  { key: 'forum', label: 'Forum et suggestions', icon: '🗨️', hint: 'Réponses dans tes sujets, commentaires et changements de statut de tes suggestions.', locked: false },
  { key: 'torrents', label: 'Mes torrents', icon: '🎬', hint: 'Torrent approuvé ou refusé, commentaires, remerciements, demandes de reseed.', locked: false },
  { key: 'requests', label: 'Demandes', icon: '🙏', hint: 'Demandes comblées, propositions de torrent, points ajoutés à ta récompense.', locked: false },
  { key: 'social', label: 'Amis, équipes et suivis', icon: '👥', hint: 'Demandes d\'ami, équipes, invitations utilisées, nouveaux torrents des acteurs et studios que tu suis.', locked: false },
  { key: 'announcements', label: 'Nouvelles et événements', icon: '📯', hint: 'Nouvelles du site, freeleech et événements.', locked: false },
  { key: 'games', label: 'Jeux et buts du Canadien', icon: '🏒', hint: 'Buts du Canadien (avec les points bonus offerts aux membres en ligne), résultats de tes paris Mise-O-jeu.', locked: false },
  { key: 'alerts', label: 'Alertes de recherche', icon: '🔔', hint: 'Nouveaux torrents qui correspondent à tes recherches enregistrées (page Alertes).', locked: false },
  { key: 'pot', label: 'Pot commun', icon: '🍯', hint: 'Étapes et récompenses du pot commun.', locked: false },
  { key: 'support', label: 'Support', icon: '🎫', hint: 'Réponses à tes billets de support.', locked: false },
  { key: 'system', label: 'Compte et système', icon: '🛡️', hint: 'Sanctions, sécurité du compte, rang, badges. Ne peut pas être coupé.', locked: true },
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]['key'];
const KEYS = new Set<string>(NOTIFICATION_CATEGORIES.map((c) => c.key));
const LOCKED = new Set<string>(NOTIFICATION_CATEGORIES.filter((c) => c.locked).map((c) => c.key));

/** Catégorie par défaut d'un type (un appel peut en imposer une autre : pot, équipes...). */
const BY_TYPE: Record<NotificationType, NotificationCategory> = {
  FRIEND_REQUEST: 'social', MESSAGE: 'messages', FORUM_REPLY: 'forum', REQUEST_FILLED: 'requests', TORRENT_APPROVED: 'torrents', TORRENT_REJECTED: 'torrents',
  ANNOUNCEMENT: 'announcements', INVITE_USED: 'social', BADGE_EARNED: 'system', TORRENT_COMMENT: 'torrents', SYSTEM: 'system', FOLLOW: 'social', RESEED_REQUEST: 'torrents', SUPPORT: 'support',
};
export const categoryOfType = (type: NotificationType): NotificationCategory => BY_TYPE[type] ?? 'system';

type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Onglet / préférence ; par défaut celle du type. */
  category?: NotificationCategory;
  /**
   * Regroupement : tant que la notification précédente de même clé n'est pas lue, elle est mise à jour (compteur, texte, remontée en tête) au lieu d'en créer
   * une nouvelle. `titleMany` remplace `title` à partir de la deuxième (« {n} nouvelles réponses »).
   */
  groupKey?: string;
  titleMany?: string;
};

const MAX_PER_USER = 500;
const MAX_MENTIONS = 10;

/**
 * Pseudos @mentionnés dans un texte (BBCode compris) : le texte cité ([quote]), le code et les adresses ne comptent pas, ni une adresse de courriel ;
 * 10 au plus, sans doublon.
 */
export function extractMentions(text: string): string[] {
  const clean = String(text ?? '')
    .replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, ' ')
    .replace(/\[code\][\s\S]*?\[\/code\]/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ');
  const found = new Map<string, string>();
  for (const m of clean.matchAll(/(?<![\p{L}\p{N}_.@/])@([\p{L}\p{N}_.·-]{2,50})/gu)) {
    const name = m[1].replace(/[.\-·]+$/, '');
    if (name.length >= 2 && !found.has(name.toLowerCase())) found.set(name.toLowerCase(), name);
  }
  return [...found.values()].slice(0, MAX_MENTIONS);
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService) {}

  /** Les notifications créées avant les catégories reçoivent celle de leur type (sans effet une fois faite). */
  async onModuleInit() {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Notification" SET category = CASE type::text
          WHEN 'FRIEND_REQUEST' THEN 'social' WHEN 'INVITE_USED' THEN 'social' WHEN 'FOLLOW' THEN 'social' WHEN 'MESSAGE' THEN 'messages' WHEN 'FORUM_REPLY' THEN 'forum'
          WHEN 'REQUEST_FILLED' THEN 'requests' WHEN 'TORRENT_APPROVED' THEN 'torrents' WHEN 'TORRENT_REJECTED' THEN 'torrents' WHEN 'TORRENT_COMMENT' THEN 'torrents'
          WHEN 'RESEED_REQUEST' THEN 'torrents' WHEN 'ANNOUNCEMENT' THEN 'announcements' WHEN 'SUPPORT' THEN 'support' ELSE 'system' END
        WHERE category = 'system' AND type::text <> 'SYSTEM' AND type::text <> 'BADGE_EARNED'`;
    } catch (err: any) { this.logger.warn(`Catégories des anciennes notifications : ${err?.message}`); }
  }

  // ------------------------------------------------------------------ préférences

  async prefsOf(userId: string): Promise<Record<string, boolean>> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { notifPrefs: true } });
    const raw = (u?.notifPrefs ?? {}) as Record<string, unknown>;
    return Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.key, c.locked ? true : raw[c.key] !== false]));
  }

  async setPrefs(userId: string, input: Record<string, unknown>) {
    const next: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(input ?? {})) if (KEYS.has(k) && !LOCKED.has(k) && v === false) next[k] = false;
    await this.prisma.user.update({ where: { id: userId }, data: { notifPrefs: Object.keys(next).length ? next : Prisma.DbNull } });
    return this.prefsOf(userId);
  }

  private async wants(userId: string, category: string) {
    if (LOCKED.has(category)) return true;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { notifPrefs: true } });
    return ((u?.notifPrefs ?? {}) as Record<string, unknown>)[category] !== false;
  }

  // ------------------------------------------------------------------ création

  /** Point d'entrée utilisé par les autres modules (messages, forum, demandes, admin...) pour créer une notification. Respecte les préférences du membre. */
  async notify(input: NotifyInput) {
    const { category: wanted, groupKey, titleMany, ...rest } = input;
    const category = wanted ?? categoryOfType(input.type);
    if (!(await this.wants(input.userId, category))) return null;

    if (groupKey) {
      const existing = await this.prisma.notification.findFirst({ where: { userId: input.userId, groupKey, read: false }, select: { id: true, count: true } });
      if (existing) {
        const count = existing.count + 1;
        return this.prisma.notification.update({
          where: { id: existing.id },
          data: { count, title: (titleMany ?? input.title).replace('{n}', String(count)), body: input.body ?? null, link: input.link ?? null, createdAt: new Date() },
        });
      }
    }
    return this.prisma.notification.create({ data: { ...rest, category, groupKey: groupKey ?? null } });
  }

  /**
   * Prévient les membres @mentionnés dans un sujet, un commentaire, une suggestion... (catégorie « Messages et mentions »). L'auteur et ceux de `skip` (déjà
   * prévenus pour une autre raison) sont ignorés ; `canSee` écarte ceux qui ne peuvent pas ouvrir le contenu (forum réservé à l'équipe...).
   */
  async notifyMentions(opts: { text: string; authorId: string; authorName: string; link: string; where: string; skip?: string[]; canSee?: (u: { id: string; role: string }) => boolean }) {
    const names = extractMentions(opts.text);
    if (names.length === 0) return 0;
    const users = await this.prisma.user.findMany({
      where: { parentId: null, status: 'ACTIVE', OR: names.map((n) => ({ username: { equals: n, mode: 'insensitive' as const } })) },
      select: { id: true, role: true },
      take: MAX_MENTIONS,
    });
    const skip = new Set([opts.authorId, ...(opts.skip ?? [])]);
    let sent = 0;
    for (const u of users) {
      if (skip.has(u.id) || (opts.canSee && !opts.canSee(u))) continue;
      await this.notify({ userId: u.id, type: 'MESSAGE', category: 'messages', title: `${opts.authorName} t'a mentionné ${opts.where}`, link: opts.link }).catch(() => undefined);
      sent++;
    }
    return sent;
  }

  /** Plusieurs notifications d'un coup (suivis...), en respectant les préférences. */
  async notifyMany(list: NotifyInput[]) {
    for (const n of list) await this.notify(n).catch(() => undefined);
  }

  /** Diffuse une notification à tous les membres (annonces globales) : ceux qui ont coupé cette catégorie n'en reçoivent pas. */
  async notifyAll(input: Omit<NotifyInput, 'userId'>) {
    const category = input.category ?? categoryOfType(input.type);
    const users = await this.prisma.user.findMany({ select: { id: true, notifPrefs: true } });
    const targets = LOCKED.has(category) ? users : users.filter((u) => ((u.notifPrefs ?? {}) as Record<string, unknown>)[category] !== false);
    const { groupKey, titleMany, ...rest } = input;
    return this.prisma.notification.createMany({ data: targets.map((u) => ({ ...rest, userId: u.id, category, groupKey: null })) });
  }

  // ------------------------------------------------------------------ lecture

  /** Liste filtrable : onglet (catégorie), non lues seulement, tri, pagination par décalage (« Voir plus »). */
  async list(userId: string, opts: { limit?: number; category?: string; unread?: boolean; sort?: string; offset?: number } = {}) {
    const take = Math.max(1, Math.min(100, opts.limit ?? 30));
    const where: Prisma.NotificationWhereInput = { userId };
    if (opts.category && KEYS.has(opts.category)) where.category = opts.category;
    if (opts.unread) where.read = false;
    const sort = opts.sort === 'oldest' ? 'oldest' : opts.sort === 'unread' ? 'unread' : 'recent';
    const orderBy: Prisma.NotificationOrderByWithRelationInput[] = sort === 'oldest' ? [{ createdAt: 'asc' }] : sort === 'unread' ? [{ read: 'asc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];
    // Pagination : décalage simple (les listes restent courtes, 500 notifications au plus par membre).
    const skip = Math.max(0, Number(opts.offset) || 0);
    const rows = await this.prisma.notification.findMany({ where, orderBy, take: take + 1, skip });
    return { items: rows.slice(0, take), next: rows.length > take ? skip + take : null };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  /** Non lues et totales par catégorie (pastilles des onglets). */
  async summary(userId: string) {
    const [unread, total] = await Promise.all([
      this.prisma.notification.groupBy({ by: ['category'], where: { userId, read: false }, _count: { _all: true } }),
      this.prisma.notification.groupBy({ by: ['category'], where: { userId }, _count: { _all: true } }),
    ]);
    const u = new Map(unread.map((r) => [r.category, r._count._all]));
    const t = new Map(total.map((r) => [r.category, r._count._all]));
    return {
      unread: [...u.values()].reduce((a, b) => a + b, 0),
      total: [...t.values()].reduce((a, b) => a + b, 0),
      byCategory: Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.key, { unread: u.get(c.key) ?? 0, total: t.get(c.key) ?? 0 }])),
    };
  }

  // ------------------------------------------------------------------ actions

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  }

  markUnread(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { read: false } });
  }

  /** Tout marquer comme lu, ou seulement un onglet. */
  markAllRead(userId: string, category?: string) {
    return this.prisma.notification.updateMany({ where: { userId, read: false, ...(category && KEYS.has(category) ? { category } : {}) }, data: { read: true } });
  }

  /** En ouvrant une page, les notifications qui y mènent sont lues d'office (sujet du forum, conversation, fiche de torrent...). */
  async markReadByLink(userId: string, links: string[]) {
    const clean = [...new Set(links.map((l) => String(l ?? '').slice(0, 400)).filter((l) => l.startsWith('/')))].slice(0, 4);
    if (clean.length === 0) return { count: 0 };
    // Le lien d'une notification peut porter une ancre (« /news/12#commentaires ») : seule la page compte.
    const count = await this.prisma.$executeRaw`UPDATE "Notification" SET read = true WHERE "userId" = ${userId} AND read = false AND link IS NOT NULL AND split_part(link, '#', 1) = ANY(${clean}::text[])`;
    return { count };
  }

  remove(userId: string, id: string) {
    return this.prisma.notification.deleteMany({ where: { id, userId } });
  }

  /** Supprime les notifications déjà lues (d'un onglet, ou toutes). */
  removeRead(userId: string, category?: string) {
    return this.prisma.notification.deleteMany({ where: { userId, read: true, ...(category && KEYS.has(category) ? { category } : {}) } });
  }

  // ------------------------------------------------------------------ ménage

  /** Chaque nuit : les notifications lues depuis plus de 30 jours, et toutes celles de plus de 120 jours, disparaissent ; 500 au plus par membre (les plus anciennes lues d'abord). */
  @Cron('23 4 * * *')
  async cleanup() {
    const day = 86_400_000;
    const a = await this.prisma.notification.deleteMany({ where: { read: true, createdAt: { lt: new Date(Date.now() - 30 * day) } } });
    const b = await this.prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 120 * day) } } });
    const over = await this.prisma.$queryRaw<{ userId: string; n: number }[]>`SELECT "userId", COUNT(*)::int AS n FROM "Notification" GROUP BY "userId" HAVING COUNT(*) > ${MAX_PER_USER}`;
    let capped = 0;
    for (const o of over) {
      const surplus = o.n - MAX_PER_USER;
      const victims = await this.prisma.notification.findMany({ where: { userId: o.userId }, orderBy: [{ read: 'desc' }, { createdAt: 'asc' }], take: surplus, select: { id: true } });
      capped += (await this.prisma.notification.deleteMany({ where: { id: { in: victims.map((v) => v.id) } } })).count;
    }
    if (a.count + b.count + capped > 0) this.logger.log(`Ménage des notifications : ${a.count} lues, ${b.count} anciennes, ${capped} en surplus`);
  }
}
