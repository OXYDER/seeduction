import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import type { AnonymityCtx } from '../common/utils/anonymity';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/**
 * La liste des membres anonymes (comptes et profils famille de ces comptes), gardée en mémoire : chaque réponse du site la consulte pour masquer leurs pseudos.
 * Elle se recharge toutes les minutes et tout de suite quand l'équipe change un réglage (invalidate).
 */
@Injectable()
export class AnonymityService implements OnModuleInit {
  private readonly logger = new Logger(AnonymityService.name);
  private ids = new Set<string>();
  private names = new Set<string>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() { await this.refresh(); }

  @Interval(60_000)
  async refresh() {
    try {
      const rows = await this.prisma.user.findMany({ where: { OR: [{ anonymous: true }, { parent: { anonymous: true } }] }, select: { id: true, username: true } });
      this.ids = new Set(rows.map((r) => r.id));
      this.names = new Set(rows.map((r) => r.username.toLowerCase()));
    } catch (e) { this.logger.warn(`Membres anonymes : ${(e as Error).message}`); }
  }

  isAnonymous(userId: string): boolean { return this.ids.has(userId); }
  get size(): number { return this.ids.size; }

  /** Qui regarde : l'équipe voit tout ; un membre se voit lui-même (compte et profils). */
  contextFor(viewer?: { userId?: string; role?: string; accountId?: string; username?: string } | null): AnonymityCtx {
    const viewerIds = new Set<string>([viewer?.userId, viewer?.accountId].filter((x): x is string => !!x));
    return { ids: this.ids, names: this.names, viewerIds, viewerNames: new Set(viewer?.username ? [viewer.username.toLowerCase()] : []), viewerStaff: !!viewer?.role && STAFF.includes(viewer.role) };
  }
}
