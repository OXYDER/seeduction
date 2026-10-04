import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AdultService } from '../adult/adult.service';
import { PresenceService } from '../presence/presence.service';

const CACHE_MS = 5 * 60_000;
/** Fuseau des courbes « par heure » (le site est francophone d'Amérique du Nord) ; modifiable dans backend/.env. */
const TZ = process.env.STATS_TZ ?? 'America/Montreal';
/** Un ratio n'a de sens qu'au-delà d'un volume téléchargé minimal (1 Go). */
const MIN_DOWNLOADED = 1_000_000_000;
const TOP = 10;

interface MemberRow { id: string; username: string; avatarUrl: string | null; v: number; up?: number | null; down?: number | null }
type Board = { user: { id: string; username: string; avatarUrl: string | null }; value: number; extra?: Record<string, number | null> }[];

const asBoard = (rows: MemberRow[]): Board => rows.map((r) => ({
  user: { id: r.id, username: r.username, avatarUrl: r.avatarUrl },
  value: Number(r.v),
  ...(r.up !== undefined ? { extra: { uploaded: r.up === null ? null : Number(r.up), downloaded: r.down === null || r.down === undefined ? null : Number(r.down) } } : {}),
}));

/**
 * Classements de la page Statistiques : membres (ratio, hit & run, assiduité, commentaires...) et torrents (moins téléchargés, plus
 * petits, plus difficiles à obtenir...). Calculés à la demande et gardés 5 minutes en mémoire : ces requêtes parcourent de grosses tables.
 * Les comptes d'un compte famille comptent pour leur compte principal, l'assistant du chat n'apparaît jamais.
 */
@Injectable()
export class StatsBoardsService {
  private cache = new Map<string, { at: number; data: any }>();

