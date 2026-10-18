import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ParsedDonation, bmcDonation, candidateNames, kofiDonation, maskEmail, parseKofi, pseudoInMessage, verifyBmcSignature } from '../common/utils/donation-webhooks';
import { DonationsService } from './donations.service';

const KEY = 'donationWebhooks';
interface Actor { userId: string; username: string }
interface Stored { kofiToken?: string; bmcSecret?: string; auto?: boolean }

const AUTO_ACTOR = { userId: 'automatique', username: 'Dons automatiques' };
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const tail = (s: string) => (s ? `••••${s.slice(-4)}` : '');
const label = (p: string) => (p === 'kofi' ? 'Ko-fi' : 'Buy Me a Coffee');

/**
 * Dons automatiques : Ko-fi et Buy Me a Coffee préviennent le site à chaque paiement. Le message est vérifié (jeton ou signature), le membre est reconnu par le pseudo écrit dans le
 * message, puis le don est inscrit avec les mêmes avantages qu'une saisie à la main. Un don dont le membre n'est pas sûr attend l'équipe (Admin > Dons). Un paiement n'est jamais crédité deux fois.
 */
@Injectable()
export class DonationWebhooksService {
  private readonly logger = new Logger(DonationWebhooksService.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private donations: DonationsService, private notifications: NotificationsService, private audit: AuditService) {}

  private async stored(): Promise<Stored> { return ((await this.settings.get<Stored>(KEY)) ?? {}) as Stored; }

  /** Réglages pour l'administration : les secrets ne sont jamais renvoyés, seulement leurs 4 derniers caractères. */
  async config(siteUrl: string) {
    const s = await this.stored();
    return {
      auto: s.auto !== false,
      kofi: { set: !!s.kofiToken, hint: tail(s.kofiToken ?? ''), url: `${siteUrl}/api/donations/webhook/kofi` },
      bmc: { set: !!s.bmcSecret, hint: tail(s.bmcSecret ?? ''), url: `${siteUrl}/api/donations/webhook/bmc` },
    };
  }

  /** Une valeur vide garde le secret actuel ; `null` l'efface. */
  async saveConfig(actor: Actor, body: { auto?: boolean; kofiToken?: string | null; bmcSecret?: string | null }, siteUrl: string, ip?: string | null) {
    const cur = await this.stored();
    const next: Stored = { ...cur, auto: body?.auto !== false };
    const apply = (key: 'kofiToken' | 'bmcSecret', v: unknown) => { if (v === null) delete next[key]; else if (typeof v === 'string' && v.trim()) next[key] = v.trim().slice(0, 200); };
    apply('kofiToken', body?.kofiToken); apply('bmcSecret', body?.bmcSecret);
    await this.settings.set(KEY, next);
    await this.audit.log(actor.userId, 'DONATION_WEBHOOKS_CONFIG', { auto: next.auto, kofi: !!next.kofiToken, bmc: !!next.bmcSecret }, ip);
    return this.config(siteUrl);
  }

  // ------------------------------------------------------------------ réception

  async receiveKofi(body: any) {
    const s = await this.stored();
    const { payload, token } = parseKofi(body);
    if (!s.kofiToken || !payload || !same(token, s.kofiToken)) throw new UnauthorizedException();
    const d = kofiDonation(payload);
    return d ? this.process(d) : { ignored: true };
  }

  async receiveBmc(rawBody: Buffer | undefined, signature: string | undefined, body: any) {
    const s = await this.stored();
    if (!s.bmcSecret || !verifyBmcSignature(rawBody, signature, s.bmcSecret)) throw new UnauthorizedException();
    const d = bmcDonation(body);
    return d ? this.process(d) : { ignored: true };
  }

  private async members(names: string[]) {
    if (names.length === 0) return [] as { id: string; username: string }[];
    return this.prisma.$queryRaw<{ id: string; username: string }[]>`SELECT id, username FROM "User" WHERE lower(username) = ANY(${names}::text[]) AND "parentId" IS NULL AND status = 'ACTIVE'`;
  }

