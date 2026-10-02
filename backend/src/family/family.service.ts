import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ALL_PERMS, normalizePerms, permsOf } from '../common/utils/family-perms';

export const MAX_PROFILES = 4; // le profil principal compris
const NAME_FORMAT = /^[\p{L}\p{N}_-]{2,16}$/u;
const PIN_FORMAT = /^\d{4}$/;
const MAX_PIN_FAILURES = 5;
const LOCK_MINUTES = 10;
const SEPARATOR = '·';

export interface ActivityFilter { profileId?: string; action?: string; before?: string; limit?: number }

const ACTION_LABEL: Record<string, string> = {
  login: 'Ouvre une session', download: 'Télécharge', play: 'Lit', view: 'Consulte', upload: 'Envoie un torrent', search: 'Cherche',
  comment: 'Commente', forum: 'Écrit dans le forum', favorite: 'Ajoute aux favoris', collection: 'Modifie une collection', rate: 'Note / aime',
  friend: 'Envoie une demande d\'ami', report: 'Signale', request: 'Crée une demande',
};

/**
 * Compte famille : jusqu'à 4 profils (le profil principal compris) sur un même compte. Chaque profil a son nom, son avatar
 * et un PIN à 4 chiffres obligatoire, demandé à chaque connexion et à chaque changement de profil. Le profil principal
 * (le compte lui-même) gère les autres : création, type (adulte / enfant), PIN, blocage, journal d'activité, et lecture
 * des conversations des profils enfants.
 */
