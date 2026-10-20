import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AdminService, Actor } from '../admin/admin.service';
import { FIX_FIELDS, FIX_NOTE_MAX, FIX_PENDING_MAX, FIX_PER_DAY_MAX, FIX_REWARD, FIX_REWARDS_PER_DAY, diffFixChanges, fixProblem, sanitizeFixChanges } from '../common/utils/torrent-fix';

const DAY = 86_400_000;
const CURRENT = { name: true, language: true, resolution: true, source: true, codec: true, audio: true, season: true, episode: true, year: true, categoryId: true } as const;

/**
 * Corrections proposées par les membres : un membre qui repère une erreur (langue, qualité, saison / épisode...) ou quelque chose de louche sur un envoi propose une correction avec son explication ;
 * elle arrive dans la file de modération, où l'équipe l'applique en un clic ou la refuse. Rien n'est jamais modifié sans l'accord du staff.
 */
@Injectable()
export class TorrentFixesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private audit: AuditService, private admin: AdminService) {}

  async propose(authorId: string, torrentId: string, body: { changes?: unknown; note?: string }) {
    const torrent = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true, uploaderId: true, status: true, ...CURRENT } });
    if (!torrent || !['APPROVED', 'PENDING'].includes(torrent.status)) throw new NotFoundException('Torrent introuvable');
    if (torrent.uploaderId === authorId) throw new BadRequestException('C\'est ton torrent : corrige-le directement avec « Modifier mon torrent ».');
    const author = await this.prisma.user.findUnique({ where: { id: authorId }, select: { status: true, createdAt: true, deletedAt: true } });
    if (!author || author.status !== 'ACTIVE' || author.deletedAt) throw new ForbiddenException('Compte non autorisé');
    if (Date.now() - author.createdAt.getTime() < DAY) throw new ForbiddenException('Tu pourras proposer des corrections après ta première journée sur le site.');

    let changes;
    try { changes = sanitizeFixChanges(body?.changes); } catch (e: any) { throw new BadRequestException(e.message); }
    if (changes.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: String(changes.categoryId) }, select: { id: true, _count: { select: { children: true } } } });
      if (!cat) throw new BadRequestException('Catégorie introuvable');
      if (cat._count.children > 0) throw new BadRequestException('Choisis une sous-catégorie');
    }
    const diff = diffFixChanges(torrent as unknown as Record<string, unknown>, changes);
    const note = String(body?.note ?? '').trim().slice(0, FIX_NOTE_MAX);
    const problem = fixProblem(diff, note);
    if (problem) throw new BadRequestException(problem);

    const [pending, sameTorrent, today] = await Promise.all([
      this.prisma.torrentFix.count({ where: { authorId, status: 'PENDING' } }),
      this.prisma.torrentFix.count({ where: { authorId, torrentId, status: 'PENDING' } }),
      this.prisma.torrentFix.count({ where: { authorId, createdAt: { gte: new Date(Date.now() - DAY) } } }),
    ]);
    if (sameTorrent > 0) throw new BadRequestException('Tu as déjà une correction en attente sur ce torrent : laisse l\'équipe la traiter.');
    if (pending >= FIX_PENDING_MAX) throw new BadRequestException(`Tu as déjà ${FIX_PENDING_MAX} corrections en attente : attends qu'elles soient traitées.`);
    if (today >= FIX_PER_DAY_MAX) throw new BadRequestException('Limite de corrections atteinte pour aujourd\'hui.');

    return this.prisma.torrentFix.create({ data: { torrentId, authorId, changes: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.to])), note } });
  }

  private async shape(rows: { id: string; torrentId: string; authorId: string; changes: any; note: string | null; status: string; reviewedByName: string | null; reviewNote: string | null; reviewedAt: Date | null; createdAt: Date }[], withTorrent: boolean) {
    const torrents = await this.prisma.torrent.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.torrentId))] } }, select: { id: true, coverImage: true, status: true, ...CURRENT, category: { select: { name: true } } } });
    const authors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, username: true, role: true, createdAt: true } });
    const tmap = new Map(torrents.map((t) => [t.id, t]));
    const amap = new Map(authors.map((a) => [a.id, a]));
    const catIds = [...new Set(rows.map((r) => (r.changes as any)?.categoryId).filter(Boolean))] as string[];
    const cats = catIds.length ? new Map((await this.prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name])) : new Map<string, string>();
    return rows.map((r) => {
      const t = tmap.get(r.torrentId);
      const changes = (r.changes ?? {}) as Record<string, string | number>;
      const diff = t ? diffFixChanges(t as unknown as Record<string, unknown>, changes) : {};
      return {
        id: r.id, status: r.status, note: r.note, createdAt: r.createdAt, reviewedByName: r.reviewedByName, reviewNote: r.reviewNote, reviewedAt: r.reviewedAt,
        author: amap.get(r.authorId) ?? null,
        ...(withTorrent ? { torrent: t ? { id: t.id, name: t.name, coverImage: t.coverImage, category: t.category?.name ?? null } : null } : {}),
        changes: Object.entries(r.status === 'PENDING' ? diff : Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { from: null, to: v }]))).map(([field, d]) => ({
          field, label: FIX_FIELDS[field]?.label ?? field,
          from: field === 'categoryId' ? (t?.category?.name ?? null) : d.from, to: field === 'categoryId' ? (cats.get(String(d.to)) ?? String(d.to)) : d.to,
        })),
      };
    });
  }

  /** Corrections d'un torrent : toutes celles en attente et les dernières traitées pour l'équipe ; pour un membre, seulement les siennes. */
  async forTorrent(torrentId: string, viewerId: string, staff: boolean) {
    const rows = await this.prisma.torrentFix.findMany({ where: { torrentId, ...(staff ? {} : { authorId: viewerId }) }, orderBy: { createdAt: 'desc' }, take: 30 });
    return this.shape(rows, false);
  }

  /** File de modération : corrections en attente, les plus anciennes d'abord. */
  async queue() {
    const rows = await this.prisma.torrentFix.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 200 });
    return this.shape(rows, true);
  }

  async pendingCount() {
    return this.prisma.torrentFix.count({ where: { status: 'PENDING' } });
  }

  private async load(id: string) {
    const fix = await this.prisma.torrentFix.findUnique({ where: { id } });
    if (!fix) throw new NotFoundException('Correction introuvable');
    if (fix.status !== 'PENDING') throw new BadRequestException('Cette correction a déjà été traitée');
    return fix;
  }

  /** Applique la correction au torrent (comme une modification du staff), remercie l'auteur et prévient l'envoyeur. */
  async accept(actor: Actor, fixId: string, note?: string) {
    const fix = await this.load(fixId);
    const torrent = await this.prisma.torrent.findUnique({ where: { id: fix.torrentId }, select: { id: true, name: true, uploaderId: true } });
    if (!torrent) throw new NotFoundException('Torrent introuvable');
    const changes = (fix.changes ?? {}) as Record<string, string | number>;
    if (Object.keys(changes).length > 0) {
      try { await this.admin.updateTorrent(fix.torrentId, changes); } catch (e: any) { throw new BadRequestException(`Application impossible : ${e?.message ?? 'valeur refusée'}`); }
    }
    await this.prisma.torrentFix.update({ where: { id: fixId }, data: { status: 'ACCEPTED', reviewedById: actor.userId, reviewedByName: actor.username.slice(0, 60), reviewNote: note?.trim().slice(0, 300) || null, reviewedAt: new Date() } });

    // Remerciement : quelques points, plafonnés par jour (une correction qui ne change rien — simple signalement — est remerciée sans points).
    const rewarded = await this.prisma.torrentFix.count({ where: { authorId: fix.authorId, status: 'ACCEPTED', reviewedAt: { gte: new Date(Date.now() - DAY) } } });
    const pay = Object.keys(changes).length > 0 && rewarded <= FIX_REWARDS_PER_DAY;
    if (pay) await this.prisma.user.update({ where: { id: fix.authorId }, data: { bonusPoints: { increment: FIX_REWARD } } });
    await this.notifications.notify({
      userId: fix.authorId, type: 'SYSTEM', category: 'torrents', title: '✅ Ta correction a été appliquée',
      body: `${torrent.name}${pay ? ` · +${FIX_REWARD} points, merci !` : ' · merci !'}`, link: `/torrents/${torrent.id}`,
    }).catch(() => undefined);
    if (Object.keys(changes).length > 0 && torrent.uploaderId !== fix.authorId) {
      await this.notifications.notify({
        userId: torrent.uploaderId, type: 'SYSTEM', category: 'torrents', title: '✏️ Une correction a été appliquée à ton torrent',
        body: `${torrent.name} : ${Object.keys(changes).map((k) => FIX_FIELDS[k]?.label ?? k).join(', ')} (corrigé sur proposition d'un membre, validé par l'équipe).`, link: `/torrents/${torrent.id}`,
      }).catch(() => undefined);
    }
    await this.audit.log(actor.userId, 'TORRENT_FIX_ACCEPT', { torrentId: torrent.id, name: torrent.name, fixId, fields: Object.keys(changes), targetId: fix.authorId });
    return { ok: true, rewarded: pay ? FIX_REWARD : 0 };
  }

  async reject(actor: Actor, fixId: string, reason?: string) {
    const fix = await this.load(fixId);
    const why = String(reason ?? '').trim().slice(0, 300);
    const torrent = await this.prisma.torrent.findUnique({ where: { id: fix.torrentId }, select: { id: true, name: true } });
    await this.prisma.torrentFix.update({ where: { id: fixId }, data: { status: 'REJECTED', reviewedById: actor.userId, reviewedByName: actor.username.slice(0, 60), reviewNote: why || null, reviewedAt: new Date() } });
    await this.notifications.notify({
      userId: fix.authorId, type: 'SYSTEM', category: 'torrents', title: 'Ta correction n\'a pas été retenue',
      body: `${torrent?.name ?? ''}${why ? ` · ${why}` : ''}`.slice(0, 250), link: torrent ? `/torrents/${torrent.id}` : '/browse',
    }).catch(() => undefined);
    await this.audit.log(actor.userId, 'TORRENT_FIX_REJECT', { torrentId: torrent?.id, name: torrent?.name, fixId, reason: why, targetId: fix.authorId });
    return { ok: true };
  }

  /** L'auteur retire sa propre correction tant qu'elle n'est pas traitée. */
  async withdraw(authorId: string, fixId: string) {
    const fix = await this.load(fixId);
    if (fix.authorId !== authorId) throw new ForbiddenException();
    await this.prisma.torrentFix.delete({ where: { id: fixId } });
    return { ok: true };
  }
}
