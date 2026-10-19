import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { QUEUES, delayStats, hoursSince, levelOf } from '../common/utils/staff-board';

const DAY = 86_400_000;
const ACTIONS: Record<string, string> = {
  TORRENT_APPROVE: 'validés', TORRENT_REJECT: 'refusés', TORRENT_HOLD: 'corrections demandées', USER_WARN: 'avertissements', USER_BAN: 'bannissements', SUGGESTION_STATUS: 'suggestions traitées', CHAT_BAN: 'bannissements du chat',
};

/** Tableau de bord de l'équipe : tout ce qui attend un traitement (avec l'attente la plus longue), les délais de traitement des 30 derniers jours et l'activité de l'équipe. */
@Injectable()
export class StaffBoardService {
  constructor(private prisma: PrismaService) {}

  /** Nombre et plus ancienne date de chaque file (une requête légère par file). */
  private async raw(userId: string) {
    const p = this.prisma;
    const oldest = <T extends { _min: any }>(r: T) => r._min as Record<string, Date | null>;
    const [torrents, corrections, reports, support, mySupport, cheats, suggestions, review, donations] = await Promise.all([
      p.torrent.aggregate({ where: { status: 'PENDING', holdAt: null, resubmittedAt: null }, _count: { _all: true }, _min: { createdAt: true } }),
      p.torrent.aggregate({ where: { status: 'PENDING', holdAt: null, resubmittedAt: { not: null } }, _count: { _all: true }, _min: { resubmittedAt: true } }),
      p.report.aggregate({ where: { status: 'OPEN' }, _count: { _all: true }, _min: { createdAt: true } }),
      p.supportTicket.aggregate({ where: { status: 'OPEN' }, _count: { _all: true }, _min: { lastReplyAt: true } }),
      p.supportTicket.count({ where: { status: 'OPEN', assigneeId: userId } }),
      p.cheatCase.aggregate({ where: { status: { in: ['OPEN', 'REVIEWING'] }, level: { in: ['SUSPECT', 'LIKELY', 'CRITICAL'] } }, _count: { _all: true }, _min: { firstFlaggedAt: true } }),
      p.suggestion.aggregate({ where: { status: 'OPEN' }, _count: { _all: true }, _min: { createdAt: true } }),
      p.importItem.aggregate({ where: { status: 'REVIEW' }, _count: { _all: true }, _min: { createdAt: true } }),
      p.donationEvent.aggregate({ where: { status: 'PENDING' }, _count: { _all: true }, _min: { createdAt: true } }),
    ]);
    return {
      torrents: { count: torrents._count._all, oldest: oldest(torrents).createdAt },
      corrections: { count: corrections._count._all, oldest: oldest(corrections).resubmittedAt },
      reports: { count: reports._count._all, oldest: oldest(reports).createdAt },
      support: { count: support._count._all, oldest: oldest(support).lastReplyAt, mine: mySupport },
      cheats: { count: cheats._count._all, oldest: oldest(cheats).firstFlaggedAt },
      suggestions: { count: suggestions._count._all, oldest: oldest(suggestions).createdAt },
      review: { count: review._count._all, oldest: oldest(review).createdAt },
      donations: { count: donations._count._all, oldest: oldest(donations).createdAt },
    } as Record<string, { count: number; oldest: Date | null; mine?: number }>;
  }

  async board(viewer: { userId: string; role: string }) {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY);
    const week = new Date(now.getTime() - 7 * DAY);
    const isAdmin = ['ADMIN', 'OWNER'].includes(viewer.role);
    const raw = await this.raw(viewer.userId);

    const [approved, firstReplies, acts, staff] = await Promise.all([
      this.prisma.torrent.findMany({ where: { approvedAt: { gte: since } }, take: 2000, select: { createdAt: true, approvedAt: true } }),
      this.prisma.supportTicket.findMany({ where: { firstResponseAt: { gte: since } }, take: 2000, select: { createdAt: true, firstResponseAt: true } }),
      this.prisma.activityLog.groupBy({ by: ['userId', 'action'], where: { createdAt: { gte: week }, action: { in: Object.keys(ACTIONS) }, userId: { not: null } }, _count: { _all: true } }),
      this.prisma.user.findMany({ where: { parentId: null, role: { in: ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] }, status: 'ACTIVE' }, select: { id: true, username: true, role: true, lastSeenAt: true } }),
    ]);

    const queues = QUEUES.filter((q) => isAdmin || !q.adminOnly).map((q) => {
      const r = raw[q.key];
      const age = hoursSince(r.oldest, now);
      return { key: q.key, label: q.label, icon: q.icon, link: q.link, count: r.count, oldestAt: r.oldest, oldestHours: age === null ? null : Math.round(age * 10) / 10, level: levelOf(r.count, age, q.warnHours, q.lateHours), mine: r.mine ?? null };
    });

    const names = new Map(staff.map((s) => [s.id, s]));
    const perStaff = new Map<string, Record<string, number>>();
    for (const a of acts) {
      if (!a.userId || !names.has(a.userId)) continue;
      const row = perStaff.get(a.userId) ?? {};
      row[a.action] = (row[a.action] ?? 0) + a._count._all;
      perStaff.set(a.userId, row);
    }
    const activity = [...perStaff.entries()].map(([id, row]) => ({
      id, username: names.get(id)!.username, role: names.get(id)!.role, total: Object.values(row).reduce((s, n) => s + n, 0),
      detail: Object.entries(row).map(([action, n]) => ({ action, label: ACTIONS[action], count: n })).sort((a, b) => b.count - a.count),
    })).sort((a, b) => b.total - a.total).slice(0, 10);

    const total = queues.reduce((s, q) => s + q.count, 0);
    return {
      generatedAt: now, total, late: queues.filter((q) => q.level === 'late').length, queues,
      delays: {
        torrentApprovalHours: delayStats(approved.filter((t) => t.approvedAt).map((t) => (t.approvedAt!.getTime() - t.createdAt.getTime()) / 3_600_000)),
        ticketFirstResponseHours: delayStats(firstReplies.filter((t) => t.firstResponseAt).map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 3_600_000)),
      },
      activity,
      onlineHint: staff.filter((s) => s.lastSeenAt && now.getTime() - s.lastSeenAt.getTime() < 15 * 60_000).map((s) => s.username),
    };
  }
}
