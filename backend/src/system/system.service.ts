import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { RoadmapService } from '../roadmap/roadmap.service';

export interface MaintenanceNotice { message: string; startedAt: string; endsAt: string }

export const DEFAULT_MAINTENANCE_MESSAGE = 'Une petite mise à jour est en cours : le site peut être instable ou brièvement indisponible durant les 5 à 10 prochaines minutes. Merci de ta patience !';
const KEY = 'maintenanceNotice';
const MAX_MINUTES = 240;

/**
 * Message de maintenance affiché à tous les visiteurs. Lancé par le script de déploiement (avant la reconstruction, sans autre secret que de passer par le
 * conteneur lui-même) ou à la main par un administrateur ; il se retire tout seul à la fin de sa durée, même si le déploiement échoue.
 */
@Injectable()
export class SystemService {
  constructor(private settings: SettingsService, private roadmap: RoadmapService) {}

  async notice(): Promise<MaintenanceNotice | null> {
    const n = await this.settings.get<MaintenanceNotice>(KEY);
    return n && new Date(n.endsAt).getTime() > Date.now() ? n : null;
  }

  /** État public : message de maintenance éventuel, numéro de version du site (change à chaque déploiement) et heure du serveur. */
  async status() {
    const v = this.roadmap.version();
    return { maintenance: await this.notice(), version: v.version, build: v.build, serverTime: new Date().toISOString() };
  }

  async start(minutes?: number, message?: string): Promise<MaintenanceNotice> {
    const m = Math.min(MAX_MINUTES, Math.max(1, Math.floor(Number(minutes) || 10)));
    const notice: MaintenanceNotice = {
      message: (message ?? '').trim().slice(0, 400) || DEFAULT_MAINTENANCE_MESSAGE,
      startedAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + m * 60_000).toISOString(),
    };
    await this.settings.set(KEY, notice);
    return notice;
  }

  async end() {
    await this.settings.set(KEY, null);
    return { ok: true };
  }
}
