import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadgesService } from '../badges/badges.service';
import { AuditService } from '../audit/audit.service';
import { CLASS_LABELS, INVITE_QUOTA } from '../common/utils/economy';

const MIN_PASSWORD_LENGTH = 8;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Limiteur de tentatives de connexion en mémoire : par compte visé et par adresse IP. */
class AttemptLimiter {
  private entries = new Map<string, { count: number; windowStart: number }>();
  constructor(private limit: number, private windowMs: number) {}

  /** Lève une erreur 429 si la clé a déjà épuisé ses tentatives dans la fenêtre. */
  assertAllowed(key: string) {
    const entry = this.entries.get(key);
    if (entry && Date.now() - entry.windowStart < this.windowMs && entry.count >= this.limit) {
      const minutes = Math.ceil((this.windowMs - (Date.now() - entry.windowStart)) / 60_000);
      throw new HttpException(`Trop de tentatives. Réessaie dans ${minutes} minute(s).`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  fail(key: string) {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) this.entries.set(key, { count: 1, windowStart: now });
    else entry.count++;
    if (this.entries.size > 5000) for (const [k, v] of this.entries) if (now - v.windowStart >= this.windowMs) this.entries.delete(k);
  }

  reset(key: string) {
    this.entries.delete(key);
  }
}

@Injectable()
export class AuthService {
  private accountLimiter = new AttemptLimiter(8, 15 * 60_000);
  private ipLimiter = new AttemptLimiter(40, 15 * 60_000);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notifications: NotificationsService,
    private badges: BadgesService,
    private audit: AuditService,
  ) {}

  private assertPassword(password: string) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`);
    }
  }

  /**
   * Inscription : nécessite un code d'invitation valide et non utilisé —
   * SAUF pour le tout premier compte du tracker (base vide), qui devient
   * automatiquement ADMIN sans invitation, pour amorcer le premier accès.
   */
  async register(inviteCode: string, username: string, email: string, password: string) {
    this.assertPassword(password);
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

    await this.notifications.notify({
      userId: invite.createdById,
      type: 'INVITE_USED',
      title: `${user.username} a rejoint le tracker`,
      body: 'Ton invitation a été utilisée',
      link: `/users/${user.id}`,
    });
    await this.badges.checkAndAward(invite.createdById);

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

  /** Vérifie un code d'appli 2FA, ou à défaut un code de secours (qui est alors consommé). */
  private async verifySecondFactor(user: { id: string; twoFactorSecret: string | null; twoFactorRecovery: string[] }, token: string): Promise<boolean> {
    const clean = token.replace(/\s/g, '');
    if (user.twoFactorSecret && /^\d{6}$/.test(clean)) {
      if (speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: clean, window: 1 })) return true;
    }
    const hash = sha256(clean.toLowerCase());
    if (user.twoFactorRecovery.includes(hash)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorRecovery: user.twoFactorRecovery.filter((h) => h !== hash) } });
      return true;
    }
    return false;
  }

  async login(usernameOrEmail: string, password: string, totpToken?: string, ip?: string | null) {
    const accountKey = `u:${String(usernameOrEmail).toLowerCase()}`;
    const ipKey = `ip:${ip ?? 'unknown'}`;
    this.accountLimiter.assertAllowed(accountKey);
    this.ipLimiter.assertAllowed(ipKey);

    let user;
    try {
      user = await this.validateUser(usernameOrEmail, password);
    } catch (err) {
      this.accountLimiter.fail(accountKey);
      this.ipLimiter.fail(ipKey);
      await this.audit.log(null, 'LOGIN_FAILED', { username: String(usernameOrEmail).slice(0, 64) }, ip);
      throw err;
    }

    if (user.twoFactorEnabled) {
      if (!totpToken) throw new UnauthorizedException('Code 2FA requis');
      if (!(await this.verifySecondFactor(user, totpToken))) {
        this.accountLimiter.fail(accountKey);
        this.ipLimiter.fail(ipKey);
        await this.audit.log(user.id, 'LOGIN_FAILED', { username: user.username, reason: '2FA' }, ip);
        throw new UnauthorizedException('Code 2FA invalide');
      }
    }

    this.accountLimiter.reset(accountKey);
    await this.audit.log(user.id, 'LOGIN', { username: user.username }, ip);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), lastIp: ip ?? undefined } });

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, username: user.username, role: user.role, passkey: user.passkey },
    };
  }

  // ------------------------------------------------------------------ 2FA

  /** Étape 1 : génère un secret (pas encore actif) et son QR code. */
  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) throw new BadRequestException('La double authentification est déjà activée');
    const secret = speakeasy.generateSecret({ name: `Seeduction (${user.username})`, length: 20 });
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret.base32 } });
    return {
      base32: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCode: await QRCode.toDataURL(secret.otpauth_url!, { margin: 1, width: 220 }),
    };
  }

  /** Étape 2 : vérifie un premier code de l'appli, active la 2FA et remet des codes de secours (affichés une seule fois). */
  async confirm2FA(userId: string, token: string, ip?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) throw new BadRequestException("Commence par générer un QR code");
    if (user.twoFactorEnabled) throw new BadRequestException('La double authentification est déjà activée');
    const ok = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: String(token).replace(/\s/g, ''), window: 1 });
    if (!ok) throw new BadRequestException('Code incorrect : vérifie l\'heure de ton téléphone et réessaie');

    const codes = Array.from({ length: 8 }, () => `${randomBytes(2).toString('hex')}-${randomBytes(2).toString('hex')}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorRecovery: codes.map((c) => sha256(c)) },
    });
    await this.audit.log(userId, 'TWO_FACTOR_ENABLED', undefined, ip);
    return { recoveryCodes: codes };
  }

  async disable2FA(userId: string, password: string, token: string, ip?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) throw new BadRequestException("La double authentification n'est pas activée");
    if (!(await bcrypt.compare(password ?? '', user.passwordHash))) throw new UnauthorizedException('Mot de passe incorrect');
    if (!(await this.verifySecondFactor(user, token ?? ''))) throw new UnauthorizedException('Code 2FA invalide');
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecovery: [] } });
    await this.audit.log(userId, 'TWO_FACTOR_DISABLED', undefined, ip);
    return { disabled: true };
  }

  async twoFactorStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorRecovery: true } });
    return { enabled: !!user?.twoFactorEnabled, recoveryLeft: user?.twoFactorRecovery.length ?? 0 };
  }

  // ------------------------------------------------------------------ mot de passe

  async changePassword(userId: string, current: string, next: string, ip?: string | null) {
    this.assertPassword(next);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(current ?? '', user.passwordHash))) throw new UnauthorizedException('Mot de passe actuel incorrect');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } });
    await this.audit.log(userId, 'PASSWORD_CHANGE', undefined, ip);
    return { changed: true };
  }

  /** Réinitialisation avec un lien émis par le staff (usage unique, 1 heure). */
  async resetPassword(token: string, next: string, ip?: string | null) {
    this.assertPassword(next);
    this.ipLimiter.assertAllowed(`reset:${ip ?? 'unknown'}`);
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(String(token ?? '')) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      this.ipLimiter.fail(`reset:${ip ?? 'unknown'}`);
      throw new BadRequestException('Lien invalide ou expiré : demande-en un nouveau au staff');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(next, 12) } }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    await this.audit.log(row.userId, 'PASSWORD_RESET', undefined, ip);
    return { reset: true };
  }

  /** Dernières connexions du membre (visibles par lui-même, pour repérer un accès suspect). */
  recentLogins(userId: string) {
    return this.prisma.activityLog.findMany({
      where: { userId, action: { in: ['LOGIN', 'LOGIN_FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, action: true, ip: true, createdAt: true },
    });
  }

  /** Génère un nouveau code d'invitation pour un user (limité par son rang). */
  async createInvite(userId: string, expiresInDays = 7) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, memberClass: true } });
    if (!user) throw new UnauthorizedException();
    const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(user.role);
    if (!isStaff) {
      const quota = INVITE_QUOTA[user.memberClass] ?? 0;
      const open = await this.prisma.inviteCode.count({ where: { createdById: userId, used: false, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      if (quota === 0) {
        throw new BadRequestException(`Ton rang (${CLASS_LABELS[user.memberClass]}) ne permet pas encore de créer des invitations : monte en rang, ou achète-en une dans la boutique bonus.`);
      }
      if (open >= quota) throw new BadRequestException(`Tu as déjà ${open} invitation(s) ouverte(s) (maximum ${quota} pour ton rang).`);
    }
    const code = await this.prisma.inviteCode.create({
      data: {
        code: randomBytes(16).toString('hex'),
        createdById: userId,
        expiresAt: new Date(Date.now() + expiresInDays * 86400_000),
      },
    });
    return code;
  }
}
