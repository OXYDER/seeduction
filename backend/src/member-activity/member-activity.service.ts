import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

export interface ActivityInput {
  accountId: string;
  userId: string;
  category: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  /** Ne pas renoter la même action sur la même cible pendant ce délai. */
  dedupeMs?: number;
}

export const CATEGORY_LABEL: Record<string, string> = {
  download: 'Téléchargements', upload: 'Envois', view: 'Consultations', search: 'Recherches', comment: 'Commentaires', forum: 'Forum', social: 'Social',
  message: 'Messagerie', economy: 'Bonus', settings: 'Réglages', team: 'Teams', family: 'Compte famille', security: 'Sécurité', staff: 'Staff', other: 'Autres',
};

/** Actions du journal d'audit (connexions, sécurité, modération), en français. */
const AUDIT_LABEL: Record<string, string> = {
  LOGIN: 'Se connecte', LOGIN_FAILED: 'Échec de connexion', PASSWORD_CHANGE: 'Change son mot de passe', PASSWORD_RESET: 'Réinitialise son mot de passe',
  RESET_LINK_EMAILED: 'Demande un lien de réinitialisation', RESET_LINK_ISSUED: 'Lien de réinitialisation généré', TWO_FACTOR_ENABLED: 'Active la double authentification',
  TWO_FACTOR_DISABLED: 'Désactive la double authentification', USER_WARN: 'Avertissement', USER_BAN: 'Bannissement', USER_UNBAN: 'Débannissement',
  USER_EDIT: 'Compte modifié par le staff', USER_CLEAR_HNR: 'H&R effacé', USER_WARNING_DELETE: 'Avertissement retiré', USER_PASSKEY_RESET: 'Passkey régénérée',
  TORRENT_APPROVE: 'Approuve un torrent', TORRENT_REJECT: 'Rejette un torrent', TORRENT_EDIT: 'Modifie un torrent', TORRENT_DELETE: 'Supprime un torrent',
};

const RETENTION_DAYS = Math.max(7, Number(process.env.MEMBER_ACTIVITY_DAYS ?? 180) || 180);

/** Journal des actions de chaque membre (voir MemberActivityInterceptor) : écriture sans jamais bloquer ni faire échouer l'action. */
@Injectable()
export class MemberActivityService {
  private readonly logger = new Logger(MemberActivityService.name);
  private readonly recent = new Map<string, number>();

  constructor(private prisma: PrismaService) {}

  async record(a: ActivityInput) {
    try {
      if (a.dedupeMs) {
        const key = `${a.userId}|${a.action}|${a.targetId ?? ''}|${a.detail ?? ''}`;
        const now = Date.now();
        const last = this.recent.get(key);
        if (last && now - last < a.dedupeMs) return;
        this.recent.set(key, now);
        if (this.recent.size > 5000) for (const [k, t] of this.recent) if (now - t > 10 * 60_000) this.recent.delete(k);
      }
      await this.prisma.memberActivity.create({
        data: {
          accountId: a.accountId, userId: a.userId, category: a.category, action: a.action.slice(0, 120),
          targetType: a.targetType, targetId: a.targetId, detail: a.detail ? a.detail.replace(/\s+/g, ' ').slice(0, 300) : null, ip: a.ip,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Journal d'activité : écriture impossible (${err?.message ?? err})`);
    }
  }

  /** Purge quotidienne des lignes trop anciennes (MEMBER_ACTIVITY_DAYS, 180 jours par défaut). */
  @Cron('30 4 * * *')
  async purge() {
    const r = await this.prisma.memberActivity.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } });
    if (r.count) this.logger.log(`Journal d'activité : ${r.count} ligne(s) de plus de ${RETENTION_DAYS} jours supprimée(s)`);
  }

