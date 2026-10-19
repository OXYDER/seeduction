import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertPublicHost } from '../importer/net-guard';
import { openText, sealText } from '../common/utils/seal';
import { extractInlineImages, headerSafe, htmlToText, parseAddress, parseAddressList, prefixSubject, sanitizeMailHtml, sanitizeOutgoingHtml, textToHtml } from '../common/utils/mail-html';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailComposer = require('nodemailer/lib/mail-composer');

export interface UploadedFile { originalname: string; buffer: Buffer; mimetype: string; size: number }
export interface SendInput {
  from?: string; to?: string; cc?: string; bcc?: string; subject?: string; text?: string; html?: string; inReplyTo?: string; references?: string[]; replyFolder?: string; replyUid?: number;
  /** Brouillon d'où vient ce courriel : supprimé après l'envoi, et ses pièces jointes (numéros dans `keepAttachments`) sont conservées. */
  draftFolder?: string; draftUid?: number; keepAttachments?: number[];
}
export interface Viewer { userId: string; username: string; role: string }
export interface Alias { address: string; name: string }
interface Row { createdById?: string | null; id: string; label: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; username: string; passwordSealed: string; aliases: any; signature: string; allowedUserIds: string[] }

const PURPOSE = 'webmail';
export const STAFF_ROLES = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const isStaff = (role: string) => STAFF_ROLES.includes(role);
const PAGE = 30;
const MAX_SOURCE = 30 * 1024 * 1024;
const MAX_SEND_BYTES = 20 * 1024 * 1024;
const SEND_PER_HOUR = 40;
const MAX_RECIPIENTS = 50;
const UNSAFE_TYPE = /(html|xml|javascript|svg|x-sh|x-msdownload|x-msdos)/i;
const SPECIAL_ORDER = ['\\Inbox', '\\Drafts', '\\Sent', '\\Archive', '\\Junk', '\\Trash'];

const errText = (e: any) => String(e?.responseText ?? e?.message ?? e ?? '').slice(0, 200);
const cidKey = (c: string) => String(c ?? '').replace(/^<|>$/g, '');

/**
 * Interface Courriel (administrateurs) : lecture, recherche, rangement et envoi depuis les boîtes courriel du propriétaire (Purelymail, etc.), avec le choix de l'alias expéditeur.
 * Le site parle à la boîte par IMAP (lire) et SMTP (envoyer) ; le mot de passe est chiffré en base et ne revient jamais au navigateur. Le contenu des courriels est nettoyé avant d'être montré
 * (scripts retirés, images distantes bloquées, liens limités à http/https/mailto), et rien n'est copié sur le site : tout reste dans la boîte.
 */
@Injectable()
export class WebmailService {
  private readonly logger = new Logger(WebmailService.name);
  private sends = new Map<string, number[]>();
  private unreadCache = new Map<string, { at: number; n: number }>();
  private busy = new Map<string, number>();

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ------------------------------------------------------------------ accès et réglages

  private aliasesOf(row: Row): Alias[] { return (Array.isArray(row.aliases) ? row.aliases : []).filter((a: any) => a && typeof a.address === 'string'); }

  private view(row: Row) {
    return { id: row.id, label: row.label, address: row.username, aliases: this.aliasesOf(row), signature: row.signature };
  }

  /** Peut lire et écrire : le rôle propriétaire, l'administrateur qui a ajouté la boîte, ou un administrateur autorisé. */
  private canUse(viewer: Viewer, r: Row): boolean { return viewer.role === 'OWNER' || (isStaff(viewer.role) && (r.createdById === viewer.userId || r.allowedUserIds.includes(viewer.userId))); }

  /** Peut régler la boîte (serveurs, alias, accès) : le rôle propriétaire ou l'administrateur qui l'a ajoutée. */
  private canManage(viewer: Viewer, r: Row): boolean { return viewer.role === 'OWNER' || (viewer.role === 'ADMIN' && r.createdById === viewer.userId); }

  private async row(viewer: Viewer, id: string): Promise<Row> {
    const row = (await this.prisma.mailbox.findUnique({ where: { id } })) as Row | null;
    if (!row) throw new NotFoundException('Boîte introuvable');
    if (!this.canUse(viewer, row)) throw new NotFoundException('Boîte introuvable');
    return row;
  }

  async mailboxes(viewer: Viewer) {
    const rows = (await this.prisma.mailbox.findMany({ orderBy: { createdAt: 'asc' } })) as Row[];
    return rows.filter((r) => this.canUse(viewer, r)).map((r) => this.view(r));
  }

