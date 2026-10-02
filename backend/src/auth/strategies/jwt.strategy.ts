import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma.service';
import { ALL_PERMS, permsOf, type Perms } from '../../common/utils/family-perms';

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
  /** Droits accordés par le profil principal (tout est permis au profil principal et aux comptes sans profils). */
  perms: Perms;
}

const CHECK_TTL_MS = 15_000;
interface Checked { at: number; blocked: boolean; perms: Perms }

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private checked = new Map<string, Checked>();

  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-.env',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.scope === 'account') {
      return { userId: payload.sub, accountId: payload.sub, username: payload.username, role: payload.role, scope: 'account', isMaster: true, fam: false, perms: ALL_PERMS };
    }
    let perms: Perms = ALL_PERMS;
    if (payload.acct) {
      // Profil d'un compte famille : bloqué par le profil principal, ou compte principal banni = accès coupé tout de suite ;
      // les droits sont relus à chaque quinzaine de secondes (le profil principal peut les changer à tout moment).
      let hit = this.checked.get(payload.sub);
      if (!hit || Date.now() - hit.at >= CHECK_TTL_MS) {
        const row = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { parentId: true, profileBlocked: true, profilePerms: true, profileType: true, parent: { select: { status: true } } } });
        hit = { at: Date.now(), blocked: !row || row.parentId !== payload.acct || row.profileBlocked || row.parent?.status === 'BANNED', perms: row ? permsOf(row) : permsOf({ parentId: payload.acct }) };
        this.checked.set(payload.sub, hit);
        if (this.checked.size > 500) this.checked.clear();
      }
      if (hit.blocked) throw new UnauthorizedException('Ce profil est bloqué');
      perms = hit.perms;
    }
    return {
      userId: payload.sub,
      accountId: payload.acct ?? payload.sub,
      username: payload.username,
      role: payload.role,
      scope: 'profile',
      isMaster: !payload.acct,
      fam: !!payload.fam,
      perms,
    };
  }
}