  /**
   * Journal d'un membre (tous les profils de son compte famille compris). `category` = une catégorie, « security » pour
   * les connexions et l'historique de modération (journal d'audit), ou vide pour tout ce que le membre a fait.
   */
  async list(userId: string, opts: { page: number; category?: string; pageSize?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, parentId: true, username: true } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const accountId = user.parentId ?? user.id;
    const profiles = await this.prisma.user.findMany({ where: { OR: [{ id: accountId }, { parentId: accountId }] }, select: { id: true, username: true, profileName: true, parentId: true } });
    const ids = profiles.map((p) => p.id);
    const profileOf = new Map(profiles.map((p) => [p.id, p.parentId ? p.profileName ?? p.username : null]));
    const take = opts.pageSize ?? 50;
    const page = Math.max(1, opts.page || 1);

    const counts = await this.prisma.memberActivity.groupBy({ by: ['category'], where: { accountId }, _count: { _all: true } });
    const auditWhere: any = { OR: [{ userId: { in: ids } }, ...ids.map((i) => ({ meta: { path: ['targetId'], equals: i } }))] };
    const auditCount = await this.prisma.activityLog.count({ where: auditWhere });
    const countMap: Record<string, number> = Object.fromEntries(counts.map((c) => [c.category, c._count._all]));
    const total = counts.reduce((n, c) => n + c._count._all, 0);

    if (opts.category === 'security') {
      const [rows, n] = await Promise.all([
        this.prisma.activityLog.findMany({ where: auditWhere, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take, include: { user: { select: { id: true, username: true } } } }),
        Promise.resolve(auditCount),
      ]);
      const items = rows.map((r) => {
        const meta: any = r.meta ?? {};
        const onMember = ids.includes(meta.targetId) && r.userId !== meta.targetId;
        return {
          id: r.id, at: r.createdAt, category: 'security', ip: r.ip,
          verb: AUDIT_LABEL[r.action] ?? r.action,
          profile: null,
          target: null,
          detail: [onMember && r.user ? `par ${r.user.username}` : null, meta.reason, meta.name, meta.changes ? `modif. : ${Object.keys(meta.changes).join(', ')}` : null, meta.username && r.action === 'LOGIN_FAILED' ? `identifiant « ${meta.username} »` : null].filter(Boolean).join(' · ') || null,
          staffOnMember: onMember,
        };
      });
      return { total: n, page, pageSize: take, items, counts: countMap, allCount: total, securityCount: auditCount, categories: CATEGORY_LABEL };
    }

    const where: any = { accountId };
    if (opts.category && opts.category !== 'all') where.category = opts.category;
    const [rows, n] = await Promise.all([
      this.prisma.memberActivity.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
      this.prisma.memberActivity.count({ where }),
    ]);
    const idsOf = (t: string) => [...new Set(rows.filter((r) => r.targetType === t && r.targetId).map((r) => r.targetId as string))];
    const [torrents, users, topics, teams] = await Promise.all([
      this.prisma.torrent.findMany({ where: { id: { in: idsOf('torrent') } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: idsOf('user') } }, select: { id: true, username: true } }),
      this.prisma.forumTopic.findMany({ where: { id: { in: idsOf('topic') } }, select: { id: true, title: true } }).catch(() => [] as { id: string; title: string }[]),
      this.prisma.team.findMany({ where: { id: { in: idsOf('team') } }, select: { id: true, name: true } }),
    ]);
    const names: Record<string, Map<string, string>> = {
      torrent: new Map(torrents.map((t) => [t.id, t.name])), user: new Map(users.map((u) => [u.id, u.username])),
      topic: new Map(topics.map((t) => [t.id, t.title])), team: new Map(teams.map((t) => [t.id, t.name])),
    };
    const gone: Record<string, string> = { torrent: '(torrent supprimé)', user: '(membre supprimé)', topic: '(sujet supprimé)', team: '(team supprimée)' };
    const items = rows.map((r) => ({
      id: r.id, at: r.createdAt, category: r.category, ip: r.ip, verb: r.action, detail: r.detail,
      profile: profileOf.get(r.userId) ?? null,
      target: r.targetType && r.targetId ? { type: r.targetType, id: r.targetId, label: names[r.targetType]?.get(r.targetId) ?? gone[r.targetType] ?? r.targetId } : null,
    }));
    return { total: n, page, pageSize: take, items, counts: countMap, allCount: total, securityCount: auditCount, categories: CATEGORY_LABEL };
  }
}
