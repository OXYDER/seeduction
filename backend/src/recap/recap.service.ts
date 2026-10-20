import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BADGES } from '../common/utils/badges';
import { sourceMeta } from '../common/utils/ledger';
import { RECAP_TZ, bestDay, compare, dailyGains, monthKeyOf, monthRange, previousMonth, summarizeWatching } from '../common/utils/recap';

const CACHE_MS = 10 * 60_000;

/**
 * « Mon récap du mois » : ce que j'ai partagé (meilleur jour de partage), regardé (séries et films dans le lecteur Seeduction), gagné (points par source, badges)
 * et ma position parmi les autres membres, sans jamais nommer personne. Chaque mois, une notification annonce le récap du mois écoulé.
 */
@Injectable()
export class RecapService {
  private readonly logger = new Logger(RecapService.name);
  private cmp = new Map<string, { at: number; up: Map<string, number>; pts: Map<string, number> }>();

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Les 12 derniers mois (le mois en cours compris), du plus récent au plus ancien. */
  months(createdAt: Date) {
    const out: { key: string; label: string; current: boolean }[] = [];
    let key = monthKeyOf(new Date());
    const first = monthKeyOf(createdAt);
    for (let i = 0; i < 12; i++) {
      const r = monthRange(key)!;
      out.push({ key, label: r.label, current: i === 0 });
      if (key <= first) break;
      key = previousMonth(key);
    }
    return out;
  }

