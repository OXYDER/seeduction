import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';

export interface InviteInput {
  /** Texte du code (4 à 32 caractères A-Z, 0-9, - ou _) ; vide = codes aléatoires. */
  code?: string;
  label?: string;
  /** Début de validité (programmation) ; vide = actif tout de suite. */
  startsAt?: string | null;
  /** Fin de validité (date ISO) ; vide = sans limite de temps. */
  expiresAt?: string | null;
  maxUses?: number;
  perIpOnce?: boolean;
  /** Nombre de codes aléatoires à créer d'un coup (ignoré avec un code personnalisé). */
  count?: number;
}

const CODE_FORMAT = /^[A-Z0-9_-]{4,32}$/;

/** Statut d'un code, du point de vue de l'administrateur. */
function statusOf(i: { disabled: boolean; used: boolean; useCount: number; maxUses: number; startsAt: Date | null; expiresAt: Date | null }) {
  const now = Date.now();
  if (i.disabled) return 'disabled';
  if (i.used || i.useCount >= i.maxUses) return 'exhausted';
  if (i.expiresAt && i.expiresAt.getTime() < now) return 'expired';
  if (i.startsAt && i.startsAt.getTime() > now) return 'scheduled';
  return 'active';
}

/**
 * Codes d'invitation « génériques » créés par l'administration : durée de validité choisie (et début programmé), nombre
 * d'inscriptions permises, et si besoin une seule inscription par adresse IP. L'utilisation des codes est enregistrée
 * (qui, depuis quelle IP, quand) dans InviteUse — la vérification elle-même se fait à l'inscription (AuthService.register).
 */
@Injectable()
export class AdminInvitesService {
  constructor(private prisma: PrismaService) {}

  private parseDate(value: string | null | undefined, label: string): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} : date invalide`);
    return d;
  }

  async list(includeMembers = false) {
    const rows = await this.prisma.inviteCode.findMany({
      where: includeMembers ? undefined : { generic: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { createdBy: { select: { id: true, username: true } }, _count: { select: { uses: true } } },
    });
    return rows.map((r) => ({
      id: r.id, code: r.code, label: r.label, generic: r.generic, createdAt: r.createdAt, startsAt: r.startsAt, expiresAt: r.expiresAt,
      maxUses: r.maxUses, useCount: r.useCount, perIpOnce: r.perIpOnce, disabled: r.disabled, createdBy: r.createdBy,
      status: statusOf(r),
    }));
  }

  async create(adminId: string, input: InviteInput) {
    const maxUses = Math.floor(Number(input.maxUses ?? 1));
    if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 1000) throw new BadRequestException("Le nombre d'inscriptions doit être entre 1 et 1000");
    const startsAt = this.parseDate(input.startsAt, 'Début');
    const expiresAt = this.parseDate(input.expiresAt, 'Fin');
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException('La date de fin est déjà passée');
    if (startsAt && expiresAt && startsAt >= expiresAt) throw new BadRequestException('Le début doit être avant la fin');
    const label = (input.label ?? '').trim().slice(0, 80) || null;

    const custom = (input.code ?? '').trim().toUpperCase();
    if (custom) {
      if (!CODE_FORMAT.test(custom)) throw new BadRequestException('Le code doit faire 4 à 32 caractères : lettres, chiffres, - ou _');
      if (await this.prisma.inviteCode.findUnique({ where: { code: custom }, select: { id: true } })) throw new BadRequestException('Ce code existe déjà');
    }
    const count = custom ? 1 : Math.min(20, Math.max(1, Math.floor(Number(input.count ?? 1)) || 1));

    const created: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = custom || randomBytes(8).toString('hex').toUpperCase();
      await this.prisma.inviteCode.create({
        data: { code, createdById: adminId, generic: true, label, maxUses, perIpOnce: !!input.perIpOnce, startsAt, expiresAt },
      });
      created.push(code);
    }
    return { codes: created };
  }

  async update(id: string, body: { disabled?: boolean; maxUses?: number; expiresAt?: string | null; label?: string; perIpOnce?: boolean }) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Code introuvable');
    const data: Record<string, any> = {};
    if (typeof body.disabled === 'boolean') data.disabled = body.disabled;
    if (body.maxUses !== undefined) {
      const n = Math.floor(Number(body.maxUses));
      if (!Number.isFinite(n) || n < 1 || n > 1000) throw new BadRequestException("Le nombre d'inscriptions doit être entre 1 et 1000");
      data.maxUses = n;
      // Relever le plafond d'un code épuisé le remet en service.
      if (invite.used && n > invite.useCount) data.used = false;
    }
    if (body.expiresAt !== undefined) data.expiresAt = this.parseDate(body.expiresAt, 'Fin');
    if (typeof body.label === 'string') data.label = body.label.trim().slice(0, 80) || null;
    if (typeof body.perIpOnce === 'boolean') data.perIpOnce = body.perIpOnce;
    return this.prisma.inviteCode.update({ where: { id }, data });
  }

  async remove(id: string) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!invite) throw new NotFoundException('Code introuvable');
    await this.prisma.inviteCode.delete({ where: { id } });
    return { ok: true, code: invite.code };
  }

  /** Les inscriptions faites avec ce code : membre, adresse IP, date. */
  async uses(id: string) {
    const rows = await this.prisma.inviteUse.findMany({ where: { inviteId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, username: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({ id: r.id, ip: r.ip, createdAt: r.createdAt, user: byId.get(r.userId) ?? null }));
  }
}
