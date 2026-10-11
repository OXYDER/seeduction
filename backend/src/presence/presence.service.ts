import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PresenceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

export type PublicStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';

interface Entry { sockets: Set<string>; username: string; preference: PresenceStatus; watchers: Set<string>; idle: Set<string> }

/**
 * Présence en direct de tout le site (chat public ET chat privé partagent la même instance) : qui est connecté
 * (peu importe la page), avec son statut choisi (En ligne / Absent / Occupé / Apparaître hors ligne). Émet des
 * événements que les gateways relaient à leurs clients respectifs, pour ne pas les coupler entre elles.
 *
 * Inactivité : chaque onglet du Messenger (« watcher ») signale quand il n'a plus eu d'activité depuis quelques minutes. Un membre « En ligne » dont tous
 * les onglets sont inactifs apparaît « Absent », et redevient « En ligne » dès qu'un onglet signale une activité. Occupé et Hors ligne ne changent jamais.
 */
@Injectable()
export class PresenceService extends EventEmitter {
  private users = new Map<string, Entry>();

  constructor(private prisma: PrismaService) {
    super();
    this.setMaxListeners(50);
  }

  /** true si c'est la toute première connexion de ce membre, tous onglets/sockets confondus (vient de passer en ligne). */
  async connect(userId: string, socketId: string, username: string): Promise<boolean> {
    const existing = this.users.get(userId);
    if (existing) { existing.sockets.add(socketId); return false; }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { presenceStatus: true } });
    this.users.set(userId, { sockets: new Set([socketId]), username, preference: user?.presenceStatus ?? 'ONLINE', watchers: new Set(), idle: new Set() });
    this.emit('presence-changed', { userId, online: true });
    return true;
  }

  /** true si c'était sa dernière connexion (vient de passer hors ligne). */
  disconnect(userId: string, socketId: string): boolean {
    const entry = this.users.get(userId);
    if (!entry) return false;
    const before = this.publicStatus(userId);
    entry.sockets.delete(socketId);
    entry.watchers.delete(socketId);
    entry.idle.delete(socketId);
    if (entry.sockets.size > 0) {
      const now = this.publicStatus(userId);
      if (now !== before) this.emit('status-changed', { userId, status: now });
      return false;
    }
    this.users.delete(userId);
    this.emit('presence-changed', { userId, online: false });
    return true;
  }

  setPreference(userId: string, preference: PresenceStatus) {
    const entry = this.users.get(userId);
    if (entry) entry.preference = preference;
    this.emit('status-changed', { userId, status: this.publicStatus(userId) });
  }

  /** Un onglet du Messenger commence à signaler son activité : il compte désormais dans le calcul de l'inactivité (actif tant qu'il n'a rien signalé). */
  watch(userId: string, socketId: string) {
    this.users.get(userId)?.watchers.add(socketId);
  }

  /** Un onglet signale qu'il est inactif (idle = true) ou de nouveau actif ; le statut public change si tous les onglets suivis sont inactifs. */
  setIdle(userId: string, socketId: string, idle: boolean) {
    const entry = this.users.get(userId);
    if (!entry?.sockets.has(socketId)) return;
    const before = this.publicStatus(userId);
    entry.watchers.add(socketId);
    if (idle) entry.idle.add(socketId); else entry.idle.delete(socketId);
    const now = this.publicStatus(userId);
    if (now !== before) this.emit('status-changed', { userId, status: now });
  }

  /** Tous les onglets suivis du membre sont inactifs. */
  private isIdle(entry: Entry): boolean {
    if (entry.watchers.size === 0) return false;
    for (const id of entry.watchers) if (!entry.idle.has(id)) return false;
    return true;
  }

  isOnline(userId: string): boolean {
    return this.users.has(userId);
  }

  onlineAmong(userIds: string[]): string[] {
    return userIds.filter((id) => this.users.has(id));
  }

  /** Statut visible par les AUTRES membres : une préférence « Apparaître hors ligne » ou une déconnexion donnent OFFLINE. */
  publicStatus(userId: string): PublicStatus {
    const entry = this.users.get(userId);
    if (!entry || entry.preference === 'INVISIBLE') return 'OFFLINE';
    if (entry.preference === 'ONLINE' && this.isIdle(entry)) return 'AWAY';
    return entry.preference;
  }

  /** Tous les membres connectés, y compris ceux qui apparaissent hors ligne (réservé à l'équipe). */
  listOnlineAll(): { id: string; username: string; preference: PresenceStatus; sockets: number }[] {
    return [...this.users.entries()].map(([id, e]) => ({ id, username: e.username, preference: e.preference, sockets: e.sockets.size }));
  }

  /** Liste des membres connectés visibles publiquement (le chat public affiche cette liste à droite). */
  listOnline(): { id: string; username: string; status: PublicStatus }[] {
    return [...this.users.entries()]
      .filter(([, e]) => e.preference !== 'INVISIBLE')
      .map(([id]) => ({ id, username: this.users.get(id)!.username, status: this.publicStatus(id) }));
  }
}
