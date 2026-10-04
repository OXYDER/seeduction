import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { MailService } from '../mail/mail.service';

export type ChallengePurpose = 'SIGNUP' | 'PASSWORD_CHANGE' | 'EMAIL_CHANGE';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const SECRET = () => process.env.JWT_SECRET ?? 'change-me-in-.env';

const TTL_MS: Record<ChallengePurpose, number> = {
  SIGNUP: 24 * 3600_000, // le temps de relever ses courriels
  PASSWORD_CHANGE: 15 * 60_000,
  EMAIL_CHANGE: 15 * 60_000,
};
const MAX_ATTEMPTS = 5; // au-delà, le code est détruit : il faut en redemander un (pas de force brute sur 1 000 000 de combinaisons)
const RESEND_COOLDOWN_MS = 60_000;

const TITLES: Record<ChallengePurpose, string> = {
  SIGNUP: 'Confirme ton compte Seeduction',
  PASSWORD_CHANGE: 'Confirme le changement de ton mot de passe',
  EMAIL_CHANGE: 'Confirme ta nouvelle adresse courriel',
};
const INTROS: Record<ChallengePurpose, string> = {
  SIGNUP: 'Bienvenue sur Seeduction ! Pour activer ton compte',
  PASSWORD_CHANGE: 'Une demande de changement de mot de passe a été faite sur ton compte. Pour la confirmer',
  EMAIL_CHANGE: 'Une demande de changement de courriel a été faite sur ton compte. Pour confirmer que cette adresse est bien la tienne',
};

