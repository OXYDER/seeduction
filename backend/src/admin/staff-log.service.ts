import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ACTIONS, CATEGORIES, type Category, actionsOf, csvCell, infoOf, summarize, targetOf } from '../common/utils/mod-log';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
export interface LogQuery { category?: string; action?: string; userId?: string; targetId?: string; q?: string; from?: string; to?: string; page?: number; pageSize?: number }

/** Journal de modération : les actions de l'équipe, lisibles et filtrables (qui, quoi, sur qui, quand). Les catégories sensibles (réglages, sécurité, dons) ne sont lues que par les administrateurs. */
@Injectable()
export class StaffLogService {
  constructor(private prisma: PrismaService) {}

  private allowed(role: string): Category[] {
    const admin = ['ADMIN', 'OWNER'].includes(role);
    return (Object.keys(CATEGORIES) as Category[]).filter((c) => admin || !CATEGORIES[c].adminOnly);
  }

  private async where(role: string, q: LogQuery): Promise<Prisma.ActivityLogWhereInput> {
    const allowed = this.allowed(role);
    const wanted = q.category && (allowed as string[]).includes(q.category) ? [q.category as Category] : allowed;
    const codes = wanted.flatMap((c) => actionsOf(c));
    const or: Prisma.ActivityLogWhereInput[] = [{ action: { in: codes } }];
    if (wanted.includes('config')) or.push({ action: { endsWith: '_CONFIG' } }); // les réglages de jeux et autres « X_CONFIG »
    const and: Prisma.ActivityLogWhereInput[] = [{ OR: or }, { userId: { not: null } }];
    if (q.action && ACTIONS[q.action] && wanted.includes(ACTIONS[q.action].category)) and.push({ action: q.action });
    if (q.userId) and.push({ userId: q.userId });
    if (q.targetId) and.push({ OR: ['targetId', 'torrentId', 'userId', 'suggestionId', 'topicId'].map((k) => ({ meta: { path: [k], equals: q.targetId } })) });
    const from = q.from ? new Date(q.from) : null, to = q.to ? new Date(q.to) : null;
    if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lt: new Date(to.getTime() + 86_400_000) } });
    const text = String(q.q ?? '').trim().slice(0, 80);
    if (text) {
      const like = `%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT a."id" FROM "ActivityLog" a LEFT JOIN "User" u ON u."id" = a."userId"
        WHERE a."meta"::text ILIKE ${like} OR u."username" ILIKE ${like} ORDER BY a."createdAt" DESC LIMIT 3000`;
      and.push({ id: { in: ids.map((r) => r.id) } });
    }
    return { AND: and };
  }

  private shape(row: any, admin: boolean) {
    const info = infoOf(row.action);
    return {
      id: row.id, at: row.createdAt, actor: row.user ? { id: row.user.id, username: row.user.username, role: row.user.role } : null, action: row.action, label: info.label, category: info.category, severity: info.severity,
      summary: summarize(row.action, row.meta), target: targetOf(row.action, row.meta), ip: admin ? row.ip : null,
    };
  }

  async list(role: string, q: LogQuery) {
    const admin = ['ADMIN', 'OWNER'].includes(role);
    const take = Math.min(100, Math.max(10, Math.floor(Number(q.pageSize) || 50)));
    const page = Math.max(1, Math.floor(Number(q.page) || 1));
    const where = await this.where(role, q);
    const [total, rows, actors] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take, include: { user: { select: { id: true, username: true, role: true } } } }),
      this.prisma.user.findMany({ where: { parentId: null, role: { in: STAFF as any }, status: 'ACTIVE' }, select: { id: true, username: true }, orderBy: { username: 'asc' } }),
    ]);
    return {
      total, page, pageSize: take, items: rows.map((r) => this.shape(r, admin)), actors,
      categories: this.allowed(role).map((c) => ({ key: c, ...CATEGORIES[c], actions: actionsOf(c).map((code) => ({ code, label: ACTIONS[code].label })) })),
    };
  }

  /** Fichier CSV (administrateurs) : jusqu'à 5000 lignes avec les mêmes filtres. */
  async exportCsv(role: string, q: LogQuery): Promise<string> {
    const where = await this.where(role, q);
    const rows = await this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000, include: { user: { select: { id: true, username: true, role: true } } } });
    const head = ['Date', 'Membre de l\'équipe', 'Rôle', 'Catégorie', 'Action', 'Cible', 'Détail', 'Adresse IP'].map(csvCell).join(',');
    const lines = rows.map((r) => {
      const s = this.shape(r, true);
      return [new Date(s.at).toISOString(), s.actor?.username ?? '', s.actor?.role ?? '', CATEGORIES[s.category].label, s.label, s.target?.label ?? '', s.summary, s.ip ?? ''].map(csvCell).join(',');
    });
    return '﻿' + [head, ...lines].join('\r\n');
  }
}
