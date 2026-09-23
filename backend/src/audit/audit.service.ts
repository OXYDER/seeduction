import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Journal d'audit : qui a fait quoi (actions du staff, connexions, sécurité).
 * Écrire dans le journal ne doit jamais faire échouer l'action elle-même.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(actorId: string | null | undefined, action: string, meta?: Record<string, any>, ip?: string | null) {
    try {
      await this.prisma.activityLog.create({
        data: { userId: actorId ?? null, action, meta: (meta ?? undefined) as any, ip: ip ?? null },
      });
    } catch (err: any) {
      this.logger.warn(`Journal d'audit : écriture impossible (${err?.message ?? err})`);
    }
  }

  list(params: { action?: string; userId?: string; page: number; pageSize?: number }) {
    const take = params.pageSize ?? 50;
    const where: any = {};
    if (params.action) where.action = params.action.startsWith('~') ? { startsWith: params.action.slice(1) } : params.action;
    if (params.userId) where.userId = params.userId;
    return Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Math.max(1, params.page) - 1) * take,
        take,
        include: { user: { select: { id: true, username: true, role: true } } },
      }),
    ]).then(([total, items]) => ({ total, items, page: Math.max(1, params.page), pageSize: take }));
  }
}

@Global()
@Module({
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