export const maskEmail = (email: string) => {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/** Petit limiteur en mémoire pour les tentatives de saisie de code, par adresse IP. */
class IpWindow {
  private hits = new Map<string, { n: number; at: number }>();
  constructor(private limit: number, private windowMs: number) {}
  hit(key: string) {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || now - e.at >= this.windowMs) this.hits.set(key, { n: 1, at: now });
    else {
      e.n++;
      if (e.n > this.limit) throw new HttpException('Trop de tentatives. Réessaie dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (now - v.at >= this.windowMs) this.hits.delete(k);
  }
}

/**
 * Confirmation par courriel : un code à 6 chiffres ET un lien à usage unique, envoyés ensemble. Utilisé à l'inscription et
 * pour tout changement sensible (mot de passe, courriel). Le code expire, n'accepte que 5 essais et n'est jamais stocké en clair.
 */
@Injectable()
export class EmailVerificationService {
  private ipWindow = new IpWindow(30, 15 * 60_000);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  /** La vérification n'est exigée que si l'envoi de courriels est configuré (sinon personne ne pourrait la passer). */
  get required() {
    return this.mail.enabled && process.env.EMAIL_VERIFICATION !== 'off';
  }

  private codeHash(challengeId: string, code: string) {
    return createHmac('sha256', SECRET()).update(`${challengeId}:${code}`).digest('hex');
  }

  /** Crée (ou renvoie) une demande de confirmation et envoie le courriel. Renvoie son identifiant. */
  async issue(user: { id: string; username: string }, purpose: ChallengePurpose, sentTo: string, payload?: Record<string, any>) {
    const recent = await this.prisma.emailChallenge.findFirst({
      where: { userId: user.id, purpose, usedAt: null, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      // Inscription : l'écran de confirmation peut redemander la même chose (on réutilise la demande, sans renvoyer de courriel).
      if (purpose === 'SIGNUP' && recent.sentTo === sentTo) return recent.id;
      throw new HttpException("Un courriel vient déjà d'être envoyé : attends une minute avant d'en redemander un.", HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.prisma.emailChallenge.deleteMany({ where: { userId: user.id, purpose, usedAt: null } });
    const id = (await this.prisma.emailChallenge.create({
      data: { userId: user.id, purpose, codeHash: 'x', tokenHash: sha256(randomBytes(8).toString('hex')), sentTo, payload: payload as any, expiresAt: new Date(Date.now() + TTL_MS[purpose]) },
    })).id;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailChallenge.update({ where: { id }, data: { codeHash: this.codeHash(id, code), tokenHash: sha256(token) } });

    const link = `${this.mail.siteUrl()}/verify?token=${token}`;
    const minutes = Math.round(TTL_MS[purpose] / 60_000);
    const delay = minutes >= 120 ? `${Math.round(minutes / 60)} heures` : `${minutes} minutes`;
    const text =
      `Bonjour ${user.username},\n\n${INTROS[purpose]}, utilise ce code à 6 chiffres :\n\n    ${code}\n\n` +
      `ou ouvre ce lien :\n${link}\n\nLe code et le lien sont valables ${delay} et ne servent qu'une fois.\n` +
      `Si tu n'es pas à l'origine de cette demande, ignore ce message (et, pour un changement de mot de passe, change-le au plus vite).`;
    const html =
      `<p>Bonjour ${escapeHtml(user.username)},</p><p>${INTROS[purpose]}, utilise ce code à 6 chiffres :</p>` +
      `<p style="font-size:30px;letter-spacing:8px;font-weight:bold;font-family:monospace">${code}</p>` +
      `<p>ou <a href="${link}">clique sur ce lien</a>.</p><p style="color:#666">Le code et le lien sont valables ${delay} et ne servent qu'une fois. ` +
      `Si tu n'es pas à l'origine de cette demande, ignore ce message.</p>`;
    const sent = await this.mail.send(sentTo, TITLES[purpose], text, html);
    if (!sent) {
      await this.prisma.emailChallenge.delete({ where: { id } }).catch(() => {});
      throw new BadRequestException("Impossible d'envoyer le courriel de confirmation pour l'instant. Réessaie plus tard ou contacte le staff.");
    }
    return id;
  }

  /** Vérifie un code saisi (avec l'identifiant reçu au moment de la demande) ou un lien. Consomme la demande si elle est bonne. */
  async consume(input: { challengeId?: string; code?: string; token?: string }, ip?: string | null) {
    this.ipWindow.hit(`verify:${ip ?? 'unknown'}`);
    const invalid = new BadRequestException('Code ou lien invalide ou expiré. Demande-en un nouveau.');

    if (input.token) {
      const row = await this.prisma.emailChallenge.findUnique({ where: { tokenHash: sha256(String(input.token)) } });
      if (!row || row.usedAt || row.expiresAt < new Date()) throw invalid;
      return this.finish(row);
    }

    const code = String(input.code ?? '').replace(/\s/g, '');
    if (!input.challengeId || !/^\d{6}$/.test(code)) throw new BadRequestException('Entre le code à 6 chiffres reçu par courriel.');
    const row = await this.prisma.emailChallenge.findUnique({ where: { id: String(input.challengeId) } });
    if (!row || row.usedAt || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) throw invalid;
    const good = this.codeHash(row.id, code);
    const ok = good.length === row.codeHash.length && timingSafeEqual(Buffer.from(good), Buffer.from(row.codeHash));
    if (!ok) {
      const attempts = row.attempts + 1;
      await this.prisma.emailChallenge.update({ where: { id: row.id }, data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { usedAt: new Date() } : {}) } });
      throw new BadRequestException(attempts >= MAX_ATTEMPTS ? 'Trop d’essais : ce code est annulé. Demande-en un nouveau.' : `Code incorrect (${MAX_ATTEMPTS - attempts} essai(s) restant(s)).`);
    }
    return this.finish(row);
  }

  private async finish(row: { id: string; userId: string; purpose: string; payload: any; sentTo: string }) {
    // Marquage atomique : un même lien/code ne peut servir qu'une fois, même si deux requêtes arrivent ensemble.
    const claimed = await this.prisma.emailChallenge.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw new BadRequestException('Code ou lien invalide ou expiré. Demande-en un nouveau.');
    return { userId: row.userId, purpose: row.purpose as ChallengePurpose, payload: (row.payload ?? {}) as Record<string, any>, sentTo: row.sentTo };
  }

  /** Nettoyage : demandes terminées ou expirées. */
  purgeOld() {
    return this.prisma.emailChallenge.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 86400_000) } }, { usedAt: { lt: new Date(Date.now() - 86400_000) } }] } });
  }

  /** Courriel d'alerte (sans code) : changement fait sur le compte, envoyé à l'ancienne adresse. */
  notifyChange(to: string, username: string, what: string) {
    const text = `Bonjour ${username},\n\n${what}\n\nSi ce n'est pas toi, contacte immédiatement le staff : quelqu'un d'autre a peut-être accès à ton compte.`;
    return this.mail.send(to, 'Alerte de sécurité sur ton compte Seeduction', text);
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
