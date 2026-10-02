import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma.service';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  /** Compte principal d'un profil famille (absent pour un compte ordinaire et pour le profil principal). */
  acct?: string;
  /** « account » : jeton de quelques minutes qui ne sert qu'à choisir un profil. */
  scope?: 'account';
  /** Compte famille actif (le sélecteur de profil a été passé). */
  fam?: boolean;
  /** MASTER | ADULT | CHILD */
  ptype?: string;
}

/** Ce que les contrôleurs lisent dans req.user. `userId` est le PROFIL actif ; `accountId` le compte (ratio, points, passkey, sécurité). */
export interface AuthUser {
  userId: string;
  accountId: string;
  username: string;
  role: string;
  scope: 'account' | 'profile';
  isMaster: boolean;
  fam: boolean;
  profileType: string;
}

const CHECK_TTL_MS = 15_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private checked = new Map<string, { at: number; blocked: boolean }>();

  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-.env',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.scope === 'account') {
      return { userId: payload.sub, accountId: payload.sub, username: payload.username, role: payload.role, scope: 'account', isMaster: true, fam: false, profileType: 'MASTER' };
    }
    if (payload.acct) {
      // Profil d'un compte famille : bloqué par le profil principal, ou compte principal banni = accès coupé tout de suite.
      const hit = this.checked.get(payload.sub);
      let blocked = hit && Date.now() - hit.at < CHECK_TTL_MS ? hit.blocked : undefined;
      if (blocked === undefined) {
        const row = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { parentId: true, profileBlocked: true, parent: { select: { status: true } } } });
        blocked = !row || row.parentId !== payload.acct || row.profileBlocked || row.parent?.status === 'BANNED';
        this.checked.set(payload.sub, { at: Date.now(), blocked });
        if (this.checked.size > 500) this.checked.clear();
      }
      if (blocked) throw new UnauthorizedException('Ce profil est bloqué');
    }
    return {
      userId: payload.sub,
      accountId: payload.acct ?? payload.sub,
      username: payload.username,
      role: payload.role,
      scope: 'profile',
      isMaster: !payload.acct,
      fam: !!payload.fam,
      profileType: payload.ptype ?? 'MASTER',
    };
  }
}
