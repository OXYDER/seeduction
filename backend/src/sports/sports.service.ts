import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { Game, Summary, inLiveWindow, normalizeGame, summarize } from '../common/utils/nhl';

const KEY = 'sports';
const API = 'https://api-web.nhle.com/v1';
const SCHEDULE_TTL = 15 * 60_000;
const SCHEDULE_TTL_GAME = 60_000;
const SCORE_TTL = 15_000;
const RESULT_TTL = 10_000;
const TIMEOUT_MS = 8_000;

export interface SportsConfig { enabled: boolean; team: string }
export interface Actor { userId: string; username: string }
export const TEAMS: Record<string, string> = { MTL: 'Canadiens de Montréal' };

export function normalizeSportsConfig(raw: any): SportsConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { enabled: r.enabled === undefined ? true : r.enabled === true, team: typeof r.team === 'string' && TEAMS[r.team] ? r.team : 'MTL' };
}

/**
 * Score des Canadiens de Montréal à chaque match, d'après l'API publique de la LNH (gratuite, sans clé). Deux niveaux de cache : le calendrier du club
 * (rafraîchi chaque minute autour d'un match, sinon tous les quarts d'heure) et le tableau des scores du jour (toutes les 15 secondes pendant un match).
 * Si la LNH ne répond pas, la dernière réponse connue est servie (« périmée ») plutôt qu'une erreur.
 */
@Injectable()
export class SportsService {
  private readonly logger = new Logger(SportsService.name);
  private schedule: { at: number; team: string; games: Game[] } | null = null;
  private scores = new Map<string, { at: number; raw: any[] }>();
  private result: { at: number; team: string; payload: any } | null = null;
  private inflight: Promise<any> | null = null;

  constructor(private settings: SettingsService, private audit: AuditService) {}

  async config(): Promise<SportsConfig> { return normalizeSportsConfig(await this.settings.get(KEY)); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const next = normalizeSportsConfig({ ...(await this.config()), ...(body ?? {}) });
    await this.settings.set(KEY, next);
    this.result = null;
    await this.audit.log(actor.userId, 'SPORTS_CONFIG', next as any, ip);
    return next;
  }

  private async getJson(url: string): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Seeduction/1.0 (score des Canadiens)', Accept: 'application/json' } });
      if (!r.ok) throw new Error(`LNH : réponse ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  private async loadSchedule(team: string, now: Date): Promise<Game[]> {
    const ttl = this.schedule && inLiveWindow(this.schedule.games, now) ? SCHEDULE_TTL_GAME : SCHEDULE_TTL;
    if (this.schedule && this.schedule.team === team && now.getTime() - this.schedule.at < ttl) return this.schedule.games;
    const data = await this.getJson(`${API}/club-schedule-season/${team}/now`);
    const games = (data.games ?? []).map((g: any) => normalizeGame(g, team));
    this.schedule = { at: now.getTime(), team, games };
    return games;
  }

  /** Pendant un match : le tableau des scores du jour donne le score, la période et le chrono à la seconde près. */
  private async overlayLive(team: string, games: Game[], now: Date): Promise<Game[]> {
    if (!inLiveWindow(games, now)) return games;
    const t = now.getTime();
    const dates = [...new Set(games.filter((g) => { const s = new Date(g.startUtc).getTime(); return g.state !== 'PPD' && t >= s - 1800_000 && t <= s + 5 * 3600_000; }).map((g) => g.date))];
    const byId = new Map<number, any>();
    for (const date of dates) {
      let c = this.scores.get(date);
      if (!c || t - c.at > SCORE_TTL) {
        try { c = { at: t, raw: (await this.getJson(`${API}/score/${date}`)).games ?? [] }; this.scores.set(date, c); }
        catch (e: any) { this.logger.debug(`Scores en direct indisponibles (${e?.message ?? e})`); }
      }
      for (const g of c?.raw ?? []) byId.set(Number(g.id), g);
    }
    return games.map((g) => {
      const live = byId.get(g.id);
      if (!live) return g;
      const n = normalizeGame(live, team);
      return { ...n, venue: n.venue ?? g.venue, tv: n.tv.length ? n.tv : g.tv, kind: n.kind === 'AUTRE' ? g.kind : n.kind };
    });
  }

  async canadiens() {
    const cfg = await this.config();
    if (!cfg.enabled) return { enabled: false };
    const now = new Date();
    if (this.result && this.result.team === cfg.team && now.getTime() - this.result.at < RESULT_TTL) return this.result.payload;
    if (!this.inflight) {
      this.inflight = (async () => {
        try {
          const games = await this.overlayLive(cfg.team, await this.loadSchedule(cfg.team, now), now);
          const summary: Summary = summarize(games, now);
          const payload = { enabled: true, available: true, stale: false, team: { abbrev: cfg.team, name: TEAMS[cfg.team] }, ...summary, updatedAt: now.toISOString() };
          this.result = { at: now.getTime(), team: cfg.team, payload };
          return payload;
        } catch (e: any) {
          this.logger.warn(`LNH injoignable : ${e?.message ?? e}`);
          return this.result ? { ...this.result.payload, stale: true } : { enabled: true, available: false };
        } finally { this.inflight = null; }
      })();
    }
    return this.inflight;
  }
}