  /** Traite un don reçu (déjà vérifié) : une seule fois par paiement. */
  async process(d: ParsedDonation) {
    const existing = await this.prisma.donationEvent.findUnique({ where: { provider_externalId: { provider: d.provider, externalId: d.externalId } } });
    if (d.refunded) {
      const note = "Remboursé : à vérifier par l'équipe (les avantages ne sont pas retirés automatiquement)";
      if (existing) await this.prisma.donationEvent.update({ where: { id: existing.id }, data: { status: 'REFUNDED', note } });
      else await this.prisma.donationEvent.create({ data: { provider: d.provider, externalId: d.externalId, kind: d.kind, status: 'REFUNDED', amount: d.amount, currency: d.currency, payerName: d.payerName, payerEmail: maskEmail(d.payerEmail), message: d.message, note: 'Remboursement reçu' } });
      await this.tellStaff('↩️ Don remboursé', `${d.amount} ${d.currency} (${label(d.provider)}, ${d.payerName || 'anonyme'}). Les avantages déjà versés ne sont pas retirés : vérifie si c'est nécessaire.`);
      return { refunded: true };
    }
    if (existing) return { duplicate: true };

    let event;
    try {
      event = await this.prisma.donationEvent.create({
        data: { provider: d.provider, externalId: d.externalId, kind: d.kind, status: d.kind === 'other' ? 'IGNORED' : 'PENDING', amount: d.amount, currency: d.currency, payerName: d.payerName, payerEmail: maskEmail(d.payerEmail), message: d.message, note: d.kind === 'other' ? 'Ni un don ni un abonnement : ignoré' : '' },
      });
    } catch { return { duplicate: true }; } // deux messages identiques en même temps : l'autre a gagné
    if (d.kind === 'other') return { ignored: true };

    const cfg = await this.donations.config();
    const auto = (await this.stored()).auto !== false;
    const found = await this.members(candidateNames(d.message));
    const byName = new Map(found.map((m) => [m.username.toLowerCase(), m]));
    const match = pseudoInMessage(d.message, (n) => byName.has(n.toLowerCase()));
    const member = match.username ? byName.get(match.username.toLowerCase()) : undefined;

    let note = '';
    let creditable = !!member && match.certain && auto && d.amount > 0;
    if (creditable && d.currency && d.currency !== cfg.currency.toUpperCase()) { creditable = false; note = `Devise ${d.currency} (le site compte en ${cfg.currency}) : montant à confirmer par l'équipe`; }
    if (!member) note = note || "Aucun pseudo reconnu dans le message : à attribuer par l'équipe";
    else if (!match.certain) note = note || "Pseudo probable : à confirmer par l'équipe";
    else if (!auto && !note) note = 'Crédit automatique désactivé';

    if (creditable && member) {
      try {
        const donation = await this.donations.record(AUTO_ACTOR, { userId: member.id, amount: d.amount, note: `${label(d.provider)} (automatique)`, receivedAt: d.at?.toISOString() });
        await this.prisma.donationEvent.update({ where: { id: event.id }, data: { status: 'CREDITED', userId: member.id, donationId: donation.id } });
        await this.tellStaff('❤️ Don crédité automatiquement', `${d.amount} ${d.currency} de ${member.username} (${label(d.provider)}).`);
        return { credited: true };
      } catch (e) { this.logger.warn(`Don ${d.externalId} non crédité : ${(e as Error).message}`); note = "Crédit impossible : à traiter par l'équipe"; }
    }
    await this.prisma.donationEvent.update({ where: { id: event.id }, data: { suggestion: member?.username ?? null, note } });
    await this.tellStaff('💌 Don à attribuer', `${d.amount} ${d.currency} de ${d.payerName || 'anonyme'} : « ${d.message.slice(0, 80) || 'sans message'} ». ${note}`);
    return { pending: true };
  }

  private async tellStaff(title: string, body: string) {
    const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null }, select: { id: true } });
    for (const a of admins) await this.notifications.notify({ userId: a.id, type: 'SYSTEM', category: 'system', groupKey: 'donation-auto', title, titleMany: '💌 {n} dons automatiques', body, link: '/admin' }).catch(() => undefined);
  }

  // ------------------------------------------------------------------ administration

  async events(limit = 60) {
    const rows = await this.prisma.donationEvent.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(200, limit) });
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));
    return rows.map((r) => ({ ...r, username: r.userId ? names.get(r.userId) ?? null : null }));
  }

  /** L'équipe attribue un don en attente à un membre (il reçoit alors ses avantages). */
  async assign(actor: Actor, id: string, username: string, amount: number | undefined, ip?: string | null) {
    const ev = await this.prisma.donationEvent.findUnique({ where: { id } });
    if (!ev) throw new NotFoundException('Don introuvable');
    if (ev.status !== 'PENDING') throw new BadRequestException('Ce don est déjà traité');
    const claimed = await this.prisma.donationEvent.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CREDITED', note: `Attribué par ${actor.username}` } });
    if (claimed.count === 0) throw new BadRequestException("Ce don vient d'être traité");
    try {
      const donation = await this.donations.record(actor, { username, amount: amount && amount > 0 ? amount : ev.amount, note: `${label(ev.provider)} (attribué à la main)` }, ip);
      await this.prisma.donationEvent.update({ where: { id }, data: { userId: donation.userId, donationId: donation.id } });
      return { ok: true };
    } catch (e) {
      await this.prisma.donationEvent.update({ where: { id }, data: { status: 'PENDING', note: ev.note } }); // le don redevient « à attribuer » (pseudo introuvable, par exemple)
      throw e;
    }
  }

  async ignore(actor: Actor, id: string, ip?: string | null) {
    const r = await this.prisma.donationEvent.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'IGNORED', note: `Ignoré par ${actor.username}` } });
    if (r.count === 0) throw new NotFoundException('Don introuvable ou déjà traité');
    await this.audit.log(actor.userId, 'DONATION_EVENT_IGNORED', { id }, ip);
    return { ok: true };
  }
}