  /** Ce que chaque membre a gagné en upload et en points dans le mois (comptes principaux, sans robot ni comptes supprimés), pour se situer. Mis en cache dix minutes. */
  private async everyone(range: { key: string; start: Date; end: Date }) {
    const hit = this.cmp.get(range.key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const until = new Date(range.end.getTime() + 12 * 3_600_000);
    const [up, pts] = await Promise.all([
      this.prisma.$queryRaw<{ userId: string; gained: number }[]>`
        WITH last_in AS (SELECT DISTINCT ON ("userId") "userId", uploaded FROM "RatioSnapshot" WHERE "takenAt" >= ${range.start} AND "takenAt" < ${until} ORDER BY "userId", "takenAt" DESC),
             base AS (SELECT DISTINCT ON ("userId") "userId", uploaded FROM "RatioSnapshot" WHERE "takenAt" < ${range.start} ORDER BY "userId", "takenAt" DESC)
        SELECT l."userId", GREATEST(0, l.uploaded - COALESCE(b.uploaded, l.uploaded))::float8 AS gained
        FROM last_in l LEFT JOIN base b ON b."userId" = l."userId" JOIN "User" u ON u.id = l."userId"
        WHERE u."parentId" IS NULL AND u."deletedAt" IS NULL AND u."profileType" <> 'BOT' AND u."status" = 'ACTIVE'`,
      this.prisma.$queryRaw<{ userId: string; earned: number }[]>`
        SELECT p."userId", SUM(p.credit)::float8 AS earned FROM "PointsLedger" p JOIN "User" u ON u.id = p."userId"
        WHERE p."hour" >= ${range.start} AND p."hour" < ${range.end} AND u."parentId" IS NULL AND u."deletedAt" IS NULL AND u."profileType" <> 'BOT' AND u."status" = 'ACTIVE'
        GROUP BY p."userId"`,
    ]);
    const value = { at: Date.now(), up: new Map(up.map((r) => [r.userId, r.gained])), pts: new Map(pts.map((r) => [r.userId, r.earned])) };
    this.cmp.set(range.key, value);
    if (this.cmp.size > 6) this.cmp.delete(this.cmp.keys().next().value as string);
    return value;
  }

  async monthly(userId: string, key?: string) {
    const nowKey = monthKeyOf(new Date());
    const range = monthRange(key || nowKey);
    if (!range) throw new BadRequestException('Mois invalide (AAAA-MM)');
    if (range.start.getTime() > Date.now()) throw new BadRequestException('Ce mois n\'a pas encore commencé');
    const until = new Date(range.end.getTime() + 12 * 3_600_000);
    const inMonth = { gte: range.start, lt: range.end };

    const [snaps, base, positions, ledger, badgeRows, completed, uploadsApproved, comments, forumPosts, everyone] = await Promise.all([
      this.prisma.ratioSnapshot.findMany({ where: { userId, takenAt: { gte: range.start, lt: until } }, orderBy: { takenAt: 'asc' }, select: { takenAt: true, uploaded: true, downloaded: true } }),
      this.prisma.ratioSnapshot.findFirst({ where: { userId, takenAt: { lt: range.start } }, orderBy: { takenAt: 'desc' }, select: { takenAt: true, uploaded: true, downloaded: true } }),
      this.prisma.playbackPosition.findMany({
        where: { userId, updatedAt: inMonth, torrent: { category: { adult: false, OR: [{ parentId: null }, { parent: { adult: false } }] } } },
        select: { torrentId: true, fileIndex: true, positionSeconds: true, durationSeconds: true, torrent: { select: { name: true, season: true, episode: true, metaSource: true, metaExternalId: true, coverImage: true } } },
        take: 2000,
      }),
      this.prisma.pointsLedger.groupBy({ by: ['source'], where: { userId, hour: inMonth }, _sum: { credit: true, debit: true } }),
      this.prisma.userBadge.findMany({ where: { userId, awardedAt: inMonth }, orderBy: { awardedAt: 'asc' }, select: { code: true, awardedAt: true } }),
      this.prisma.snatch.count({ where: { userId, completedAt: inMonth } }),
      this.prisma.torrent.count({ where: { uploaderId: userId, approvedAt: inMonth } }),
      this.prisma.torrentComment.count({ where: { authorId: userId, createdAt: inMonth } }),
      this.prisma.forumPost.count({ where: { authorId: userId, createdAt: inMonth } }),
      this.everyone(range),
    ]);

    const toNum = (s: { takenAt: Date; uploaded: bigint; downloaded: bigint }) => ({ takenAt: s.takenAt, uploaded: Number(s.uploaded), downloaded: Number(s.downloaded) });
    const days = dailyGains(snaps.map(toNum), base ? toNum(base) : null, range);
    const best = bestDay(days);
    const uploaded = days.reduce((n, d) => n + d.up, 0), downloaded = days.reduce((n, d) => n + d.down, 0);

    const watching = summarizeWatching(positions.map((p) => ({ torrentId: p.torrentId, fileIndex: p.fileIndex, positionSeconds: p.positionSeconds, durationSeconds: p.durationSeconds, ...p.torrent })));

    const bySource = ledger.map((l) => ({ source: l.source, label: sourceMeta(l.source).label, credit: Math.round(l._sum.credit ?? 0), debit: Math.round(l._sum.debit ?? 0) })).filter((l) => l.credit > 0 || l.debit > 0).sort((a, b) => b.credit - a.credit);
    const earned = bySource.reduce((n, s) => n + s.credit, 0), spent = bySource.reduce((n, s) => n + s.debit, 0);

    // Comparaison : seulement avec les membres qui ont de l'activité dans le mois ; jamais de nom.
    const upOthers = [...everyone.up].filter(([id, v]) => id !== userId && v > 0).map(([, v]) => v);
    const ptsOthers = [...everyone.pts].filter(([id, v]) => id !== userId && v > 0).map(([, v]) => v);
    const round = (c: ReturnType<typeof compare>) => c && { ...c, median: Math.round(c.median), average: Math.round(c.average) };

    return {
      month: { key: range.key, label: range.label, days: range.days, current: range.key === nowKey },
      sharing: { uploaded, downloaded, best, daily: days.map((d) => ({ day: d.day, up: d.up })), activeDays: days.filter((d) => d.up > 0).length, hasData: snaps.length > 0 },
      watching,
      points: { earned, spent, net: earned - spent, bySource },
      badges: badgeRows.map((b) => { const def = BADGES.find((x) => x.code === b.code); return { code: b.code, name: def?.name ?? b.code, icon: def?.icon ?? '🏅', points: def?.points ?? 0, awardedAt: b.awardedAt }; }),
      activity: { completed, uploadsApproved, comments, forumPosts },
      compare: { upload: uploaded > 0 ? round(compare(uploaded, upOthers)) : null, points: earned > 0 ? round(compare(earned, ptsOthers)) : null },
    };
  }

  /** Le 1er de chaque mois à 9 h (Montréal) : annonce le récap du mois écoulé aux membres actifs (désactivable : catégorie « Nouvelles et événements »). */
  @Cron('0 9 1 * *', { timeZone: RECAP_TZ })
  async announceLastMonth() {
    try {
      const key = previousMonth(monthKeyOf(new Date()));
      const range = monthRange(key)!;
      const users = await this.prisma.user.findMany({ where: { parentId: null, status: 'ACTIVE', deletedAt: null, profileType: { not: 'BOT' }, lastSeenAt: { gte: new Date(Date.now() - 45 * 86_400_000) } }, select: { id: true }, take: 20_000 });
      let n = 0;
      for (const u of users) {
        await this.notifications.notify({
          userId: u.id, type: 'ANNOUNCEMENT', category: 'announcements', groupKey: `recap:${key}`,
          title: `📅 Ton récap de ${range.label} est prêt`, body: 'Ton meilleur jour de partage, les séries que tu as regardées, tes points et ta position parmi les membres.', link: `/recap?mois=${key}`,
        }).then(() => { n++; }).catch(() => undefined);
      }
      this.logger.log(`Récap de ${range.label} annoncé à ${n} membre(s)`);
    } catch (e: any) { this.logger.warn(`Annonce du récap mensuel impossible : ${e?.message ?? e}`); }
  }
}
