import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { EVENTS, EVENT_IDS, EventConfig, EventId, activeEvent, nextNewYear, nextWindow, normalizeEventConfig } from '../common/utils/event-themes';

const KEY = 'eventThemes';
export interface Actor { userId: string; username: string }

@Injectable()
export class EventThemesService {
  constructor(private settings: SettingsService, private audit: AuditService) {}

  async config(): Promise<EventConfig> { return normalizeEventConfig(await this.settings.get(KEY)); }

  /** Thème en cours (public : chaque page le demande) : l'identifiant, d'où il vient et si les particules sont activées par défaut. */
  async active() {
    const cfg = await this.config();
    const a = activeEvent(new Date(), cfg);
    const info = a ? EVENTS.find((e) => e.id === a.id) : null;
    const ny = nextNewYear(new Date(), cfg.timezone);
    return {
      id: a?.id ?? null, name: info?.name ?? null, source: a?.source ?? null, until: a?.until ?? null, particles: cfg.particles,
      // Compte à rebours du Jour de l'An : l'instant de minuit et à partir de quand l'afficher (null = désactivé).
      newYear: cfg.enabled && cfg.countdown.enabled ? { at: ny.at.toISOString(), year: ny.year, daysBefore: cfg.countdown.daysBefore } : null,
    };
  }

  /** Écran d'administration : réglages, et pour chaque événement sa période en cours ou à venir. */
  async admin() {
    const cfg = await this.config();
    const now = new Date();
    return {
      config: cfg,
      active: await this.active(),
      events: EVENTS.map((e) => ({ id: e.id, name: e.name, icon: e.icon, blurb: e.blurb, defaults: e.defaults, window: nextWindow(e.id, now, cfg) })),
    };
  }

  async save(actor: Actor, body: any, ip?: string | null) {
    const cur = await this.config();
    const merged = normalizeEventConfig({
      ...cur, ...body,
      events: Object.fromEntries(EVENT_IDS.map((id) => [id, { ...cur.events[id], ...(body?.events?.[id] ?? {}) }])),
      force: cur.force,
      countdown: { ...cur.countdown, ...(body?.countdown ?? {}) },
    }, cur);
    await this.settings.set(KEY, merged);
    await this.audit.log(actor.userId, 'EVENT_THEMES_CONFIG', { enabled: merged.enabled, particles: merged.particles, events: Object.fromEntries(EVENT_IDS.map((id) => [id, merged.events[id].enabled])) }, ip);
    return this.admin();
  }

  /** Active un thème tout de suite pour tout le monde (pour `hours` heures, ou jusqu'à ce qu'on l'arrête), ou arrête le forçage (id nul). */
  async force(actor: Actor, id: EventId | null, hours: number | null, ip?: string | null) {
    if (id !== null && !EVENT_IDS.includes(id)) throw new BadRequestException('Événement inconnu');
    const cur = await this.config();
    const until = id && hours && hours > 0 ? new Date(Date.now() + Math.min(hours, 24 * 60) * 3600_000).toISOString() : null;
    await this.settings.set(KEY, { ...cur, force: { id, until } });
    await this.audit.log(actor.userId, id ? 'EVENT_THEME_FORCE' : 'EVENT_THEME_FORCE_END', { id, until }, ip);
    return this.admin();
  }
}
