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
import { MailService } from '../mail/mail.service';
import { EmailVerificationService, maskEmail } from './email-verification.service';
import { CLASS_LABELS, ECONOMY, INVITE_QUOTA, SITE } from '../common/utils/economy';

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
    private mail: MailService,
    private verification: EmailVerificationService,
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
  async register(inviteCode: string, username: string, email: string, password: string, ip: string | null = null) {
    this.assertPassword(password);
    email = String(email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Courriel invalide');
    // « · » sépare le nom d'un profil famille du pseudo de son compte : un pseudo ordinaire ne peut pas le contenir.
    if (String(username ?? '').includes('·')) throw new BadRequestException("Le caractère « · » n'est pas autorisé dans un pseudo");
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const passwordHash = await bcrypt.hash(password, 12);
    // Cadeau de bienvenue : un peu d'upload de départ (pour ne pas commencer à 0/∞) et un freeleech personnel
    // temporaire, pour découvrir le site sans se soucier du ratio dès les premiers téléchargements.
    const welcomeGift = {
      uploaded: BigInt(Math.round(ECONOMY.welcomeUploadGb * 1e9)),
      freeleechUntil: new Date(Date.now() + ECONOMY.welcomeFreeleechDays * 86400_000),
    };

    if (isFirstUser) {
      const created = await this.prisma.user.create({
        data: { username, email, passwordHash, role: 'ADMIN', ...welcomeGift },
      });
      return { id: created.id, username: created.username, passkey: created.passkey };
    }

    const typed = (inviteCode ?? '').trim();
    const invite = (await this.prisma.inviteCode.findUnique({ where: { code: typed } }))
      ?? (typed ? await this.prisma.inviteCode.findUnique({ where: { code: typed.toUpperCase() } }) : null); // les codes de l'administration sont en majuscules
    if (!invite || invite.used || invite.disabled || invite.useCount >= invite.maxUses) throw new BadRequestException('Code d\'invitation invalide ou déjà utilisé');
    if (invite.startsAt && invite.startsAt > new Date()) throw new BadRequestException("Ce code d'invitation n'est pas encore actif");
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Code d\'invitation expiré');
    }
    if (invite.perIpOnce) {
      if (!ip) throw new BadRequestException("Impossible de vérifier ton adresse IP : ce code est limité à une inscription par connexion");
      if (await this.prisma.inviteUse.findFirst({ where: { inviteId: invite.id, ipKey: ip }, select: { id: true } })) {
        throw new BadRequestException('Ce code a déjà servi à créer un compte depuis cette connexion (une inscription par adresse IP)');
      }
    }

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // Réservation atomique d'une place : deux inscriptions simultanées ne peuvent pas dépasser le maximum.
        const claimed = await tx.inviteCode.updateMany({
          where: { id: invite.id, used: false, disabled: false, useCount: { lt: invite.maxUses } },
          data: { useCount: { increment: 1 } },
        });
        if (claimed.count === 0) throw new BadRequestException('Code d\'invitation invalide ou déjà utilisé');
        const created = await tx.user.create({
          data: {
            username,
            email,
            passwordHash,
            invitedById: invite.createdById,
            minRatio: SITE.defaultMinRatio,
            // Courriel à confirmer (code à 6 chiffres ou lien) avant de pouvoir se connecter, si l'envoi de courriels est configuré.
            ...(this.verification.required ? { status: 'PENDING_EMAIL' as const } : {}),
            ...welcomeGift,
          },
        });
        await tx.inviteUse.create({ data: { inviteId: invite.id, userId: created.id, ip, ipKey: invite.perIpOnce ? ip : null } });
        if (invite.useCount + 1 >= invite.maxUses) await tx.inviteCode.update({ where: { id: invite.id }, data: { used: true, usedByEmail: email } });
        else await tx.inviteCode.update({ where: { id: invite.id }, data: { usedByEmail: email } });
        return created;
      });
    } catch (err: any) {
      // Deux inscriptions depuis la même IP au même instant : la contrainte d'unicité refuse la seconde.
      if (err?.code === 'P2002' && String(err?.meta?.target ?? '').includes('username')) throw new BadRequestException("Ce nom d'utilisateur est déjà pris");
      if (err?.code === 'P2002' && String(err?.meta?.target ?? '').includes('email')) throw new BadRequestException('Ce courriel est déjà utilisé');
      if (err?.code === 'P2002' && String(err?.meta?.target ?? '').includes('ipKey')) {
        throw new BadRequestException('Ce code a déjà servi à créer un compte depuis cette connexion (une inscription par adresse IP)');
      }
      throw err;
    }

    if (user.status === 'PENDING_EMAIL') {
      // Les notifications de bienvenue et d'invitation attendent la confirmation du courriel (voir activate).
      const challengeId = await this.verification.issue(user, 'SIGNUP', user.email);
      await this.audit.log(user.id, 'SIGNUP_VERIFICATION_SENT', undefined, ip);
      return { id: user.id, username: user.username, pendingVerification: true, challengeId, email: maskEmail(user.email) };
    }
    await this.welcome(user, invite);
    return { id: user.id, username: user.username, passkey: user.passkey };
  }

  /** Notifications d'arrivée (invitant + nouveau membre) et badges : au moment où le compte devient réellement actif. */
  private async welcome(user: { id: string; username: string }, invite: { createdById: string; generic: boolean; maxUses: number }) {
    if (!invite.generic || invite.maxUses <= 10) await this.notifications.notify({
      userId: invite.createdById,
      type: 'INVITE_USED',
      title: `${user.username} a rejoint le tracker`,
      body: 'Ton invitation a été utilisée',
      link: `/users/${user.id}`,
    });
    await this.notifications.notify({
      userId: user.id,
      type: 'SYSTEM',
      title: `Bienvenue sur Seeduction, ${user.username} !`,
      body: `Cadeau de bienvenue : ${ECONOMY.welcomeUploadGb} Go d'upload offerts et ${ECONOMY.welcomeFreeleechDays} jours de freeleech personnel (tes téléchargements ne compteront pas dans ton ratio pendant cette période). Bonne découverte !`,
      link: '/profile',
    });
    await this.badges.checkAndAward(invite.createdById);
  }

  /** Active un compte en attente de confirmation (courriel confirmé, ou validation manuelle par le staff). */
  async activate(userId: string) {
    const claimed = await this.prisma.user.updateMany({ where: { id: userId, status: 'PENDING_EMAIL' }, data: { status: 'ACTIVE' } });
    if (claimed.count === 0) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, invitedById: true } });
    if (user?.invitedById) {
      const invite = await this.prisma.inviteCode.findFirst({ where: { uses: { some: { userId } } }, select: { createdById: true, generic: true, maxUses: true } });
      await this.welcome(user, invite ?? { createdById: user.invitedById, generic: false, maxUses: 1 });
    } else if (user) {
      await this.notifications.notify({ userId: user.id, type: 'SYSTEM', title: `Bienvenue sur Seeduction, ${user.username} !`, body: 'Ton compte est actif.', link: '/profile' });
    }
    return true;
  }

  async validateUser(usernameOrEmail: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }] },
    });
    if (!user || user.parentId) throw new UnauthorizedException('Identifiants invalides'); // un profil famille n'a pas de mot de passe : on entre par son compte
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

    if (user.status === 'PENDING_EMAIL') {
      // Mot de passe juste mais courriel jamais confirmé : on (re)envoie un code et on ouvre l'écran de confirmation.
      this.accountLimiter.reset(accountKey);
      if (!this.verification.required) { await this.activate(user.id); return this.login(usernameOrEmail, password, totpToken, ip); }
      const challengeId = await this.verification.issue(user, 'SIGNUP', user.email);
      return { needsVerification: true, challengeId, email: maskEmail(user.email) };
    }
    this.accountLimiter.reset(accountKey);
    await this.audit.log(user.id, 'LOGIN', { username: user.username }, ip);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), lastIp: ip ?? undefined } });

    // Compte famille : le mot de passe ne donne qu'un jeton de quelques minutes, qui sert à choisir un profil et saisir son PIN.
    if (user.familyEnabled) {
      return {
        needsProfile: true,
        accessToken: this.jwt.sign({ sub: user.id, username: user.username, role: user.role, scope: 'account' }, { expiresIn: '10m' }),
        user: { id: user.id, username: user.username, role: user.role, passkey: '' },
      };
    }

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

  /** Vérifie le mot de passe actuel et, si la 2FA est active, le code 2FA : exigé avant tout changement sensible. */
  private async assertSensitiveChange(user: { id: string; passwordHash: string; twoFactorEnabled: boolean; twoFactorSecret: string | null; twoFactorRecovery: string[] }, current: string, totpToken: string | undefined, ip?: string | null) {
    const key = `sens:${user.id}`;
    this.accountLimiter.assertAllowed(key);
    if (!(await bcrypt.compare(current ?? '', user.passwordHash))) {
      this.accountLimiter.fail(key);
      await this.audit.log(user.id, 'SENSITIVE_CHANGE_DENIED', { reason: 'password' }, ip);
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }
    if (user.twoFactorEnabled && !(await this.verifySecondFactor(user, String(totpToken ?? '')))) {
      this.accountLimiter.fail(key);
      await this.audit.log(user.id, 'SENSITIVE_CHANGE_DENIED', { reason: '2FA' }, ip);
      throw new UnauthorizedException('Code 2FA requis ou invalide');
    }
    this.accountLimiter.reset(key);
  }

  /** Ré-authentification d'un membre du staff avant une action destructrice : son mot de passe (+ code 2FA s'il l'a activée). */
  async assertStaffReauth(userId: string, password: string, totpToken?: string, ip?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    await this.assertSensitiveChange(user, password, totpToken, ip);
  }

  /**
   * Changement de mot de passe : mot de passe actuel (+ code 2FA si activée), puis confirmation par un code à 6 chiffres / un lien
   * envoyé à l'adresse du compte — le nouveau mot de passe n'est appliqué qu'à ce moment-là.
   */
  async changePassword(userId: string, current: string, next: string, totpToken?: string, ip?: string | null) {
    this.assertPassword(next);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    await this.assertSensitiveChange(user, current, totpToken, ip);
    const passwordHash = await bcrypt.hash(next, 12);
    if (!this.verification.required) {
      await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.audit.log(userId, 'PASSWORD_CHANGE', undefined, ip);
      return { changed: true };
    }
    const challengeId = await this.verification.issue(user, 'PASSWORD_CHANGE', user.email, { passwordHash });
    await this.audit.log(userId, 'PASSWORD_CHANGE_REQUESTED', undefined, ip);
    return { verificationRequired: true, challengeId, email: maskEmail(user.email) };
  }

  /** Changement de courriel : mêmes garde-fous ; le code part vers la NOUVELLE adresse, et l'ancienne reçoit une alerte une fois fait. */
  async changeEmail(userId: string, current: string, newEmail: string, totpToken?: string, ip?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const email = String(newEmail ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Courriel invalide');
    if (email.toLowerCase() === user.email.toLowerCase()) throw new BadRequestException("C'est déjà ton adresse actuelle");
    await this.assertSensitiveChange(user, current, totpToken, ip);
    if (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: userId } }, select: { id: true } })) {
      throw new BadRequestException('Ce courriel est déjà utilisé');
    }
    if (!this.verification.required) {
      await this.prisma.user.update({ where: { id: userId }, data: { email } });
      await this.audit.log(userId, 'EMAIL_CHANGE', { from: user.email, to: email }, ip);
      return { changed: true, email };
    }
    const challengeId = await this.verification.issue(user, 'EMAIL_CHANGE', email, { newEmail: email, oldEmail: user.email });
    await this.audit.log(userId, 'EMAIL_CHANGE_REQUESTED', { to: email }, ip);
    return { verificationRequired: true, challengeId, email: maskEmail(email) };
  }

  /** Confirmation par code (avec l'identifiant de la demande) ou par lien : applique la demande en attente. */
  async verifyEmail(input: { challengeId?: string; code?: string; token?: string }, ip?: string | null) {
    const done = await this.verification.consume(input, ip);
    const user = await this.prisma.user.findUnique({ where: { id: done.userId } });
    if (!user) throw new BadRequestException('Compte introuvable');

    if (done.purpose === 'SIGNUP') {
      if (user.status === 'BANNED') throw new UnauthorizedException('Compte banni');
      await this.activate(user.id);
      await this.audit.log(user.id, 'SIGNUP_VERIFIED', undefined, ip);
      return { verified: true, purpose: done.purpose, username: user.username };
    }
    if (done.purpose === 'PASSWORD_CHANGE') {
      if (typeof done.payload.passwordHash !== 'string') throw new BadRequestException('Demande invalide');
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: done.payload.passwordHash } });
      await this.audit.log(user.id, 'PASSWORD_CHANGE', undefined, ip);
      await this.verification.notifyChange(user.email, user.username, "Le mot de passe de ton compte Seeduction vient d'être modifié.");
      return { verified: true, purpose: done.purpose, username: user.username };
    }
    if (done.purpose === 'EMAIL_CHANGE') {
      const next = String(done.payload.newEmail ?? '');
      if (!next) throw new BadRequestException('Demande invalide');
      if (await this.prisma.user.findFirst({ where: { email: { equals: next, mode: 'insensitive' }, id: { not: user.id } }, select: { id: true } })) {
        throw new BadRequestException('Ce courriel est déjà utilisé');
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { email: next } });
      await this.audit.log(user.id, 'EMAIL_CHANGE', { from: user.email, to: next }, ip);
      await this.verification.notifyChange(user.email, user.username, `L'adresse courriel de ton compte Seeduction vient d'être remplacée par ${maskEmail(next)}.`);
      return { verified: true, purpose: done.purpose, username: user.username };
    }
    throw new BadRequestException('Demande invalide');
  }

  get emailVerificationRequired() {
    return this.verification.required;
  }

  get emailResetAvailable() {
    return this.mail.enabled;
  }

  /**
   * « Mot de passe oublié » : envoie un lien par e-mail. La réponse est toujours la même, que l'adresse
   * existe ou non, pour ne pas révéler quels comptes existent ; limité par adresse IP et par compte.
   */
  async forgotPassword(email: string, ip?: string | null) {
    if (!this.mail.enabled) throw new BadRequestException("L'envoi d'e-mails n'est pas configuré : demande un lien de réinitialisation au staff.");
    this.ipLimiter.assertAllowed(`forgot:${ip ?? 'unknown'}`);
    this.ipLimiter.fail(`forgot:${ip ?? 'unknown'}`); // chaque demande compte, réussie ou non

    const clean = String(email ?? '').trim().toLowerCase();
    const user = clean ? await this.prisma.user.findFirst({ where: { email: { equals: clean, mode: 'insensitive' }, status: 'ACTIVE' } }) : null;
    if (user) {
      // Pas plus d'un lien toutes les 5 minutes par compte.
      const recent = await this.prisma.passwordReset.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 5 * 60_000) } } });
      if (!recent) {
        await this.prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
        const token = randomBytes(32).toString('hex');
        await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
        const link = `${this.mail.siteUrl()}/reset-password?token=${token}`;
        await this.mail.send(
          user.email,
          'Réinitialisation de ton mot de passe Seeduction',
          `Bonjour ${user.username},\n\nPour choisir un nouveau mot de passe, ouvre ce lien (valable 1 heure, à usage unique) :\n${link}\n\nSi tu n'es pas à l'origine de cette demande, ignore ce message : ton mot de passe reste inchangé.`,
        );
        await this.audit.log(user.id, 'RESET_LINK_EMAILED', undefined, ip);
      }
    }
    return { sent: true };
  }

  /** Réinitialisation avec un lien émis par le staff ou reçu par e-mail (usage unique, 1 heure). */
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
    const isStaff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(user.role);
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