  constructor(private prisma: PrismaService, private adult: AdultService, private presence: PresenceService) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;
    const data = await load();
    this.cache.set(key, { at: Date.now(), data });
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value as string);
    return data;
  }

  // ------------------------------------------------------------------ membres

  members() {
    return this.cached('members', async () => {
      const q = <T = MemberRow>(sql: Prisma.Sql) => this.prisma.$queryRaw<T[]>(sql);
      const base = Prisma.sql`u."parentId" IS NULL AND u.status = 'ACTIVE'`;
      const viaAccount = (table: string, col: string, extra = Prisma.empty) => Prisma.sql`
        SELECT a.id, a.username, a."avatarUrl", COUNT(*)::int AS v FROM ${Prisma.raw(`"${table}"`)} x
        JOIN "User" au ON au.id = x.${Prisma.raw(`"${col}"`)} JOIN "User" a ON a.id = COALESCE(au."parentId", au.id)
        WHERE a.status = 'ACTIVE' ${extra} GROUP BY a.id ORDER BY v DESC LIMIT ${TOP}`;

      const [
        ratioHigh, ratioLow, uploadVolume, downloadVolume, bonus, hnrOpen, hnrTotal, seedHours, completed, activeDays,
        comments, forumPosts, chat, thanks, uploadSize, friends, oldest, newest,
        ratioBuckets, ageBuckets, byHour, byWeekday, seen, totals,
      ] = await Promise.all([
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", u.uploaded::float8 AS up, u.downloaded::float8 AS down, (u.uploaded::float8 / u.downloaded::float8) AS v FROM "User" u WHERE ${base} AND u.downloaded >= ${MIN_DOWNLOADED} ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", u.uploaded::float8 AS up, u.downloaded::float8 AS down, (u.uploaded::float8 / u.downloaded::float8) AS v FROM "User" u WHERE ${base} AND u.downloaded >= ${MIN_DOWNLOADED} ORDER BY v ASC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", u.uploaded::float8 AS v FROM "User" u WHERE ${base} ORDER BY u.uploaded DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", u.downloaded::float8 AS v FROM "User" u WHERE ${base} ORDER BY u.downloaded DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", u."bonusPoints"::float8 AS v FROM "User" u WHERE ${base} ORDER BY u."bonusPoints" DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", COUNT(*)::int AS v FROM "Snatch" s JOIN "User" u ON u.id = s."userId" WHERE ${base} AND s.hnr AND NOT s.satisfied GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", COUNT(*)::int AS v FROM "Snatch" s JOIN "User" u ON u.id = s."userId" WHERE ${base} AND s.hnr GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", (SUM(s."seedSeconds") / 3600.0)::float8 AS v FROM "Snatch" s JOIN "User" u ON u.id = s."userId" WHERE ${base} GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", COUNT(*)::int AS v FROM "Snatch" s JOIN "User" u ON u.id = s."userId" WHERE ${base} GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", COUNT(DISTINCT date_trunc('day', m."createdAt"))::int AS v FROM "MemberActivity" m JOIN "User" u ON u.id = m."accountId" WHERE ${base} AND m."createdAt" > now() - interval '30 days' GROUP BY u.id ORDER BY v DESC, u.username LIMIT ${TOP}`),
        q(viaAccount('TorrentComment', 'authorId')),
        q(viaAccount('ForumPost', 'authorId')),
        q(viaAccount('Message', 'senderId', Prisma.sql`AND x.type <> 'SYSTEM' AND x."deletedAt" IS NULL`)),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", COUNT(*)::int AS v FROM "TorrentLike" l JOIN "Torrent" t ON t.id = l."torrentId" JOIN "User" u ON u.id = t."uploaderId" WHERE ${base} AND NOT t."anonymousUpload" GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", SUM(t.size)::float8 AS v FROM "Torrent" t JOIN "User" u ON u.id = t."uploaderId" WHERE ${base} AND t.status = 'APPROVED' AND NOT t."anonymousUpload" GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", COUNT(*)::int AS v FROM (SELECT "requesterId" AS uid FROM "Friendship" WHERE status = 'ACCEPTED' UNION ALL SELECT "addresseeId" FROM "Friendship" WHERE status = 'ACCEPTED') f JOIN "User" u ON u.id = f.uid WHERE ${base} GROUP BY u.id ORDER BY v DESC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", (EXTRACT(EPOCH FROM now() - u."createdAt") / 86400)::float8 AS v FROM "User" u WHERE ${base} ORDER BY u."createdAt" ASC LIMIT ${TOP}`),
        q(Prisma.sql`SELECT u.id, u.username, u."avatarUrl", (EXTRACT(EPOCH FROM now() - u."createdAt") / 86400)::float8 AS v FROM "User" u WHERE ${base} ORDER BY u."createdAt" DESC LIMIT ${TOP}`),
        q<{ name: string; n: number }>(Prisma.sql`SELECT CASE WHEN u.downloaded = 0 THEN '∞ (rien téléchargé)' WHEN u.uploaded::float8 / u.downloaded < 0.5 THEN 'moins de 0,5' WHEN u.uploaded::float8 / u.downloaded < 1 THEN '0,5 à 1' WHEN u.uploaded::float8 / u.downloaded < 2 THEN '1 à 2' WHEN u.uploaded::float8 / u.downloaded < 5 THEN '2 à 5' ELSE '5 et plus' END AS name, COUNT(*)::int AS n FROM "User" u WHERE ${base} GROUP BY 1`),
        q<{ name: string; n: number }>(Prisma.sql`SELECT CASE WHEN u."createdAt" > now() - interval '7 days' THEN '1' WHEN u."createdAt" > now() - interval '30 days' THEN '2' WHEN u."createdAt" > now() - interval '90 days' THEN '3' WHEN u."createdAt" > now() - interval '365 days' THEN '4' ELSE '5' END AS name, COUNT(*)::int AS n FROM "User" u WHERE ${base} GROUP BY 1`),
        q<{ h: number; n: number }>(Prisma.sql`SELECT EXTRACT(HOUR FROM m."createdAt" AT TIME ZONE ${TZ})::int AS h, COUNT(*)::int AS n FROM "MemberActivity" m WHERE m."createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
        q<{ d: number; n: number }>(Prisma.sql`SELECT EXTRACT(ISODOW FROM m."createdAt" AT TIME ZONE ${TZ})::int AS d, COUNT(*)::int AS n FROM "MemberActivity" m WHERE m."createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
        q<{ d1: number; d7: number; d30: number; total: number }>(Prisma.sql`SELECT COUNT(*) FILTER (WHERE u."lastSeenAt" > now() - interval '1 day')::int AS d1, COUNT(*) FILTER (WHERE u."lastSeenAt" > now() - interval '7 days')::int AS d7, COUNT(*) FILTER (WHERE u."lastSeenAt" > now() - interval '30 days')::int AS d30, COUNT(*)::int AS total FROM "User" u WHERE ${base}`),
        q<{ torrents: number; size: number }>(Prisma.sql`SELECT COUNT(*)::int AS torrents, COALESCE(SUM(size), 0)::float8 AS size FROM "Torrent" WHERE status = 'APPROVED'`),
      ]);

      const ageOrder = ['1', '2', '3', '4', '5'];
      const ageLabel: Record<string, string> = { '1': 'Moins de 7 jours', '2': '7 à 30 jours', '3': '1 à 3 mois', '4': '3 à 12 mois', '5': 'Plus d\'un an' };
      const ratioOrder = ['moins de 0,5', '0,5 à 1', '1 à 2', '2 à 5', '5 et plus', '∞ (rien téléchargé)'];
      const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour.find((r) => r.h === h)?.n ?? 0 }));
      const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      return {
        generatedAt: new Date().toISOString(),
        boards: {
          ratioHigh: asBoard(ratioHigh), ratioLow: asBoard(ratioLow), uploadVolume: asBoard(uploadVolume), downloadVolume: asBoard(downloadVolume), bonus: asBoard(bonus),
          hnrOpen: asBoard(hnrOpen), hnrTotal: asBoard(hnrTotal), seedHours: asBoard(seedHours), completed: asBoard(completed), activeDays: asBoard(activeDays),
          comments: asBoard(comments), forumPosts: asBoard(forumPosts), chat: asBoard(chat), thanks: asBoard(thanks), uploadSize: asBoard(uploadSize),
          friends: asBoard(friends), oldest: asBoard(oldest), newest: asBoard(newest),
        },
        ratioBuckets: ratioOrder.map((name) => ({ name, count: ratioBuckets.find((r) => r.name === name)?.n ?? 0 })),
        ageBuckets: ageOrder.map((k) => ({ name: ageLabel[k], count: ageBuckets.find((r) => r.name === k)?.n ?? 0 })),
        byHour: hours,
        byWeekday: days.map((name, i) => ({ name, count: byWeekday.find((r) => r.d === i + 1)?.n ?? 0 })),
        seen: { day: seen[0]?.d1 ?? 0, week: seen[0]?.d7 ?? 0, month: seen[0]?.d30 ?? 0, total: seen[0]?.total ?? 0, online: this.presence.listOnline().length },
        catalog: totals[0] ?? { torrents: 0, size: 0 },
        minDownloadedGb: MIN_DOWNLOADED / 1e9,
        tz: TZ,
      };
    });
  }

  // ------------------------------------------------------------------ torrents

  async torrents(viewerId?: string) {
    const hidden = await this.adult.hiddenFor(viewerId);
    const key = `torrents:${[...hidden].sort().join(',')}`;
    return this.cached(key, async () => {
      const visible: Prisma.TorrentWhereInput = hidden.length ? { categoryId: { notIn: hidden } } : {};
      const hiddenSql = hidden.length ? Prisma.sql`AND t."categoryId" <> ALL(${hidden}::text[])` : Prisma.empty;
      const week = new Date(Date.now() - 7 * 86400_000);
      const approved: Prisma.TorrentWhereInput = { status: 'APPROVED', ...visible };
      const select = { id: true, name: true, coverImage: true, size: true, seeders: true, leechers: true, completedCount: true, createdAt: true, diedAt: true, zeroSeedersSince: true } as const;
      const fmt = (rows: any[], value: (t: any) => number, extra?: (t: any) => Record<string, number | null>) => rows.map((t) => ({
        torrent: { id: t.id, name: t.name, coverImage: t.coverImage }, value: value(t), extra: extra ? extra(t) : undefined,
      }));

      const [leastDownloaded, neverDownloaded, smallest, biggest, hardPool, fragile, mostSeeded, mostLeeched, oldestAlive, longestDead,
        favGroups, likeGroups, rated, categories, sizeBuckets, seederBuckets, health, avgAge] = await Promise.all([
        this.prisma.torrent.findMany({ where: { ...approved, createdAt: { lt: week } }, orderBy: [{ completedCount: 'asc' }, { createdAt: 'asc' }], take: TOP, select }),
        this.prisma.torrent.count({ where: { ...approved, createdAt: { lt: week }, completedCount: 0 } }),
        this.prisma.torrent.findMany({ where: approved, orderBy: { size: 'asc' }, take: TOP, select }),
        this.prisma.torrent.findMany({ where: approved, orderBy: { size: 'desc' }, take: TOP, select }),
        this.prisma.torrent.findMany({ where: { ...approved, leechers: { gte: 1 } }, orderBy: { leechers: 'desc' }, take: 300, select }),
        this.prisma.torrent.findMany({ where: { ...approved, seeders: 1 }, orderBy: { completedCount: 'desc' }, take: TOP, select }),
        this.prisma.torrent.findMany({ where: approved, orderBy: [{ seeders: 'desc' }, { completedCount: 'desc' }], take: TOP, select }),
        this.prisma.torrent.findMany({ where: { ...approved, leechers: { gt: 0 } }, orderBy: { leechers: 'desc' }, take: TOP, select }),
        this.prisma.torrent.findMany({ where: { ...approved, seeders: { gt: 0 } }, orderBy: { createdAt: 'asc' }, take: TOP, select }),
        this.prisma.torrent.findMany({ where: { status: 'DEAD', ...visible }, orderBy: [{ diedAt: 'asc' }, { zeroSeedersSince: 'asc' }], take: TOP, select }),
        this.prisma.favorite.groupBy({ by: ['torrentId'], _count: { _all: true }, orderBy: { _count: { torrentId: 'desc' } }, take: 40 }),
        this.prisma.torrentLike.groupBy({ by: ['torrentId'], _count: { _all: true }, orderBy: { _count: { torrentId: 'desc' } }, take: 40 }),
        this.prisma.$queryRaw<{ id: string; avg: number; n: number }[]>(Prisma.sql`
          SELECT t.id, AVG(r.score)::float8 AS avg, COUNT(*)::int AS n FROM "TorrentRating" r JOIN "Torrent" t ON t.id = r."torrentId"
          WHERE t.status = 'APPROVED' ${hiddenSql} GROUP BY t.id HAVING COUNT(*) >= 3 ORDER BY avg DESC, n DESC LIMIT ${TOP}`),
        this.prisma.$queryRaw<{ name: string; slug: string; torrents: number; size: number; completed: number; seeders: number; leechers: number; avg: number }[]>(Prisma.sql`
          SELECT COALESCE(p.name, c.name) AS name, COALESCE(p.slug, c.slug) AS slug, COUNT(*)::int AS torrents, SUM(t.size)::float8 AS size,
                 SUM(t."completedCount")::int AS completed, SUM(t.seeders)::int AS seeders, SUM(t.leechers)::int AS leechers, AVG(t.size)::float8 AS avg
          FROM "Torrent" t JOIN "Category" c ON c.id = t."categoryId" LEFT JOIN "Category" p ON p.id = c."parentId"
          WHERE t.status = 'APPROVED' ${hiddenSql} GROUP BY 1, 2 ORDER BY torrents DESC`),
        this.prisma.$queryRaw<{ k: number; n: number }[]>(Prisma.sql`
          SELECT CASE WHEN t.size < 1e9 THEN 1 WHEN t.size < 5e9 THEN 2 WHEN t.size < 20e9 THEN 3 WHEN t.size < 50e9 THEN 4 ELSE 5 END AS k, COUNT(*)::int AS n
          FROM "Torrent" t WHERE t.status = 'APPROVED' ${hiddenSql} GROUP BY 1`),
        this.prisma.$queryRaw<{ k: number; n: number }[]>(Prisma.sql`
          SELECT CASE WHEN t.seeders = 0 THEN 1 WHEN t.seeders = 1 THEN 2 WHEN t.seeders <= 5 THEN 3 WHEN t.seeders <= 20 THEN 4 ELSE 5 END AS k, COUNT(*)::int AS n
          FROM "Torrent" t WHERE t.status IN ('APPROVED', 'DEAD') ${hiddenSql} GROUP BY 1`),
        this.prisma.$queryRaw<{ alive: number; dead: number; seeders: number; leechers: number; healthy: number; avgSeeders: number }[]>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE t.status = 'APPROVED')::int AS alive, COUNT(*) FILTER (WHERE t.status = 'DEAD')::int AS dead,
                 COALESCE(SUM(t.seeders), 0)::int AS seeders, COALESCE(SUM(t.leechers), 0)::int AS leechers,
                 COUNT(*) FILTER (WHERE t.status = 'APPROVED' AND t.seeders >= 3)::int AS healthy,
                 COALESCE(AVG(t.seeders) FILTER (WHERE t.status = 'APPROVED'), 0)::float8 AS "avgSeeders"
          FROM "Torrent" t WHERE t.status IN ('APPROVED', 'DEAD') ${hiddenSql}`),
        this.prisma.$queryRaw<{ d: number | null }[]>(Prisma.sql`SELECT (AVG(EXTRACT(EPOCH FROM now() - t."createdAt")) / 86400)::float8 AS d FROM "Torrent" t WHERE t.status = 'APPROVED' ${hiddenSql}`),
      ]);

      // Torrents d'un groupement (favoris, merci, notes) : on relit leur fiche pour appliquer le filtre « contenu adulte ».
      const lookup = async (ids: string[]) => {
        const rows = ids.length ? await this.prisma.torrent.findMany({ where: { id: { in: ids }, ...approved }, select }) : [];
        return new Map(rows.map((t) => [t.id, t]));
      };
      const [favMap, likeMap, ratedMap] = await Promise.all([lookup(favGroups.map((g) => g.torrentId)), lookup(likeGroups.map((g) => g.torrentId)), lookup(rated.map((r) => r.id))]);
      const grouped = (groups: { torrentId: string; _count: { _all: number } }[], map: Map<string, any>) => groups
        .filter((g) => map.has(g.torrentId)).slice(0, TOP).map((g) => ({ torrent: { id: g.torrentId, name: map.get(g.torrentId).name, coverImage: map.get(g.torrentId).coverImage }, value: g._count._all }));

      const hard = hardPool
        .map((t) => ({ t, ratio: t.leechers / (t.seeders + 1) }))
        .sort((a, b) => b.ratio - a.ratio || b.t.leechers - a.t.leechers).slice(0, TOP);
      const bucketLabels: Record<string, string[]> = {
        size: ['Moins de 1 Go', '1 à 5 Go', '5 à 20 Go', '20 à 50 Go', '50 Go et plus'],
        seeders: ['0 seeder', '1 seeder', '2 à 5', '6 à 20', 'Plus de 20'],
      };
      const h = health[0] ?? { alive: 0, dead: 0, seeders: 0, leechers: 0, healthy: 0, avgSeeders: 0 };
      const deadSince = (t: any) => (Date.now() - new Date(t.diedAt ?? t.zeroSeedersSince ?? t.createdAt).getTime()) / 86400_000;
      return {
        generatedAt: new Date().toISOString(),
        boards: {
          leastDownloaded: fmt(leastDownloaded, (t) => t.completedCount, (t) => ({ days: Math.round((Date.now() - t.createdAt.getTime()) / 86400_000), seeders: t.seeders })),
          smallest: fmt(smallest, (t) => Number(t.size)), biggest: fmt(biggest, (t) => Number(t.size)),
          hardest: hard.map(({ t, ratio }) => ({ torrent: { id: t.id, name: t.name, coverImage: t.coverImage }, value: Math.round(ratio * 10) / 10, extra: { leechers: t.leechers, seeders: t.seeders } })),
          fragile: fmt(fragile, (t) => t.completedCount),
          mostSeeded: fmt(mostSeeded, (t) => t.seeders), mostLeeched: fmt(mostLeeched, (t) => t.leechers),
          oldestAlive: fmt(oldestAlive, (t) => Math.round((Date.now() - t.createdAt.getTime()) / 86400_000)),
          longestDead: fmt(longestDead, (t) => Math.round(deadSince(t))),
          mostFavorited: grouped(favGroups, favMap), mostThanked: grouped(likeGroups, likeMap),
          bestRated: rated.filter((r) => ratedMap.has(r.id)).map((r) => ({ torrent: { id: r.id, name: ratedMap.get(r.id)!.name, coverImage: ratedMap.get(r.id)!.coverImage }, value: Math.round(r.avg * 10) / 10, extra: { votes: r.n } })),
        },
        neverDownloaded,
        categories: categories.map((c) => ({ ...c })),
        sizeBuckets: bucketLabels.size.map((name, i) => ({ name, count: sizeBuckets.find((b) => b.k === i + 1)?.n ?? 0 })),
        seederBuckets: bucketLabels.seeders.map((name, i) => ({ name, count: seederBuckets.find((b) => b.k === i + 1)?.n ?? 0 })),
        health: {
          alive: h.alive, dead: h.dead, seeders: h.seeders, leechers: h.leechers,
          healthyPct: h.alive ? Math.round((h.healthy / h.alive) * 100) : 0,
          deadPct: h.alive + h.dead ? Math.round((h.dead / (h.alive + h.dead)) * 100) : 0,
          avgSeeders: Math.round(h.avgSeeders * 10) / 10,
          seedLeechRatio: h.leechers ? Math.round((h.seeders / h.leechers) * 10) / 10 : null,
          avgAgeDays: Math.round(avgAge[0]?.d ?? 0),
        },
      };
    });
  }

  // ------------------------------------------------------------------ ma position

  /** Où se situe ce membre dans les classements (compte principal). */
  async me(accountId: string) {
    const [row] = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH me AS (SELECT * FROM "User" WHERE id = ${accountId}),
      pool AS (SELECT * FROM "User" u WHERE u."parentId" IS NULL AND u.status = 'ACTIVE')
      SELECT (SELECT uploaded::float8 FROM me) AS uploaded, (SELECT downloaded::float8 FROM me) AS downloaded, (SELECT "bonusPoints"::float8 FROM me) AS bonus,
        (SELECT COUNT(*)::int FROM pool) AS members,
        (SELECT COUNT(*)::int + 1 FROM pool WHERE uploaded > (SELECT uploaded FROM me)) AS "uploadRank",
        (SELECT COUNT(*)::int + 1 FROM pool WHERE downloaded >= ${MIN_DOWNLOADED} AND uploaded::float8 / downloaded > (SELECT uploaded::float8 / NULLIF(downloaded, 0) FROM me)) AS "ratioRank",
        (SELECT COUNT(*)::int + 1 FROM pool WHERE "bonusPoints" > (SELECT "bonusPoints" FROM me)) AS "bonusRank",
        (SELECT COUNT(*)::int FROM "Snatch" WHERE "userId" = ${accountId}) AS snatches,
        (SELECT COUNT(*)::int FROM "Snatch" WHERE "userId" = ${accountId} AND hnr AND NOT satisfied) AS "hnrOpen",
        (SELECT COALESCE(SUM("seedSeconds"), 0) / 3600.0 FROM "Snatch" WHERE "userId" = ${accountId})::float8 AS "seedHours",
        (SELECT COUNT(*)::int FROM "Torrent" WHERE "uploaderId" = ${accountId} AND status = 'APPROVED') AS uploads`);
    if (!row) return null;
    const qualifies = Number(row.downloaded) >= MIN_DOWNLOADED;
    return {
      members: row.members, uploaded: row.uploaded, downloaded: row.downloaded,
      ratio: Number(row.downloaded) > 0 ? Number(row.uploaded) / Number(row.downloaded) : null,
      uploadRank: row.uploadRank, ratioRank: qualifies ? row.ratioRank : null, bonusRank: row.bonusRank, bonus: row.bonus,
      snatches: row.snatches, hnrOpen: row.hnrOpen, seedHours: Math.round(row.seedHours), uploads: row.uploads,
      minDownloadedGb: MIN_DOWNLOADED / 1e9,
    };
  }
}
