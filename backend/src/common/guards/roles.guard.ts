import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../prisma.service';
import { STAFF_2FA_CODE, STAFF_2FA_MESSAGE, staff2faRequired, staffBlockedFor2fa } from '../utils/staff-2fa';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user?.role)) return false;
    // Réglage « 2FA obligatoire pour l'équipe » : sans 2FA, les outils de l'équipe restent fermés (le compte de membre, lui, fonctionne normalement).
    if (staffBlockedFor2fa(await staff2faRequired(this.prisma), user?.role, user?.twoFactor)) throw new ForbiddenException({ statusCode: 403, message: STAFF_2FA_MESSAGE, code: STAFF_2FA_CODE });
    return true;
  }
}
