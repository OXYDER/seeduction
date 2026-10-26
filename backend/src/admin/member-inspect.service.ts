import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ECONOMY } from '../common/utils/economy';

export const SECTIONS = ['downloads', 'unfinished', 'uploads', 'seeds', 'hnr', 'friends', 'forum', 'pm', 'dm', 'chat'] as const;
export type Section = (typeof SECTIONS)[number];
/** Sections qui montrent le contenu de conversations : déverrouillage par mot de passe (+ code 2FA) et chaque consultation est inscrite au journal d'audit. */
export const PRIVATE_SECTIONS: Section[] = ['pm', 'dm', 'chat'];

const PAGE = 30;
const UNLOCK_MS = 15 * 60_000;
const RANK: Record<string, number> = { USER: 0, MODERATOR: 1, SUPER_MODERATOR: 2, ADMIN: 3, OWNER: 4 };
const excerpt = (s: string | null | undefined, n = 600) => { const t = String(s ?? '').replace(/\r/g, ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const gb = (b: bigint | number) => { const n = Number(b); return n >= 1e9 ? `${(n / 1e9).toFixed(2)} Go` : `${Math.round(n / 1e6)} Mo`; };
const hours = (s: number) => (s >= 3600 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 60)} min`);

/** `facts` : des lignes « étiquette : valeur » faciles à lire (dates, obligation de seed, volumes échangés...). `tone` colore la valeur : ok (vert), warn (orange), bad (rouge). */
export interface InspectItem { id: string; at: string; primary: string; secondary?: string; text?: string; tags: string[]; link?: string; facts?: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }[] }
const when = (d: Date | null | undefined) => (d ? d.toLocaleString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);
const dayOnly = (d: Date | null | undefined) => (d ? d.toLocaleDateString('fr-CA', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : null);
export interface Actor { userId: string; username: string; role: string }

/**
 * Vue complète du compte d'un membre pour les administrateurs : téléchargements, envois, seeds, hit & run, amis, forum, et (après déverrouillage) messages privés et chat.
 * Le contenu des conversations n'est montré qu'après avoir saisi à nouveau son mot de passe (et son code 2FA), seulement pour un membre de rang inférieur, et chaque page consultée est inscrite au journal d'audit.
 */
@Injectable()
export class MemberInspectService {
  private unlocked = new Map<string, number>();

  constructor(private prisma: PrismaService, private audit: AuditService, private auth: AuthService) {}

  /** Le compte et ses profils famille (leurs messages, sujets et amis comptent aussi). */
  private async scope(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, parentId: true, username: true, role: true, email: true, status: true, mustResetPassword: true } });
    if (!u) throw new NotFoundException('Membre introuvable');
    const accountId = u.parentId ?? u.id;
    const account = u.parentId ? await this.prisma.user.findUnique({ where: { id: accountId }, select: { id: true, parentId: true, username: true, role: true, email: true, status: true, mustResetPassword: true } }) : u;
    if (!account) throw new NotFoundException('Compte introuvable');
    const children = await this.prisma.user.findMany({ where: { parentId: accountId }, select: { id: true } });
    return { account, ids: [accountId, ...children.map((c) => c.id)] };
  }

  private assertRank(actor: Actor, target: { id: string; role: string }, strict: boolean) {
    const a = RANK[actor.role] ?? 0, t = RANK[target.role] ?? 0;
    if (actor.userId === target.id) return;
    if (strict ? a <= t : a < t) throw new ForbiddenException(strict ? 'Le contenu des conversations d\'un membre de ton rang ou supérieur n\'est pas consultable' : 'Ce membre est de rang supérieur');
  }

  async unlock(actor: Actor, userId: string, body: { password?: string; totpToken?: string }, ip?: string | null) {
    const { account } = await this.scope(userId);
    this.assertRank(actor, account, true);
    await this.auth.assertStaffReauth(actor.userId, String(body?.password ?? ''), body?.totpToken, ip);
    this.unlocked.set(actor.userId, Date.now() + UNLOCK_MS);
    await this.audit.log(actor.userId, 'STAFF_UNLOCK_PRIVATE', { targetId: account.id, target: account.username }, ip);
    return { unlockedUntil: new Date(Date.now() + UNLOCK_MS).toISOString() };
  }

  private isUnlocked(actorId: string) { const t = this.unlocked.get(actorId); return !!t && t > Date.now(); }

  async overview(actor: Actor, userId: string) {
    const { account, ids } = await this.scope(userId);
    this.assertRank(actor, account, false);
    const [downloads, uploads, seeds, hnr, friends, forum, pm, dm, chat] = await Promise.all([
      this.prisma.snatch.count({ where: { userId: { in: ids } } }),
      this.prisma.torrent.count({ where: { uploaderId: { in: ids } } }),
      this.prisma.peer.count({ where: { userId: { in: ids } } }),
      this.prisma.snatch.count({ where: { userId: { in: ids }, hnr: true, satisfied: false } }), // seulement les cas à régler : les régularisés ne sont plus qu'un historique (liste des téléchargements)
      this.prisma.friendship.count({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } }),
      this.prisma.forumPost.count({ where: { authorId: { in: ids } } }),
      this.prisma.privateMessage.count({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } }),
      this.prisma.message.count({ where: { deletedAt: null, legacyPmId: null, conversation: { type: 'DIRECT', members: { some: { userId: { in: ids } } } } } }),
      this.prisma.message.count({ where: { deletedAt: null, senderId: { in: ids }, conversation: { type: { in: ['GROUP', 'CHANNEL'] } } } }),
    ]);
    return {
      user: { id: account.id, username: account.username, role: account.role, status: account.status, email: account.email },
      mustResetPassword: account.mustResetPassword,
      counts: { downloads, uploads, seeds, hnr, friends, forum, pm, dm, chat },
      privateUnlocked: this.isUnlocked(actor.userId),
      canSeePrivate: (RANK[actor.role] ?? 0) > (RANK[account.role] ?? 0) || actor.userId === account.id,
    };
  }

  async list(actor: Actor, userId: string, section: string, page: number, ip?: string | null) {
    if (!(SECTIONS as readonly string[]).includes(section)) throw new BadRequestException('Section inconnue');
    const sec = section as Section;
    const { account, ids } = await this.scope(userId);
    const priv = PRIVATE_SECTIONS.includes(sec);
    this.assertRank(actor, account, priv);
    if (priv) {
      if (!this.isUnlocked(actor.userId)) throw new ForbiddenException('Saisis ton mot de passe pour consulter les conversations');
      await this.audit.log(actor.userId, 'STAFF_VIEW_PRIVATE', { targetId: account.id, target: account.username, section: sec, page }, ip);
    }
    const pg = Math.max(1, Math.floor(page) || 1), skip = (pg - 1) * PAGE;
    const done = (items: InspectItem[], total: number) => ({ section: sec, items, total, page: pg, pageSize: PAGE });

    if (sec === 'downloads' || sec === 'hnr') {
      // Onglet « Hit & run » : seulement les cas encore à régler. Un hit & run régularisé n'apparaît plus que dans l'historique des téléchargements (étiquette sur la ligne).
      const where = { userId: { in: ids }, ...(sec === 'hnr' ? { hnr: true, satisfied: false } : {}) };
      const [rows, total] = await Promise.all([this.prisma.snatch.findMany({ where, orderBy: { completedAt: 'desc' }, skip, take: PAGE, include: { torrent: { select: { id: true, name: true, size: true } } } }), this.prisma.snatch.count({ where })]);
      const tids = [...new Set(rows.map((r) => r.torrentId))];
      const flows = tids.length ? await this.prisma.userTorrentFlow.groupBy({ by: ['torrentId'], where: { userId: { in: ids }, torrentId: { in: tids } }, _sum: { up: true, down: true }, _min: { day: true } }) : [];
      const flowOf = new Map(flows.map((f) => [f.torrentId, f]));
      const required = ECONOMY.hnrSeedHours;
      return done(rows.map((s) => {
        const f = flowOf.get(s.torrentId);
        const seeded = Math.floor(s.seedSeconds / 3600);
        const added = s.startedAt ? when(s.startedAt) : f?._min.day ? `${dayOnly(f._min.day)} (heure inconnue)` : null;
        const obligation = s.hnrClearedAt ? 'Effacée avec des points bonus'
          : s.satisfied ? `Atteinte ✓ (${seeded} h de seed sur ${required} h demandées)`
          : `Pas encore atteinte : ${seeded} h de seed sur ${required} h demandées`;
        const hnrState = s.hnr && !s.satisfied ? 'Hit & run à régler' : s.hnr && s.satisfied ? 'Hit & run régularisé (historique)' : null;
        return {
          id: s.id, at: s.completedAt.toISOString(), primary: s.torrent?.name ?? '(torrent supprimé)',
          secondary: s.torrent ? `Taille : ${gb(s.torrent.size)}` : undefined,
          tags: [s.satisfied ? 'Obligation de seed atteinte' : 'Obligation de seed à terminer', ...(hnrState ? [hnrState] : [])],
          link: s.torrent ? `/torrents/${s.torrent.id}` : undefined,
          facts: [
            { label: 'Ajouté le', value: added ?? 'Non enregistré (téléchargement d\'avant ce suivi)' },
            { label: 'Complété le', value: when(s.completedAt) ?? '—' },
            { label: 'Obligation de seed', value: obligation, tone: s.satisfied ? 'ok' : 'warn' },
            ...(s.hnr ? [{ label: 'Hit & run', value: s.hnrClearedAt ? `Effacé avec des points${s.hnrResolvedAt ? ` le ${when(s.hnrResolvedAt)}` : ''}` : s.satisfied ? `Régularisé en reprenant le seed${s.hnrResolvedAt ? ` le ${when(s.hnrResolvedAt)}` : ''} : clos, plus d'avertissement` : 'Non régularisé : le membre doit reprendre le seed', tone: s.satisfied ? ('ok' as const) : ('bad' as const) }] : []),
            { label: 'Données reçues (download)', value: f ? gb(f._sum.down ?? 0n) : 'Non enregistrées' },
            { label: 'Données envoyées (upload)', value: f ? gb(f._sum.up ?? 0n) : 'Non enregistrées' },
            ...(s.lastSeedAt ? [{ label: 'Dernier signe de seed', value: when(s.lastSeedAt) ?? '' }] : []),
          ],
        };
      }), total);
    }
    if (sec === 'unfinished') {
      // Torrents dont le membre a reçu des morceaux (suivi quotidien des annonces) sans jamais les terminer ; ses propres envois n'en font pas partie.
      const flows = await this.prisma.userTorrentFlow.groupBy({ by: ['torrentId'], where: { userId: { in: ids } }, _sum: { got: true, down: true }, _max: { day: true }, orderBy: { _max: { day: 'desc' } }, take: 600 });
      const tids = flows.map((f) => f.torrentId);
      const [snatched, torrents] = await Promise.all([
        this.prisma.snatch.findMany({ where: { userId: { in: ids }, torrentId: { in: tids } }, select: { torrentId: true } }),
        this.prisma.torrent.findMany({ where: { id: { in: tids }, uploaderId: { notIn: ids } }, select: { id: true, name: true, size: true } }),
      ]);
      const finished = new Set(snatched.map((x) => x.torrentId));
      const byId = new Map(torrents.map((t) => [t.id, t]));
      const rest = flows.filter((f) => !finished.has(f.torrentId) && byId.has(f.torrentId) && (Number(f._sum.got ?? 0) > 0 || Number(f._sum.down ?? 0) > 0));
      return done(rest.slice(skip, skip + PAGE).map((f) => {
        const t = byId.get(f.torrentId)!;
        const got = Number(f._sum.got ?? 0) || Number(f._sum.down ?? 0), size = Number(t.size);
        const pct = size > 0 ? Math.min(100, Math.round((got / size) * 100)) : 0;
        return { id: f.torrentId, at: (f._max.day ?? new Date()).toISOString(), primary: t.name, secondary: `reçu ${gb(got)} sur ${gb(t.size)} (${pct} %)`, tags: [pct >= 95 ? 'Presque fini' : 'Non terminé'], link: `/torrents/${t.id}` };
      }), rest.length);
    }
    if (sec === 'uploads') {
      const where = { uploaderId: { in: ids } };
      const [rows, total] = await Promise.all([this.prisma.torrent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: PAGE, select: { id: true, name: true, size: true, status: true, seeders: true, leechers: true, anonymousUpload: true, createdAt: true } }), this.prisma.torrent.count({ where })]);
      return done(rows.map((t) => ({ id: t.id, at: t.createdAt.toISOString(), primary: t.name, secondary: `${gb(t.size)} · ${t.seeders} seeder(s), ${t.leechers} leecher(s)`, tags: [t.status, ...(t.anonymousUpload ? ['Anonyme'] : [])], link: `/torrents/${t.id}` })), total);
    }
    if (sec === 'seeds') {
      const where = { userId: { in: ids } };
      const [rows, total] = await Promise.all([this.prisma.peer.findMany({ where, orderBy: { lastAnnounceAt: 'desc' }, skip, take: PAGE, include: { torrent: { select: { id: true, name: true } } } }), this.prisma.peer.count({ where })]);
      return done(rows.map((p) => ({ id: p.id, at: p.lastAnnounceAt.toISOString(), primary: p.torrent.name, secondary: `Envoyé ${gb(p.uploaded)} · reçu ${gb(p.downloaded)} · ${p.ip}${p.userAgent ? ` · ${p.userAgent}` : ''}`, tags: [p.isSeeder ? 'Seed' : 'Télécharge'], link: `/torrents/${p.torrent.id}` })), total);
    }
    if (sec === 'friends') {
      const where = { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] };
      const [rows, total] = await Promise.all([
        this.prisma.friendship.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: PAGE, include: { requester: { select: { id: true, username: true } }, addressee: { select: { id: true, username: true } } } }),
        this.prisma.friendship.count({ where }),
      ]);
      return done(rows.map((f) => { const mineIsRequester = ids.includes(f.requesterId); const other = mineIsRequester ? f.addressee : f.requester; return { id: f.id, at: f.createdAt.toISOString(), primary: other.username, secondary: mineIsRequester ? 'Demande envoyée par ce membre' : 'Demande reçue par ce membre', tags: [String(f.status)], link: `/users/${other.id}` }; }), total);
    }
    if (sec === 'forum') {
      const where = { authorId: { in: ids } };
      const [rows, total] = await Promise.all([
        this.prisma.forumPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: PAGE, include: { topic: { select: { id: true, title: true, authorId: true, posts: { orderBy: { createdAt: 'asc' }, take: 1, select: { id: true } } } } } }),
        this.prisma.forumPost.count({ where }),
      ]);
      return done(rows.map((p) => ({ id: p.id, at: p.createdAt.toISOString(), primary: p.topic.title, text: excerpt(p.content, 500), tags: [p.topic.posts[0]?.id === p.id ? 'Sujet' : 'Réponse', ...(p.editedAt ? ['Modifié'] : [])], link: `/forum/topics/${p.topic.id}` })), total);
    }
    if (sec === 'pm') {
      const where = { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] };
      const [rows, total] = await Promise.all([
        this.prisma.privateMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: PAGE, include: { sender: { select: { username: true } }, recipient: { select: { username: true } } } }),
        this.prisma.privateMessage.count({ where }),
      ]);
      return done(rows.map((m) => ({ id: m.id, at: m.createdAt.toISOString(), primary: `${m.sender.username} → ${m.recipient.username}`, secondary: m.subject || undefined, text: excerpt(m.content), tags: [ids.includes(m.senderId) ? 'Envoyé' : 'Reçu', m.read ? 'Lu' : 'Non lu'] })), total);
    }
    // dm : conversations privées du messager ; chat : groupes et canaux (messages écrits par ce membre)
    const where = sec === 'dm'
      ? { deletedAt: null, legacyPmId: null, conversation: { type: 'DIRECT' as const, members: { some: { userId: { in: ids } } } } }
      : { deletedAt: null, senderId: { in: ids }, conversation: { type: { in: ['GROUP', 'CHANNEL'] as ('GROUP' | 'CHANNEL')[] } } };
    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: PAGE, include: { sender: { select: { username: true } }, conversation: { select: { type: true, name: true, slug: true, members: { select: { user: { select: { username: true } } }, take: 4 } } } } }),
      this.prisma.message.count({ where }),
    ]);
    return done(rows.map((m) => {
      const c = m.conversation;
      const where = c.type === 'DIRECT' ? `Conversation : ${c.members.map((x) => x.user.username).join(' ↔ ')}` : `${c.type === 'CHANNEL' ? '#' : ''}${c.name ?? c.slug ?? 'groupe'}`;
      const kind = m.type !== 'TEXT' ? [String(m.type)] : [];
      return { id: m.id, at: m.createdAt.toISOString(), primary: `${m.sender.username}`, secondary: where, text: excerpt(m.content || (m.fileName ? `📎 ${m.fileName}` : m.imageUrl ? '🖼️ image' : '')), tags: [...kind, ...(ids.includes(m.senderId) ? ['Écrit par ce membre'] : [])] };
    }), total);
  }
}