  /** Réglages complets pour le propriétaire (sans le mot de passe). */
  async adminList(viewer: Viewer) {
    const rows = ((await this.prisma.mailbox.findMany({ orderBy: { createdAt: 'asc' } })) as Row[]).filter((r) => this.canManage(viewer, r));
    const admins = await this.prisma.user.findMany({ where: { role: { in: STAFF_ROLES as any }, status: 'ACTIVE', parentId: null }, select: { id: true, username: true, role: true }, orderBy: { username: 'asc' } });
    return {
      admins,
      mailboxes: rows.map((r) => ({ ...this.view(r), imapHost: r.imapHost, imapPort: r.imapPort, imapSecure: r.imapSecure, smtpHost: r.smtpHost, smtpPort: r.smtpPort, smtpSecure: r.smtpSecure, username: r.username, passwordSet: !!openText(r.passwordSealed, PURPOSE), allowedUserIds: r.allowedUserIds })),
    };
  }

  private async clean(body: any, previous?: Row) {
    const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
    const port = (v: unknown, d: number) => { const n = Math.floor(Number(v)); return n >= 1 && n <= 65535 ? n : d; };
    const label = s(body?.label, 60), imapHost = s(body?.imapHost, 120), smtpHost = s(body?.smtpHost, 120), username = s(body?.username, 160);
    if (!label || !imapHost || !smtpHost || !username) throw new BadRequestException('Nom, serveurs IMAP et SMTP et identifiant sont obligatoires');
    for (const h of [imapHost, smtpHost]) { try { await assertPublicHost(h); } catch (e) { throw new BadRequestException(`Serveur refusé (${h}) : ${(e as Error).message}`); } }
    const aliases: Alias[] = [];
    for (const a of Array.isArray(body?.aliases) ? body.aliases.slice(0, 40) : []) {
      const p = parseAddress(String(a?.address ?? ''));
      if (!p) throw new BadRequestException(`Alias invalide : ${String(a?.address ?? '').slice(0, 60)}`);
      if (!aliases.some((x) => x.address === p.address)) aliases.push({ address: p.address, name: headerSafe(a?.name ?? p.name, 80) });
    }
    const allowed: string[] = Array.isArray(body?.allowedUserIds) ? body.allowedUserIds.map(String).slice(0, 50) : [];
    const valid = allowed.length ? (await this.prisma.user.findMany({ where: { id: { in: allowed }, role: { in: STAFF_ROLES as any }, status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id) : [];
    const pass = String(body?.password ?? '');
    const passwordSealed = pass ? sealText(pass, PURPOSE) : previous?.passwordSealed ?? '';
    if (!passwordSealed) throw new BadRequestException('Mot de passe de la boîte requis');
    return {
      label, imapHost, imapPort: port(body?.imapPort, 993), imapSecure: body?.imapSecure !== false, smtpHost, smtpPort: port(body?.smtpPort, 465), smtpSecure: body?.smtpSecure !== false,
      username, passwordSealed, aliases: aliases as any, signature: s(body?.signature, 600), allowedUserIds: valid,
    };
  }

  async create(actor: Viewer, body: any, ip?: string | null) {
    const data = await this.clean(body);
    const row = await this.prisma.mailbox.create({ data: { ...data, createdById: actor.userId } });
    await this.audit.log(actor.userId, 'MAIL_MAILBOX_CONFIG', { action: 'create', label: row.label, aliases: this.aliasesOf(row as Row).length }, ip);
    return this.view(row as Row);
  }

  async update(actor: Viewer, id: string, body: any, ip?: string | null) {
    const prev = (await this.prisma.mailbox.findUnique({ where: { id } })) as Row | null;
    if (!prev || !this.canUse(actor, prev)) throw new NotFoundException('Boîte introuvable');
    if (!this.canManage(actor, prev)) throw new ForbiddenException("Seul l'administrateur qui a ajouté cette boîte (ou le propriétaire du site) peut la régler");
    const data = await this.clean(body, prev);
    const row = await this.prisma.mailbox.update({ where: { id }, data });
    await this.audit.log(actor.userId, 'MAIL_MAILBOX_CONFIG', { action: 'update', label: row.label }, ip);
    return this.view(row as Row);
  }

  async remove(actor: Viewer, id: string, ip?: string | null) {
    const prev = (await this.prisma.mailbox.findUnique({ where: { id } })) as Row | null;
    if (!prev || !this.canUse(actor, prev)) throw new NotFoundException('Boîte introuvable');
    if (!this.canManage(actor, prev)) throw new ForbiddenException("Seul l'administrateur qui a ajouté cette boîte (ou le propriétaire du site) peut la retirer");
    await this.prisma.mailbox.delete({ where: { id } });
    await this.audit.log(actor.userId, 'MAIL_MAILBOX_CONFIG', { action: 'delete', label: prev.label }, ip);
    return { ok: true };
  }

  /** Essaie la connexion IMAP et SMTP avec les réglages donnés (ou ceux d'une boîte existante). */
  async test(viewer: Viewer, body: any, id?: string) {
    const prev = id ? ((await this.prisma.mailbox.findUnique({ where: { id } })) as Row | null) : undefined;
    if (id && (!prev || !this.canManage(viewer, prev))) throw new NotFoundException('Boîte introuvable');
    const data = await this.clean(body, prev ?? undefined);
    const row = { id: 'test', ...data } as unknown as Row;
    const out: { imap: string; smtp: string; folders?: number } = { imap: '', smtp: '' };
    try { out.folders = await this.imap(row, async (c) => (await c.list()).length); out.imap = 'ok'; } catch (e: any) { out.imap = errText(e) || 'échec'; }
    try { await this.smtp(row).verify(); out.smtp = 'ok'; } catch (e: any) { out.smtp = errText(e) || 'échec'; }
    return out;
  }

  // ------------------------------------------------------------------ connexions

  private password(row: Row): string {
    const p = openText(row.passwordSealed, PURPOSE);
    if (p === null) throw new BadRequestException('Le mot de passe de cette boîte est illisible (JWT_SECRET a changé ?) : ressaisis-le dans Admin > Courriel');
    return p;
  }

  private async imap<T>(row: Row, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
    const n = this.busy.get(row.id) ?? 0;
    if (n >= 4) throw new BadRequestException('Trop de demandes en même temps vers cette boîte : réessaie dans un instant');
    this.busy.set(row.id, n + 1);
    const c = new ImapFlow({ host: row.imapHost, port: row.imapPort, secure: row.imapSecure, auth: { user: row.username, pass: this.password(row) }, logger: false, socketTimeout: 40_000, greetingTimeout: 15_000, connectionTimeout: 15_000 });
    c.on('error', () => undefined);
    try {
      try { await c.connect(); } catch (e: any) { throw new BadRequestException(e?.authenticationFailed ? 'Connexion refusée par le serveur de courriel : vérifie l\'identifiant et le mot de passe' : `Impossible de joindre le serveur de courriel (${errText(e)})`); }
      return await fn(c);
    } finally {
      this.busy.set(row.id, Math.max(0, (this.busy.get(row.id) ?? 1) - 1));
      await c.logout().catch(() => { try { c.close(); } catch { /* déjà fermé */ } });
    }
  }

  private smtp(row: Row) {
    return nodemailer.createTransport({ host: row.smtpHost, port: row.smtpPort, secure: row.smtpSecure, auth: { user: row.username, pass: this.password(row) }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 40_000 });
  }

  // ------------------------------------------------------------------ lecture

  async folders(viewer: Viewer, id: string) {
    const row = await this.row(viewer, id);
    return this.imap(row, async (c) => {
      const list = await c.list();
      const out: { path: string; name: string; special: string | null; unread: number }[] = [];
      for (const f of list.slice(0, 60)) {
        if (f.flags?.has?.('\\Noselect') || f.flags?.has?.('\\NonExistent')) continue;
        let unread = 0;
        try { unread = (await c.status(f.path, { unseen: true })).unseen ?? 0; } catch { /* dossier non sélectionnable */ }
        out.push({ path: f.path, name: f.name, special: f.path.toUpperCase() === 'INBOX' ? '\\Inbox' : f.specialUse ?? null, unread });
      }
      const rank = (x: { special: string | null; name: string }) => { const i = SPECIAL_ORDER.indexOf(x.special ?? ''); return i === -1 ? 99 : i; };
      return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'));
    });
  }

  /** Courriels non lus de la boîte de réception de toutes les boîtes accessibles (pastille du menu) ; gardé 90 secondes. */
  async unread(viewer: Viewer) {
    const boxes = (await this.prisma.mailbox.findMany()) as Row[];
    let total = 0;
    for (const row of boxes.filter((r) => this.canUse(viewer, r))) {
      const hit = this.unreadCache.get(row.id);
      if (hit && Date.now() - hit.at < 90_000) { total += hit.n; continue; }
      let n = 0;
      try { n = await this.imap(row, async (c) => (await c.status('INBOX', { unseen: true })).unseen ?? 0); } catch { n = hit?.n ?? 0; }
      this.unreadCache.set(row.id, { at: Date.now(), n });
      total += n;
    }
    return { unread: total };
  }

  private hasAttachment(node: any): boolean {
    if (!node) return false;
    if (String(node.disposition ?? '').toLowerCase() === 'attachment') return true;
    return (node.childNodes ?? []).some((n: any) => this.hasAttachment(n));
  }

  async messages(viewer: Viewer, id: string, opts: { folder?: string; page?: number; q?: string; alias?: string; unseen?: boolean }) {
    const row = await this.row(viewer, id);
    const folder = String(opts.folder || 'INBOX');
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const q = String(opts.q ?? '').trim().slice(0, 100);
    const alias = parseAddress(String(opts.alias ?? ''))?.address;
    return this.imap(row, async (c) => {
      const lock = await c.getMailboxLock(folder, { readOnly: true });
      try {
        const want = { uid: true, envelope: true, flags: true, size: true, bodyStructure: true, internalDate: true } as any;
        let range: string;
        let total: number;
        if (q || alias || opts.unseen) {
          let uids: number[] | null = null;
          const intersect = (found: number[]) => { uids = uids ? uids.filter((u) => found.includes(u)) : found; };
          if (opts.unseen) intersect(((await c.search({ seen: false }, { uid: true })) || []) as number[]);
          if (alias) intersect(((await c.search({ or: [{ to: alias }, { cc: alias }] }, { uid: true })) || []) as number[]);
          if (q) {
            // certains serveurs refusent une recherche trop large : on essaie du plus complet au plus simple (sujet seulement)
            let found: number[] | null = null;
            for (const query of [{ or: [{ subject: q }, { from: q }, { to: q }, { body: q }] }, { or: [{ subject: q }, { from: q }] }, { subject: q }] as any[]) {
              const r = await c.search(query, { uid: true }).catch(() => false);
              if (r !== false) { found = r as number[]; break; }
            }
            intersect(found ?? []);
          }
          const all = [...(uids ?? [])].sort((a, b) => b - a);
          total = all.length;
          const slice = all.slice((page - 1) * PAGE, page * PAGE);
          if (slice.length === 0) return { folder, page, pageSize: PAGE, total, items: [] };
          range = slice.join(',');
        } else {
          total = (c.mailbox as any).exists ?? 0;
          if (total === 0) return { folder, page, pageSize: PAGE, total: 0, items: [] };
          const end = total - (page - 1) * PAGE, start = Math.max(1, end - PAGE + 1);
          if (end < 1) return { folder, page, pageSize: PAGE, total, items: [] };
          range = `${start}:${end}`;
        }
        const items: any[] = [];
        for await (const m of c.fetch(range, want, { uid: !!(q || alias || opts.unseen) })) {
          const env: any = m.envelope ?? {};
          const addr = (a: any) => ({ name: String(a?.name ?? ''), address: String(a?.address ?? '') });
          items.push({
            uid: m.uid, subject: String(env.subject ?? '(sans sujet)'), from: addr(env.from?.[0]), to: (env.to ?? []).slice(0, 5).map(addr), date: (env.date ?? m.internalDate ?? null),
            seen: m.flags?.has('\\Seen') ?? false, flagged: m.flags?.has('\\Flagged') ?? false, answered: m.flags?.has('\\Answered') ?? false, size: m.size ?? 0, attachments: this.hasAttachment(m.bodyStructure),
          });
        }
        items.sort((a, b) => b.uid - a.uid);
        return { folder, page, pageSize: PAGE, total, items };
      } finally { lock.release(); }
    });
  }

  private async load(c: ImapFlow, folder: string, uid: number, write = false) {
    const lock = await c.getMailboxLock(folder, { readOnly: !write });
    try {
      const msg: any = await c.fetchOne(String(uid), { uid: true, source: true, flags: true, size: true }, { uid: true });
      if (!msg || !msg.source) throw new NotFoundException('Courriel introuvable');
      if ((msg.size ?? msg.source.length) > MAX_SOURCE) throw new BadRequestException('Ce courriel est trop gros pour être affiché ici (plus de 30 Mo)');
      return { msg, parsed: await simpleParser(msg.source) };
    } finally { lock.release(); }
  }

  async message(viewer: Viewer, id: string, folder: string, uid: number, opts: { images?: boolean; peek?: boolean } = {}) {
    const row = await this.row(viewer, id);
    const aliases = this.aliasesOf(row);
    return this.imap(row, async (c) => {
      const { msg, parsed } = await this.load(c, folder, uid, !opts.peek);
      const inline: Record<string, string> = {};
      parsed.attachments.forEach((a: any) => { if (a.cid && /^image\/(png|jpe?g|gif|webp)$/i.test(a.contentType) && a.size <= 1024 * 1024) inline[cidKey(a.cid)] = `data:${a.contentType};base64,${a.content.toString('base64')}`; });
      const html = parsed.html || textToHtml(parsed.text ?? '');
      const clean = sanitizeMailHtml(String(html), { allowImages: !!opts.images, inline });
      const list = (v: any) => (v ? (Array.isArray(v) ? v : [v]).flatMap((x: any) => x.value ?? []).map((a: any) => ({ name: String(a.name ?? ''), address: String(a.address ?? '').toLowerCase() })) : []);
      const to = list(parsed.to), cc = list(parsed.cc);
      const delivered = [parsed.headers.get('delivered-to'), parsed.headers.get('x-original-to'), ...to.map((t) => t.address), ...cc.map((t) => t.address)].flat().map((x: any) => String(x?.text ?? x ?? '').toLowerCase());
      const via = aliases.find((a) => delivered.some((d) => d.includes(a.address)))?.address ?? null;
      if (!opts.peek && !msg.flags?.has('\\Seen')) {
        const lock = await c.getMailboxLock(folder);
        try { await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); } finally { lock.release(); }
        this.unreadCache.delete(row.id);
      }
      return {
        uid, folder, subject: parsed.subject ?? '(sans sujet)', date: parsed.date ?? null, from: list(parsed.from)[0] ?? null, to, cc, replyTo: list(parsed.replyTo)[0] ?? null, via,
        messageId: parsed.messageId ?? null, inReplyTo: parsed.inReplyTo ?? null, references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
        html: clean.html, remoteImages: clean.remoteImages, text: String(parsed.text || htmlToText(String(parsed.html || ''))).slice(0, 200_000),
        attachments: parsed.attachments.map((a: any, index: number) => ({ index, filename: a.filename ?? `pièce-${index + 1}`, contentType: a.contentType, size: a.size, inline: !!a.cid && !!inline[cidKey(a.cid)] })).filter((a: any) => !a.inline),
        seen: true, flagged: msg.flags?.has('\\Flagged') ?? false,
      };
    });
  }

  async attachment(viewer: Viewer, id: string, folder: string, uid: number, index: number) {
    const row = await this.row(viewer, id);
    return this.imap(row, async (c) => {
      const { parsed } = await this.load(c, folder, uid);
      const a: any = parsed.attachments[index];
      if (!a) throw new NotFoundException('Pièce jointe introuvable');
      const filename = String(a.filename ?? `pièce-${index + 1}`).replace(/[\r\n"\\/]+/g, '_').slice(0, 150);
      return { filename, contentType: UNSAFE_TYPE.test(a.contentType ?? '') ? 'application/octet-stream' : String(a.contentType ?? 'application/octet-stream'), content: a.content as Buffer };
    });
  }

  // ------------------------------------------------------------------ rangement

  async setFlags(viewer: Viewer, id: string, folder: string, uids: number[], opts: { seen?: boolean; flagged?: boolean }) {
    const row = await this.row(viewer, id);
    const list = uids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    if (list.length === 0) throw new BadRequestException('Aucun courriel choisi');
    await this.imap(row, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        const set = list.join(',');
        if (opts.seen === true) await c.messageFlagsAdd(set, ['\\Seen'], { uid: true }); else if (opts.seen === false) await c.messageFlagsRemove(set, ['\\Seen'], { uid: true });
        if (opts.flagged === true) await c.messageFlagsAdd(set, ['\\Flagged'], { uid: true }); else if (opts.flagged === false) await c.messageFlagsRemove(set, ['\\Flagged'], { uid: true });
      } finally { lock.release(); }
    });
    this.unreadCache.delete(row.id);
    return { ok: true };
  }

  async move(viewer: Viewer, id: string, folder: string, uids: number[], target: string) {
    const row = await this.row(viewer, id);
    const list = uids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    if (list.length === 0 || !target || target === folder) throw new BadRequestException('Déplacement impossible');
    await this.imap(row, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try { await c.messageMove(list.join(','), target, { uid: true }); } finally { lock.release(); }
    });
    this.unreadCache.delete(row.id);
    return { ok: true };
  }

  /** Supprime : vers la corbeille ; depuis la corbeille (ou sans corbeille), définitivement. */
  async remove_(viewer: Viewer, id: string, folder: string, uids: number[]) {
    const row = await this.row(viewer, id);
    const list = uids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    if (list.length === 0) throw new BadRequestException('Aucun courriel choisi');
    await this.imap(row, async (c) => {
      const trash = (await c.list()).find((f) => f.specialUse === '\\Trash');
      const lock = await c.getMailboxLock(folder);
      try {
        if (trash && trash.path !== folder) await c.messageMove(list.join(','), trash.path, { uid: true });
        else await c.messageDelete(list.join(','), { uid: true });
      } finally { lock.release(); }
    });
    this.unreadCache.delete(row.id);
    return { ok: true };
  }

  // ------------------------------------------------------------------ envoi

  private checkRate(userId: string) {
    const now = Date.now();
    const recent = (this.sends.get(userId) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= SEND_PER_HOUR) throw new BadRequestException(`Limite atteinte : ${SEND_PER_HOUR} courriels par heure`);
    recent.push(now);
    this.sends.set(userId, recent);
  }

  /** Ce que contient un envoi ou un brouillon, après vérification. */
  private async compose(row: Row, input: SendInput, files: UploadedFile[], opts: { draft?: boolean }) {
    const aliases = this.aliasesOf(row);
    const login = parseAddress(row.username);
    const allowed: Alias[] = [...aliases, ...(login && !aliases.some((a) => a.address === login.address) ? [{ address: login.address, name: '' }] : [])];
    const fromAddr = parseAddress(String(input.from ?? ''))?.address ?? allowed[0]?.address;
    const from = allowed.find((a) => a.address === fromAddr);
    if (!from) throw new BadRequestException('Expéditeur non autorisé : choisis un des alias de la boîte');
    const to = parseAddressList(input.to), cc = parseAddressList(input.cc), bcc = parseAddressList(input.bcc);
    const bad = [...to.bad, ...cc.bad, ...bcc.bad];
    if (bad.length) throw new BadRequestException(`Adresse invalide : ${bad[0]}`);
    const recipients = [...to.ok, ...cc.ok, ...bcc.ok];
    if (!opts.draft && to.ok.length === 0) throw new BadRequestException('Indique au moins un destinataire');
    if (recipients.length > MAX_RECIPIENTS) throw new BadRequestException(`Trop de destinataires (${MAX_RECIPIENTS} au plus)`);
    const subject = headerSafe(input.subject ?? '', 300);
    let html: string | undefined;
    let inline: { filename: string; content: Buffer; contentType: string; cid: string }[] = [];
    if (input.html && String(input.html).trim()) {
      const clean = sanitizeOutgoingHtml(String(input.html).slice(0, 600_000));
      const ex = extractInlineImages(clean);
      html = ex.html; inline = ex.attachments;
    }
    const text = String(input.text ?? '').trim() ? String(input.text).slice(0, 200_000) : html ? htmlToText(html).slice(0, 200_000) : '';
    if (!opts.draft && !subject && !text.trim()) throw new BadRequestException('Le courriel est vide');
    const kept = input.draftUid && input.draftFolder ? await this.imap(row, (c) => this.draftFiles(c, String(input.draftFolder), Number(input.draftUid), input.keepAttachments ?? [])) : [];
    const all: UploadedFile[] = [...kept, ...files.slice(0, 10)];
    const total = all.reduce((sum, f) => sum + f.size, 0) + inline.reduce((sum, f) => sum + f.content.length, 0);
    if (total > MAX_SEND_BYTES) throw new BadRequestException('Pièces jointes trop lourdes (20 Mo au total)');
    const msgId = (v: unknown) => { const m = String(v ?? '').trim(); return /^<[^<>\s]{3,200}>$/.test(m) ? m : undefined; };
    const refs = (Array.isArray(input.references) ? input.references : []).map(msgId).filter((x): x is string => !!x).slice(-20);
    const raw: Buffer = await new MailComposer({
      from: { name: headerSafe(from.name, 80), address: from.address }, to: to.ok.map((a) => ({ name: a.name, address: a.address })), cc: cc.ok.map((a) => ({ name: a.name, address: a.address })),
      ...(opts.draft && bcc.ok.length ? { bcc: bcc.ok.map((a) => ({ name: a.name, address: a.address })), keepBcc: true } : {}),
      subject, text, html, inReplyTo: msgId(input.inReplyTo), references: refs.length ? refs : undefined, headers: { 'X-Mailer': 'Seeduction' },
      attachments: [
        ...all.map((f) => ({ filename: String(f.originalname).replace(/[\r\n"\\/]+/g, '_').slice(0, 150), content: f.buffer, contentType: UNSAFE_TYPE.test(f.mimetype) ? 'application/octet-stream' : f.mimetype })),
        ...inline,
      ],
    }).compile().build();
    return { raw, from, recipients, subject, attachments: all.length + inline.length };
  }

  async send(viewer: Viewer, id: string, input: SendInput, files: UploadedFile[], ip?: string | null) {
    const row = await this.row(viewer, id);
    const m = await this.compose(row, input, files, {});
    this.checkRate(viewer.userId);
    try {
      await this.smtp(row).sendMail({ envelope: { from: m.from.address, to: m.recipients.map((r) => r.address) }, raw: m.raw });
    } catch (e: any) { throw new BadRequestException(`Envoi refusé par le serveur : ${errText(e)}`); }

    // copie dans « Envoyés », réponse marquée, brouillon supprimé
    await this.imap(row, async (c) => {
      const list = await c.list();
      const sent = list.find((f) => f.specialUse === '\\Sent')?.path ?? 'Sent';
      try { await c.append(sent, m.raw, ['\\Seen']); } catch (e) { this.logger.warn(`Copie dans « Envoyés » impossible : ${errText(e)}`); }
      if (input.replyFolder && Number.isInteger(input.replyUid) && (input.replyUid as number) > 0) {
        try { const lock = await c.getMailboxLock(String(input.replyFolder)); try { await c.messageFlagsAdd(String(input.replyUid), ['\\Answered'], { uid: true }); } finally { lock.release(); } } catch { /* sans conséquence */ }
      }
      if (input.draftUid && input.draftFolder) {
        try { const lock = await c.getMailboxLock(String(input.draftFolder)); try { await c.messageDelete(String(input.draftUid), { uid: true }); } finally { lock.release(); } } catch { /* déjà supprimé */ }
      }
    }).catch((e) => this.logger.warn(`Après envoi : ${errText(e)}`));
    await this.audit.log(viewer.userId, 'MAIL_SEND', { mailbox: row.label, from: m.from.address, recipients: m.recipients.length, subject: m.subject.slice(0, 80), attachments: m.attachments, html: !!input.html }, ip);
    return { ok: true };
  }

  /** Les pièces jointes d'un brouillon à conserver (par numéro), pour les remettre dans le courriel qu'on en tire. */
  private async draftFiles(c: ImapFlow, folder: string, uid: number, keep: number[]): Promise<UploadedFile[]> {
    if (!Array.isArray(keep) || keep.length === 0) return [];
    const { parsed } = await this.load(c, folder, uid);
    return parsed.attachments.map((a: any, i: number) => ({ a, i })).filter(({ i }) => keep.includes(i)).map(({ a }: any) => ({ originalname: a.filename ?? 'pièce', buffer: a.content as Buffer, mimetype: String(a.contentType ?? 'application/octet-stream'), size: a.size as number }));
  }

  /** Enregistre (ou met à jour) un brouillon dans le dossier Brouillons de la boîte ; renvoie son nouveau numéro. */
  async saveDraft(viewer: Viewer, id: string, input: SendInput, files: UploadedFile[]) {
    const row = await this.row(viewer, id);
    const m = await this.compose(row, input, files, { draft: true });
    return this.imap(row, async (c) => {
      const list = await c.list();
      let path = list.find((f) => f.specialUse === '\\Drafts')?.path ?? 'Drafts';
      let res: any;
      try { res = await c.append(path, m.raw, ['\\Draft', '\\Seen']); } catch {
        try { await c.mailboxCreate(path); res = await c.append(path, m.raw, ['\\Draft', '\\Seen']); } catch (e) { throw new BadRequestException(`Impossible d'enregistrer le brouillon : ${errText(e)}`); }
      }
      if (input.draftUid && input.draftFolder) {
        try { const lock = await c.getMailboxLock(String(input.draftFolder)); try { await c.messageDelete(String(input.draftUid), { uid: true }); } finally { lock.release(); } } catch { /* ancien brouillon déjà supprimé */ }
      }
      return { uid: res?.uid ?? null, folder: path };
    });
  }

  /** Reprise d'un brouillon : son contenu, prêt à remettre dans l'éditeur. */
  async openDraft(viewer: Viewer, id: string, folder: string, uid: number) {
    const row = await this.row(viewer, id);
    return this.imap(row, async (c) => {
      const { parsed } = await this.load(c, folder, uid);
      const list = (v: any) => (v ? (Array.isArray(v) ? v : [v]).flatMap((x: any) => x.value ?? []).map((a: any) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ') : '');
      const fromAddr = (Array.isArray(parsed.from) ? (parsed.from as any)[0] : (parsed.from as any))?.value?.[0]?.address ?? '';
      const html = parsed.html ? sanitizeOutgoingHtml(String(parsed.html)) : '';
      return {
        from: String(fromAddr).toLowerCase(), to: list(parsed.to), cc: list(parsed.cc), bcc: list(parsed.bcc), subject: parsed.subject ?? '', html, text: html ? '' : String(parsed.text ?? ''),
        inReplyTo: parsed.inReplyTo ?? undefined, references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
        attachments: parsed.attachments.filter((a: any) => !a.cid).map((a: any, index: number) => ({ index: parsed.attachments.indexOf(a), filename: a.filename ?? `pièce-${index + 1}`, size: a.size })),
      };
    });
  }

  private contactCache = new Map<string, { at: number; list: { name: string; address: string; n: number }[] }>();
  /** Suggestions d'adresses : les gens à qui on écrit le plus et ceux qui écrivent le plus (lues dans Envoyés et Réception, gardées 10 minutes). */
  async contacts(viewer: Viewer, id: string, q: string) {
    const row = await this.row(viewer, id);
    let hit = this.contactCache.get(row.id);
    if (!hit || Date.now() - hit.at > 600_000) {
      const map = new Map<string, { name: string; address: string; n: number }>();
      const own = new Set(this.aliasesOf(row).map((a) => a.address));
      const add = (a: any, w: number) => { const address = String(a?.address ?? '').toLowerCase(); if (!address || own.has(address)) return; const e = map.get(address) ?? { name: '', address, n: 0 }; e.n += w; if (!e.name && a?.name) e.name = String(a.name); map.set(address, e); };
      await this.imap(row, async (c) => {
        const list = await c.list();
        for (const [path, weight, field] of [[list.find((f) => f.specialUse === '\\Sent')?.path ?? 'Sent', 3, 'to'], ['INBOX', 1, 'from']] as [string, number, 'to' | 'from'][]) {
          let lock; try { lock = await c.getMailboxLock(path, { readOnly: true }); } catch { continue; }
          try {
            const total = (c.mailbox as any).exists ?? 0;
            if (total > 0) for await (const m of c.fetch(`${Math.max(1, total - 199)}:${total}`, { envelope: true } as any)) for (const a of ((m.envelope as any)?.[field] ?? [])) add(a, weight);
          } finally { lock.release(); }
        }
      }).catch(() => undefined);
      hit = { at: Date.now(), list: [...map.values()].sort((a, b) => b.n - a.n).slice(0, 300) };
      this.contactCache.set(row.id, hit);
    }
    const t = String(q ?? '').trim().toLowerCase().slice(0, 60);
    if (t.length < 1) return hit.list.slice(0, 8);
    return hit.list.filter((c) => c.address.includes(t) || c.name.toLowerCase().includes(t)).slice(0, 8);
  }

  /** Le courriel complet (.eml), pour le garder ou l'ouvrir dans un autre logiciel. */
  async source(viewer: Viewer, id: string, folder: string, uid: number) {
    const row = await this.row(viewer, id);
    return this.imap(row, async (c) => {
      const lock = await c.getMailboxLock(folder, { readOnly: true });
      try {
        const msg: any = await c.fetchOne(String(uid), { uid: true, source: true, size: true }, { uid: true });
        if (!msg?.source) throw new NotFoundException('Courriel introuvable');
        if ((msg.size ?? msg.source.length) > MAX_SOURCE) throw new BadRequestException('Courriel trop gros');
        return msg.source as Buffer;
      } finally { lock.release(); }
    });
  }

  /** Brouillon de réponse : destinataires, sujet et citation prêts (le navigateur les place dans le formulaire). */
  async replyDraft(viewer: Viewer, id: string, folder: string, uid: number, mode: 'reply' | 'all' | 'forward') {
    const m = await this.message(viewer, id, folder, uid, { peek: true });
    const row = await this.row(viewer, id);
    const own = new Set([...this.aliasesOf(row).map((a) => a.address), String(parseAddress(row.username)?.address ?? '')]);
    const who = m.replyTo ?? m.from;
    const date = m.date ? new Date(m.date).toLocaleString('fr-CA') : '';
    const quoted = String(m.text ?? '').split('\n').map((l) => `> ${l}`).join('\n');
    const head = `Le ${date}, ${m.from?.name || m.from?.address || ''} a écrit :`;
    const fwdHead = `---------- Message transféré ----------\nDe : ${m.from?.name ? `${m.from.name} <${m.from.address}>` : m.from?.address}\nDate : ${date}\nSujet : ${m.subject}\nÀ : ${m.to.map((t: any) => t.address).join(', ')}\n`;
    const toAliases = m.via ?? [...m.to, ...m.cc].map((a: any) => a.address).find((a: string) => own.has(a)) ?? null;
    return {
      from: toAliases,
      to: mode === 'forward' ? '' : (who?.address ?? ''),
      cc: mode === 'all' ? [...m.to, ...m.cc].map((a: any) => a.address).filter((a: string) => a && !own.has(a) && a !== who?.address).join(', ') : '',
      subject: mode === 'forward' ? prefixSubject(m.subject, 'Fwd') : prefixSubject(m.subject, 'Re'),
      text: `\n\n${mode === 'forward' ? fwdHead + '\n' + String(m.text ?? '') : head + '\n' + quoted}`,
      head: mode === 'forward' ? fwdHead : head, quote: String(m.text ?? ''),
      inReplyTo: mode === 'forward' ? undefined : m.messageId ?? undefined,
      references: mode === 'forward' ? [] : [...m.references, ...(m.messageId ? [m.messageId] : [])].slice(-20),
    };
  }

  // ------------------------------------------------------------------ vérification d'accès (contrôleur)
  assertViewer(v: Viewer) { if (!['ADMIN', 'OWNER'].includes(v.role)) throw new ForbiddenException('Réservé aux administrateurs'); }
}
