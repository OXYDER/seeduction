import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { forgetIdentity } from '../common/utils/session-identity';
import { forgetStaff2fa, STAFF_2FA_KEY, STAFF_ROLES } from '../common/utils/staff-2fa';

/** Admin > Sécurité : exiger la double authentification (2FA) de toute l'équipe, et voir qui l'a déjà activée. */
@Injectable()
export class StaffSecurityService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async status() {
    const [row, staff] = await Promise.all([
      this.prisma.siteSetting.findUnique({ where: { key: STAFF_2FA_KEY } }),
      this.prisma.user.findMany({ where: { parentId: null, status: 'ACTIVE', role: { in: STAFF_ROLES as any } }, select: { id: true, username: true, role: true, twoFactorEnabled: true, lastSeenAt: true }, orderBy: { username: 'asc' } }),
    ]);
    return {
      required: row?.value === true,
      staff: staff.map((s) => ({ id: s.id, username: s.username, role: s.role, twoFactor: s.twoFactorEnabled, lastSeenAt: s.lastSeenAt })),
    };
  }

  /** Active ou coupe l'obligation. Pour l'activer, la personne qui le fait doit avoir sa propre 2FA (sinon elle se fermerait la porte à elle-même). */
  async setRequired(actorId: string, required: boolean, ip?: string | null) {
    if (required) {
      const me = await this.prisma.user.findUnique({ where: { id: actorId }, select: { twoFactorEnabled: true } });
      if (!me?.twoFactorEnabled) throw new BadRequestException("Active d'abord ta propre double authentification (Profil > Sécurité) : sinon tu perdrais l'accès aux outils de l'équipe.");
    }
    await this.prisma.siteSetting.upsert({ where: { key: STAFF_2FA_KEY }, update: { value: required }, create: { key: STAFF_2FA_KEY, value: required } });
    forgetStaff2fa();
    await this.audit.log(actorId, required ? 'STAFF_2FA_REQUIRED_ON' : 'STAFF_2FA_REQUIRED_OFF', undefined, ip);
    return this.status();
  }

  /** État pour la personne connectée (bandeau « active ta 2FA »). */
  async mine(userId: string, role: string) {
    const [row, me] = await Promise.all([
      this.prisma.siteSetting.findUnique({ where: { key: STAFF_2FA_KEY } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } }),
    ]);
    forgetIdentity(userId);
    return { required: row?.value === true && (STAFF_ROLES as readonly string[]).includes(role), enabled: !!me?.twoFactorEnabled };
  }
}
