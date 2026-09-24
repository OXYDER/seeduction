import { Global, Injectable, Logger, Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Envoi d'e-mails (récupération de mot de passe...). Facultatif : sans SMTP_HOST
 * dans backend/.env, `enabled` est faux et le site fonctionne comme avant
 * (le staff génère alors les liens de réinitialisation à la main).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';

  constructor() {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT ?? 587);
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
      });
    }
  }

  get enabled() {
    return !!this.transporter;
  }

  /** Adresse publique du site (pour les liens dans les e-mails). */
  siteUrl(): string {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
    try {
      return new URL(process.env.ANNOUNCE_BASE_URL ?? '').origin;
    } catch {
      return 'http://localhost:9098';
    }
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      return true;
    } catch (err: any) {
      this.logger.warn(`Envoi d'e-mail impossible : ${err?.message ?? err}`);
      return false;
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
