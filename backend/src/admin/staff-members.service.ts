import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PresenceService } from '../presence/presence.service';

const PAGE = 50;
const ROLES = ['USER', 'UPLOADER', 'MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const STATUSES = ['ACTIVE', 'BANNED', 'DISABLED', 'PENDING_INVITE', 'PENDING_EMAIL'];
const SELECT = { id: true, username: true, role: true, status: true, uploaded: true, downloaded: true, bonusPoints: true, createdAt: true, lastSeenAt: true, avatarUrl: true } as const;

const row = (u: any) => {
  const up = Number(u.uploaded), down = Number(u.downloaded);
  return { id: u.id, username: u.username, role: u.role, status: u.status, avatarUrl: u.avatarUrl, uploaded: up, downloaded: down, ratio: down > 0 ? up / down : null, bonusPoints: Math.round(Number(u.bonusPoints ?? 0)), createdAt: u.createdAt, lastSeenAt: u.lastSeenAt };
};

/** Listes réservées à l'équipe, ouvertes depuis les tuiles « La communauté » de l'accueil : tous les membres, ceux qui sont en ligne, ceux qui seedent. */
@Injectable()
export class StaffMembersService {
  constructor(private prisma: PrismaService, private presence: PresenceService) {}

  /** Les trois nombres affichés à côté des onglets : tous les membres, en ligne (invisibles compris), qui seedent. */
  async counts() {
    const [all, seeders] = await Promise.all([
      this.prisma.user.count({ where: { parentId: null } }),
      this.prisma.peer.groupBy({ by: ['userId'], where: { isSeeder: true } }),
    ]);
    return { all, online: this.presence.listOnlineAll().length, seeders: seeders.length };
  }

  /** Tous les comptes (les profils d'un compte famille ne comptent pas à part), avec recherche, filtres et tri. */
  async list(q: { q?: string; role?: string; status?: string; sort?: string; page?: number }) {
    const where: Prisma.UserWhereInput = { parentId: null };
    const text = (q.q ?? '').trim().slice(0, 60);
    if (text) where.username = { contains: text, mode: 'insensitive' };
    if (ROLES.includes(q.role ?? '')) where.role = q.role as any;
    if (STATUSES.includes(q.status ?? '')) where.status = q.status as any;
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      q.sort === 'old' ? [{ createdAt: 'asc' }] : q.sort === 'name' ? [{ username: 'asc' }] : q.sort === 'upload' ? [{ uploaded: 'desc' }] : q.sort === 'download' ? [{ downloaded: 'desc' }]
      : q.sort === 'points' ? [{ bonusPoints: 'desc' }] : q.sort === 'seen' ? [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }] : [{ createdAt: 'desc' }];
    const page = Math.max(1, Math.floor(Number(q.page) || 1));
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, select: SELECT }),
      this.prisma.user.count({ where }),
      this.prisma.user.groupBy({ by: ['status'], where: { parentId: null }, _count: { _all: true } }),
    ]);
    return {
      items: rows.map((u) => ({ ...row(u), online: this.presence.isOnline(u.id) })),
      total, page, pageSize: PAGE,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    };
  }

  /** Membres connectés en ce moment, y compris ceux qui apparaissent hors ligne (marqués « invisible » : seule l'équipe les voit ici). */
  async online() {
    const live = this.presence.listOnlineAll();
    const users = await this.prisma.user.findMany({ where: { id: { in: live.map((l) => l.id) } }, select: SELECT });
    const byId = new Map(users.map((u) => [u.id, u]));
    const items = live.map((l) => {
      const u = byId.get(l.id);
      return { ...(u ? row(u) : { id: l.id, username: l.username, role: 'USER', status: 'ACTIVE', avatarUrl: null, uploaded: 0, downloaded: 0, ratio: null, bonusPoints: 0, createdAt: null, lastSeenAt: null }), presence: l.preference, devices: l.sockets };
    }).sort((a, b) => a.username.localeCompare(b.username, 'fr'));
    return { items, total: items.length, invisible: items.filter((i) => i.presence === 'INVISIBLE').length };
  }

  /** Membres qui seedent : nombre de torrents seedés, volume correspondant et dernier contact. */
  async seeders(q: { q?: string }) {
    const rows = await this.prisma.$queryRaw<{ userId: string; torrents: number; size: string; last: Date | null }[]>`
      WITH s AS (SELECT p."userId", p."torrentId", MAX(p."lastAnnounceAt") AS "lastAnnounceAt" FROM "Peer" p WHERE p."isSeeder" = true GROUP BY p."userId", p."torrentId")
      SELECT s."userId", COUNT(*)::int AS torrents, COALESCE(SUM(t.size), 0)::text AS size, MAX(s."lastAnnounceAt") AS last
      FROM s JOIN "Torrent" t ON t.id = s."torrentId"
      GROUP BY s."userId" ORDER BY torrents DESC LIMIT 500`;
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: SELECT });
    const byId = new Map(users.map((u) => [u.id, u]));
    const text = (q.q ?? '').trim().toLowerCase();
    const items = rows
      .map((r) => { const u = byId.get(r.userId); return u ? { ...row(u), seeding: r.torrents, seededSize: Number(r.size), lastAnnounceAt: r.last, online: this.presence.isOnline(u.id) } : null; })
      .filter((x): x is NonNullable<typeof x> => !!x && (!text || x.username.toLowerCase().includes(text)));
    const totalPeers = await this.prisma.peer.count({ where: { isSeeder: true } });
    return { items, total: items.length, totalPeers };
  }
}
