import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PresenceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

export type PublicStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';

interface Entry { sockets: Set<string>; username: string; preference: PresenceStatus }

/**
 * Présence en direct de tout le site (chat public ET chat privé partagent la même instance) : qui est connecté
 * (peu importe la page), avec son statut choisi (En ligne / Absent / Occupé / Apparaître hors ligne). Émet des
 * événements que les gateways relaient à leurs clients respectifs, pour ne pas les coupler entre elles.
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
    this.users.set(userId, { sockets: new Set([socketId]), username, preference: user?.presenceStatus ?? 'ONLINE' });
    this.emit('presence-changed', { userId, online: true });
    return true;
  }

  /** true si c'était sa dernière connexion (vient de passer hors ligne). */
  disconnect(userId: string, socketId: string): boolean {
    const entry = this.users.get(userId);
    if (!entry) return false;
    entry.sockets.delete(socketId);
    if (entry.sockets.size > 0) return false;
    this.users.delete(userId);
    this.emit('presence-changed', { userId, online: false });
    return true;
  }

  setPreference(userId: string, preference: PresenceStatus) {
    const entry = this.users.get(userId);
    if (entry) entry.preference = preference;
    this.emit('status-changed', { userId, status: this.publicStatus(userId) });
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
    return entry.preference;
  }

  /** Liste des membres connectés visibles publiquement (le chat public affiche cette liste à droite). */
  listOnline(): { id: string; username: string; status: PublicStatus }[] {
    return [...this.users.entries()]
      .filter(([, e]) => e.preference !== 'INVISIBLE')
      .map(([id, e]) => ({ id, username: e.username, status: e.preference as PublicStatus }));
  }
}
