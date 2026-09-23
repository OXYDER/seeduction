import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const TARGET_TYPES = ['torrent', 'user', 'forumPost', 'comment'] as const;
type TargetType = (typeof TARGET_TYPES)[number];

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async targetExists(type: TargetType, id: string): Promise<boolean> {
    switch (type) {
      case 'torrent': return !!(await this.prisma.torrent.findUnique({ where: { id }, select: { id: true } }));
      case 'user': return !!(await this.prisma.user.findUnique({ where: { id }, select: { id: true } }));
      case 'forumPost': return !!(await this.prisma.forumPost.findUnique({ where: { id }, select: { id: true } }));
      case 'comment': return !!(await this.prisma.torrentComment.findUnique({ where: { id }, select: { id: true } }));
    }
  }

  async create(reporterId: string, targetType: string, targetId: string, reason: string) {
    if (!(TARGET_TYPES as readonly string[]).includes(targetType)) throw new BadRequestException('Type de signalement invalide');
    const text = reason?.trim();
    if (!text || text.length < 5) throw new BadRequestException('Explique brièvement le problème (5 caractères minimum)');
    if (text.length > 1000) throw new BadRequestException('Motif trop long (1000 caractères maximum)');
    if (!(await this.targetExists(targetType as TargetType, targetId))) throw new NotFoundException('Élément introuvable');

    const already = await this.prisma.report.findFirst({ where: { reporterId, targetType, targetId, status: 'OPEN' }, select: { id: true } });
    if (already) throw new BadRequestException('Tu as déjà signalé cet élément : le staff va le traiter.');
    // Anti-spam : pas plus de 10 signalements ouverts par membre.
    const open = await this.prisma.report.count({ where: { reporterId, status: 'OPEN' } });
    if (open >= 10) throw new BadRequestException('Trop de signalements en attente : patiente le temps que le staff les traite.');

    await this.prisma.report.create({ data: { reporterId, targetType, targetId, reason: text } });
    return { reported: true };
  }

  /** Liste enrichie pour le staff : qui a signalé, quoi, et un lien direct vers l'élément. */
  async listForStaff(status: 'OPEN' | 'RESOLVED' | 'DISMISSED') {
    const reports = await this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { reporter: { select: { id: true, username: true } } },
    });
    return Promise.all(reports.map(async (r) => {
      let label = r.targetId;
      let link: string | null = null;
      if (r.targetType === 'torrent') {
        const t = await this.prisma.torrent.findUnique({ where: { id: r.targetId }, select: { name: true } });
        label = t?.name ?? '(torrent supprimé)';
        link = t ? `/torrents/${r.targetId}` : null;
      } else if (r.targetType === 'user') {
        const u = await this.prisma.user.findUnique({ where: { id: r.targetId }, select: { username: true } });
        label = u?.username ?? '(membre supprimé)';
        link = u ? `/users/${r.targetId}` : null;
      } else if (r.targetType === 'forumPost') {
        const p = await this.prisma.forumPost.findUnique({ where: { id: r.targetId }, select: { topicId: true, content: true, topic: { select: { title: true } } } });
        label = p ? `Message dans « ${p.topic.title} »` : '(message supprimé)';
        link = p ? `/forum/topics/${p.topicId}` : null;
      } else if (r.targetType === 'comment') {
        const c = await this.prisma.torrentComment.findUnique({ where: { id: r.targetId }, select: { torrentId: true, content: true } });
        label = c ? `Commentaire : « ${c.content.slice(0, 80)} »` : '(commentaire supprimé)';
        link = c ? `/torrents/${c.torrentId}` : null;
      }
      return { ...r, label, link };
    }));
  }
}
