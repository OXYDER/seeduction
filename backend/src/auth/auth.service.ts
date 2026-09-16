import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /**
   * Inscription : nécessite un code d'invitation valide et non utilisé —
   * SAUF pour le tout premier compte du tracker (base vide), qui devient
   * automatiquement ADMIN sans invitation, pour amorcer le premier accès.
   */
  async register(inviteCode: string, username: string, email: string, password: string) {
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const passwordHash = await bcrypt.hash(password, 12);

    if (isFirstUser) {
      const created = await this.prisma.user.create({
        data: { username, email, passwordHash, role: 'ADMIN' },
      });
      return { id: created.id, username: created.username, passkey: created.passkey };
    }

    const invite = await this.prisma.inviteCode.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.used) throw new BadRequestException('Code d\'invitation invalide ou déjà utilisé');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Code d\'invitation expiré');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          invitedById: invite.createdById,
        },
      });
      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { used: true, usedByEmail: email },
      });
      return created;
    });

    return { id: user.id, username: user.username, passkey: user.passkey };
  }

  async validateUser(usernameOrEmail: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }] },
    });
    if (!user) throw new UnauthorizedException('Identifiants invalides');
    if (user.status === 'BANNED') throw new UnauthorizedException('Compte banni');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Identifiants invalides');
    return user;
  }

  async login(usernameOrEmail: string, password: string, totpToken?: string) {
    const user = await this.validateUser(usernameOrEmail, password);

    if (user.twoFactorEnabled) {
      if (!totpToken) throw new UnauthorizedException('Code 2FA requis');
      const valid = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: totpToken,
        window: 1,
      });
      if (!valid) throw new UnauthorizedException('Code 2FA invalide');
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, username: user.username, role: user.role, passkey: user.passkey },
    };
  }

  async enable2FA(userId: string) {
    const secret = speakeasy.generateSecret({ name: 'MegaTracker' });
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: true },
    });
    return { otpauthUrl: secret.otpauth_url, base32: secret.base32 };
  }

  /** Génère un nouveau code d'invitation pour un user (limité par son rôle / quota). */
  async createInvite(userId: string, expiresInDays = 7) {
    const code = await this.prisma.inviteCode.create({
      data: {
        code: cryptoRandom(),
        createdById: userId,
        expiresAt: new Date(Date.now() + expiresInDays * 86400_000),
      },
    });
    return code;
  }
}

function cryptoRandom(): string {
  return [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
}