@Injectable()
export class FamilyService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // ------------------------------------------------------------------ outils

  private assertPin(pin: string) {
    if (!PIN_FORMAT.test(String(pin ?? ''))) throw new BadRequestException('Le PIN doit contenir exactement 4 chiffres');
    if (/^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321' || pin === '0123') throw new BadRequestException('Ce PIN est trop facile à deviner : évite 1234, 1111...');
  }

  private async owner(accountId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: accountId } });
    if (!owner || owner.parentId) throw new NotFoundException('Compte introuvable');
    return owner;
  }

  private async ownProfile(accountId: string, profileId: string) {
    const p = await this.prisma.user.findFirst({ where: { id: profileId, parentId: accountId } });
    if (!p) throw new NotFoundException('Profil introuvable');
    return p;
  }

  private card(p: any, owner: { username: string }) {
    return {
      id: p.id, name: p.profileName ?? owner.username, username: p.username, accountName: owner.username, avatarUrl: p.avatarUrl,
      perms: permsOf(p), isMaster: !p.parentId, blocked: !!p.profileBlocked, hasPin: !!p.pinHash,
    };
  }

  // ------------------------------------------------------------------ lecture

  async state(accountId: string) {
    const owner = await this.owner(accountId);
    const subs = await this.prisma.user.findMany({ where: { parentId: accountId }, orderBy: { createdAt: 'asc' } });
    return { enabled: owner.familyEnabled, max: MAX_PROFILES, profiles: owner.familyEnabled ? [this.card(owner, owner), ...subs.map((p) => this.card(p, owner))] : [] };
  }

  // ------------------------------------------------------------------ activation et PIN principal

  async enable(accountId: string, password: string, pin: string) {
    const owner = await this.owner(accountId);
    if (owner.familyEnabled) throw new BadRequestException('Le compte famille est déjà activé');
    if (!(await bcrypt.compare(password ?? '', owner.passwordHash))) throw new UnauthorizedException('Mot de passe incorrect');
    this.assertPin(pin);
    await this.prisma.user.update({ where: { id: accountId }, data: { familyEnabled: true, profileType: 'MASTER', pinHash: await bcrypt.hash(pin, 10), pinFailures: 0, pinLockedUntil: null } });
    return { enabled: true };
  }

  async setMasterPin(accountId: string, password: string, pin: string) {
    const owner = await this.owner(accountId);
    if (!owner.familyEnabled) throw new BadRequestException("Le compte famille n'est pas activé");
    if (!(await bcrypt.compare(password ?? '', owner.passwordHash))) throw new UnauthorizedException('Mot de passe incorrect');
    this.assertPin(pin);
    await this.prisma.user.update({ where: { id: accountId }, data: { pinHash: await bcrypt.hash(pin, 10), pinFailures: 0, pinLockedUntil: null } });
    return { ok: true };
  }

  // ------------------------------------------------------------------ gestion des profils (profil principal)

  private composeUsername(name: string, ownerName: string) {
    return `${name}${SEPARATOR}${ownerName}`;
  }

  private async assertNameFree(accountId: string, owner: { username: string }, name: string, exceptId?: string) {
    if (!NAME_FORMAT.test(name)) throw new BadRequestException('Le nom du profil : 2 à 16 caractères (lettres, chiffres, - ou _, sans espace)');
    const username = this.composeUsername(name, owner.username);
    const clash = await this.prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new BadRequestException('Ce nom de profil est déjà pris sur ce compte');
    return username;
  }

  async createProfile(accountId: string, input: { name: string; pin: string; perms?: unknown; avatarUrl?: string | null }) {
    const owner = await this.owner(accountId);
    if (!owner.familyEnabled) throw new BadRequestException("Active d'abord le compte famille");
    const count = await this.prisma.user.count({ where: { parentId: accountId } });
    if (count + 1 >= MAX_PROFILES) throw new BadRequestException(`Un compte famille compte ${MAX_PROFILES} profils au maximum (le tien compris)`);
    const name = String(input.name ?? '').trim();
    this.assertPin(input.pin);
    const username = await this.assertNameFree(accountId, owner, name);
    const avatarUrl = input.avatarUrl && /^\/api\/covers\/[\w.-]+$/.test(input.avatarUrl) ? input.avatarUrl : null;
    const created = await this.prisma.user.create({
      data: {
        username, email: `profil-${randomBytes(8).toString('hex')}@profils.invalid`, passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 4), // aucun mot de passe utilisable : on entre par le compte
        parentId: accountId, profileName: name, profileType: 'PROFILE', profilePerms: normalizePerms(input.perms), pinHash: await bcrypt.hash(input.pin, 10), avatarUrl,
        role: 'USER', showAdult: false, defaultView: owner.defaultView,
      },
    });
    return this.card(created, owner);
  }

  async updateProfile(accountId: string, profileId: string, body: { name?: string; perms?: unknown; avatarUrl?: string | null }) {
    const owner = await this.owner(accountId);
    const p = await this.ownProfile(accountId, profileId);
    const data: Record<string, any> = {};
    if (body.name !== undefined && body.name.trim() !== p.profileName) {
      const name = body.name.trim();
      data.username = await this.assertNameFree(accountId, owner, name, p.id);
      data.profileName = name;
    }
    if (body.perms !== undefined) {
      const perms = normalizePerms({ ...permsOf(p), ...(body.perms as object) });
      data.profilePerms = perms;
      if (!perms.adult) data.showAdult = false; // sans droit « contenu adulte », l'affichage est coupé tout de suite
    }
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl && !/^\/api\/covers\/[\w.-]+$/.test(body.avatarUrl)) throw new BadRequestException('Avatar invalide');
      data.avatarUrl = body.avatarUrl || null;
    }
    const updated = Object.keys(data).length ? await this.prisma.user.update({ where: { id: p.id }, data }) : p;
    return this.card(updated, owner);
  }

  async resetPin(accountId: string, profileId: string, pin: string) {
    this.assertPin(pin);
    const p = await this.ownProfile(accountId, profileId);
    await this.prisma.user.update({ where: { id: p.id }, data: { pinHash: await bcrypt.hash(pin, 10), pinFailures: 0, pinLockedUntil: null } });
    return { ok: true };
  }

  async setBlocked(accountId: string, profileId: string, blocked: boolean) {
    const p = await this.ownProfile(accountId, profileId);
    await this.prisma.user.update({ where: { id: p.id }, data: { profileBlocked: !!blocked } });
    return { ok: true, blocked: !!blocked };
  }

  // ------------------------------------------------------------------ choix du profil

  /** Les profils proposés à l'écran « Qui est-ce ? » (jeton de compte ou jeton d'un profil du même compte). */
  async picker(accountId: string) {
    const st = await this.state(accountId);
    if (!st.enabled) throw new BadRequestException("Le compte famille n'est pas activé");
    return { profiles: st.profiles };
  }

  /** Vérifie le PIN du profil choisi (5 erreurs = profil verrouillé 10 minutes) et ouvre sa session. */
  async select(accountId: string, profileId: string, pin: string, ip: string | null) {
    const owner = await this.owner(accountId);
    if (!owner.familyEnabled) throw new BadRequestException("Le compte famille n'est pas activé");
    if (owner.status === 'BANNED') throw new UnauthorizedException('Compte banni');
    const p = profileId === owner.id ? owner : await this.ownProfile(accountId, profileId);
    if (p.profileBlocked) throw new ForbiddenException('Ce profil est bloqué par le profil principal');
    if (!p.pinHash) throw new BadRequestException("Ce profil n'a pas encore de PIN : le profil principal doit en définir un");
    if (p.pinLockedUntil && p.pinLockedUntil > new Date()) {
      const mins = Math.ceil((p.pinLockedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException(`Trop d'essais : ce profil est verrouillé encore ${mins} minute${mins > 1 ? 's' : ''}`);
    }
    if (!(await bcrypt.compare(String(pin ?? ''), p.pinHash))) {
      const failures = p.pinFailures + 1;
      const lock = failures >= MAX_PIN_FAILURES;
      await this.prisma.user.update({ where: { id: p.id }, data: { pinFailures: lock ? 0 : failures, pinLockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
      await this.record(accountId, p.id, 'pin_failed', null, null, null, ip);
      if (lock) throw new ForbiddenException(`PIN incorrect : profil verrouillé ${LOCK_MINUTES} minutes`);
      throw new ForbiddenException(`PIN incorrect (${MAX_PIN_FAILURES - failures} essai${MAX_PIN_FAILURES - failures > 1 ? 's' : ''} restant${MAX_PIN_FAILURES - failures > 1 ? 's' : ''})`); // 403 (pas 401) : le navigateur ne doit pas fermer la session sur une erreur de PIN
    }
    await this.prisma.user.update({ where: { id: p.id }, data: { pinFailures: 0, pinLockedUntil: null, lastSeenAt: new Date(), lastIp: ip ?? undefined } });
    await this.record(accountId, p.id, 'login', null, null, null, ip);

    const isMaster = p.id === owner.id;
    const payload: JwtPayload = isMaster
      ? { sub: owner.id, username: owner.username, role: owner.role, fam: true }
      : { sub: p.id, username: p.username, role: 'USER', acct: owner.id, fam: true };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: p.id, username: p.username, role: isMaster ? owner.role : 'USER', passkey: isMaster ? owner.passkey : '',
        profile: { name: p.profileName ?? owner.username, perms: isMaster ? ALL_PERMS : permsOf(p), account: owner.username, isMaster, familyId: owner.id },
      },
    };
  }

  /** Quitter le profil pour revenir à l'écran de choix (nouveau jeton de compte, sans mot de passe). */
  async exit(accountId: string) {
    const owner = await this.owner(accountId);
    return { accessToken: this.jwt.sign({ sub: owner.id, username: owner.username, role: owner.role, scope: 'account' } satisfies JwtPayload, { expiresIn: '10m' }) };
  }

  // ------------------------------------------------------------------ journal d'activité

  async record(accountId: string, profileId: string, action: string, targetType: string | null, targetId: string | null, detail: string | null, ip: string | null) {
    try {
      // Même action sur la même cible dans les 10 dernières minutes : une seule ligne (les « consultations » ne noient pas le journal).
      if (action === 'view' || action === 'search') {
        const last = await this.prisma.familyActivity.findFirst({ where: { profileId, action, targetId, detail }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        if (last && Date.now() - last.createdAt.getTime() < 10 * 60_000) return;
      }
      await this.prisma.familyActivity.create({ data: { accountId, profileId, action, targetType, targetId, detail: detail?.slice(0, 200) ?? null, ip } });
    } catch { /* le journal ne doit jamais faire échouer l'action elle-même */ }
  }

  async activity(accountId: string, filter: ActivityFilter) {
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 50));
    const rows = await this.prisma.familyActivity.findMany({
      where: {
        accountId,
        ...(filter.profileId ? { profileId: filter.profileId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.before ? { createdAt: { lt: new Date(filter.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const torrentIds = [...new Set(rows.filter((r) => r.targetType === 'torrent' && r.targetId).map((r) => r.targetId!))];
    const userIds = [...new Set(rows.filter((r) => r.targetType === 'user' && r.targetId).map((r) => r.targetId!))];
    const [torrents, targets, profiles, owner] = await Promise.all([
      torrentIds.length ? this.prisma.torrent.findMany({ where: { id: { in: torrentIds } }, select: { id: true, name: true } }) : [],
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } }) : [],
      this.prisma.user.findMany({ where: { parentId: accountId }, select: { id: true, profileName: true, username: true, avatarUrl: true } }),
      this.prisma.user.findUnique({ where: { id: accountId }, select: { id: true, username: true, avatarUrl: true } }),
    ]);
    const tName = new Map<string, string>(torrents.map((t) => [t.id, t.name] as [string, string]));
    const uName = new Map<string, string>(targets.map((u) => [u.id, u.username] as [string, string]));
    const who = new Map<string, { name: string; avatarUrl: string | null }>([[accountId, { name: owner?.username ?? '?', avatarUrl: owner?.avatarUrl ?? null }]]);
    profiles.forEach((p) => who.set(p.id, { name: p.profileName ?? p.username, avatarUrl: p.avatarUrl }));
    return {
      items: rows.map((r) => ({
        id: r.id, at: r.createdAt, profile: { id: r.profileId, ...(who.get(r.profileId) ?? { name: '(supprimé)', avatarUrl: null }) },
        action: r.action, verb: r.action === 'pin_failed' ? 'PIN incorrect saisi' : ACTION_LABEL[r.action] ?? r.action,
        target: r.targetType === 'torrent' ? { type: 'torrent', id: r.targetId, label: tName.get(r.targetId ?? '') ?? '(torrent supprimé)' }
          : r.targetType === 'user' ? { type: 'user', id: r.targetId, label: uName.get(r.targetId ?? '') ?? '(membre supprimé)' } : null,
        detail: r.detail, ip: r.ip,
      })),
      next: rows.length === limit ? rows[rows.length - 1].createdAt : null,
    };
  }

  // ------------------------------------------------------------------ conversations des profils

  /** Le profil principal a le contrôle complet : il peut lire les conversations de n'importe quel autre profil du compte. */
  private async childOf(accountId: string, profileId: string) {
    return this.ownProfile(accountId, profileId);
  }

  async childConversations(accountId: string, profileId: string) {
    const child = await this.childOf(accountId, profileId);
    const convs = await this.prisma.conversation.findMany({
      where: { members: { some: { userId: child.id } }, type: { in: ['DIRECT', 'GROUP'] } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: { members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } } },
    });
    return convs.map((c) => ({
      id: c.id, type: c.type,
      name: c.type === 'DIRECT' ? c.members.find((m) => m.userId !== child.id)?.user.username ?? 'Membre' : c.name,
      members: c.members.map((m) => m.user.username), lastMessageAt: c.lastMessageAt,
    }));
  }

  async childMessages(accountId: string, profileId: string, conversationId: string, before?: string) {
    const child = await this.childOf(accountId, profileId);
    const member = await this.prisma.conversationMember.findFirst({ where: { conversationId, userId: child.id }, select: { id: true } });
    if (!member) throw new NotFoundException('Conversation introuvable');
    const rows = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
    });
    return rows.reverse().map((m) => ({
      id: m.id, at: m.createdAt, type: m.type, content: m.content, imageUrl: m.imageUrl, fileName: m.fileName, durationMs: m.durationMs,
      sender: m.sender, fromChild: m.senderId === child.id,
    }));
  }
}
