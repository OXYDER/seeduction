import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { STAFF_ROLES, WebmailService, type Viewer } from './webmail.service';

const MAX_TEMPLATES = 60;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/**
 * Modèles de réponses partagés (par boîte) et alerte « nouveau courriel » dans la cloche des personnes qui ont accès à la boîte.
 */
@Injectable()
export class WebmailExtrasService {
  private readonly logger = new Logger(WebmailExtrasService.name);
  /** Dernier numéro de courriel vu par boîte : seuls les courriels arrivés depuis déclenchent une alerte (le premier passage ne fait que noter l'état). */
  private seen = new Map<string, number>();

  constructor(private prisma: PrismaService, private mail: WebmailService, private notifications: NotificationsService) {}

  // ------------------------------------------------------------------ modèles de réponses

  async templates(viewer: Viewer, mailboxId: string) {
    await this.mail.row(viewer, mailboxId);
    const rows = await this.prisma.mailTemplate.findMany({ where: { mailboxId }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body, mine: t.createdById === viewer.userId }));
  }

  async saveTemplate(viewer: Viewer, mailboxId: string, input: { id?: string; name?: string; subject?: string; body?: string }) {
    await this.mail.row(viewer, mailboxId);
    const name = clean(input.name, 80), subject = clean(input.subject, 200), body = String(input.body ?? '').slice(0, 20_000);
    if (!name) throw new BadRequestException('Donne un nom au modèle');
    if (!body.trim()) throw new BadRequestException('Le modèle est vide');
    if (input.id) {
      const prev = await this.prisma.mailTemplate.findUnique({ where: { id: input.id } });
      if (!prev || prev.mailboxId !== mailboxId) throw new NotFoundException('Modèle introuvable');
      if (prev.createdById !== viewer.userId && !['ADMIN', 'OWNER'].includes(viewer.role)) throw new ForbiddenException('Seule la personne qui a créé ce modèle (ou un administrateur) peut le modifier');
      return this.prisma.mailTemplate.update({ where: { id: input.id }, data: { name, subject, body } });
    }
    if ((await this.prisma.mailTemplate.count({ where: { mailboxId } })) >= MAX_TEMPLATES) throw new BadRequestException(`Au plus ${MAX_TEMPLATES} modèles par boîte`);
    return this.prisma.mailTemplate.create({ data: { mailboxId, name, subject, body, createdById: viewer.userId } });
  }

  async removeTemplate(viewer: Viewer, mailboxId: string, id: string) {
    await this.mail.row(viewer, mailboxId);
    const prev = await this.prisma.mailTemplate.findUnique({ where: { id } });
    if (!prev || prev.mailboxId !== mailboxId) throw new NotFoundException('Modèle introuvable');
    if (prev.createdById !== viewer.userId && !['ADMIN', 'OWNER'].includes(viewer.role)) throw new ForbiddenException('Seule la personne qui a créé ce modèle (ou un administrateur) peut le supprimer');
    await this.prisma.mailTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ alerte « nouveau courriel »

  /** Toutes les 2 minutes : y a-t-il du nouveau dans la réception d'une boîte ? Si oui, la cloche des personnes autorisées reçoit une notification (regroupée tant qu'elle n'est pas lue). */
  @Cron('*/2 * * * *')
  async checkNewMail() {
    let boxes: Awaited<ReturnType<typeof this.prisma.mailbox.findMany>>;
    try { boxes = await this.prisma.mailbox.findMany(); } catch { return; }
    for (const box of boxes) {
      try {
        const res = await this.mail.imap(box as any, async (c) => {
          const st = await c.status('INBOX', { uidNext: true, unseen: true });
          const prev = this.seen.get(box.id);
          const next = st.uidNext ?? 0;
          if (prev === undefined || next <= prev) return { next, fresh: [] as { from: string; subject: string }[], unseen: st.unseen ?? 0 };
          const fresh: { from: string; subject: string }[] = [];
          const lock = await c.getMailboxLock('INBOX', { readOnly: true });
          try {
            for await (const m of c.fetch(`${prev}:*`, { uid: true, envelope: true, flags: true } as any, { uid: true })) {
              if (m.uid < prev || m.flags?.has('\\Seen')) continue;
              const env: any = m.envelope ?? {};
              fresh.push({ from: String(env.from?.[0]?.name || env.from?.[0]?.address || '?'), subject: String(env.subject ?? '(sans sujet)') });
            }
          } finally { lock.release(); }
          return { next, fresh, unseen: st.unseen ?? 0 };
        });
        const wasKnown = this.seen.has(box.id);
        this.seen.set(box.id, res.next);
        if (!wasKnown || res.fresh.length === 0) continue;
        const recipients = await this.prisma.user.findMany({
          where: { parentId: null, status: 'ACTIVE', role: { in: STAFF_ROLES as any }, OR: [{ role: 'OWNER' }, { id: { in: [...(box.createdById ? [box.createdById] : []), ...box.allowedUserIds] } }] },
          select: { id: true },
        });
        const first = res.fresh[0];
        for (const u of recipients) {
          await this.notifications.notify({
            userId: u.id, type: 'SYSTEM', category: 'support', groupKey: `mail:${box.id}`,
            title: `📬 Nouveau courriel · ${box.label}`, titleMany: `📬 Nouveaux courriels · ${box.label}`,
            body: res.fresh.length > 1 ? `${first.from} : ${first.subject} (et ${res.fresh.length - 1} autre${res.fresh.length > 2 ? 's' : ''})` : `${first.from} : ${first.subject}`.slice(0, 200), link: '/courriel',
          });
        }
      } catch (e: any) {
        this.logger.debug(`Vérification du courriel impossible pour « ${box.label} » : ${e?.message ?? e}`);
      }
    }
  }
}
