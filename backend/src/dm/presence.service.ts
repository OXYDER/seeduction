import { Injectable } from '@nestjs/common';

/**
 * Membres actuellement connectés au chat privé (un membre peut avoir plusieurs onglets ouverts, donc plusieurs
 * sockets) — partagé entre la gateway (qui l'alimente) et le reste de l'API (qui a besoin de savoir qui est en ligne).
 */
@Injectable()
export class PresenceService {
  private sockets = new Map<string, Set<string>>(); // userId -> socketIds

  /** true si c'est la première connexion de ce membre (vient de passer en ligne). */
  add(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (set) { set.add(socketId); return false; }
    this.sockets.set(userId, new Set([socketId]));
    return true;
  }

  /** true si c'était sa dernière connexion (vient de passer hors ligne). */
  remove(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) { this.sockets.delete(userId); return true; }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }

  onlineAmong(userIds: string[]): string[] {
    return userIds.filter((id) => this.sockets.has(id));
  }
}
