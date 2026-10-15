import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { Game, Summary, inLiveWindow, normalizeGame, summarize } from '../common/utils/nhl';
import { DEFAULT_GOAL_BONUS, GoalBonusConfig, GoalBonusService, normalizeGoalBonus } from './goal-bonus.service';

const KEY = 'sports';
const API = 'https://api-web.nhle.com/v1';
const SCHEDULE_TTL = 15 * 60_000;
const SCHEDULE_TTL_GAME = 60_000;
const SCORE_TTL = 5_000;
const RESULT_TTL = 4_000;
const TIMEOUT_MS = 8_000;

export interface SportsConfig { enabled: boolean; team: string; goalBonus: GoalBonusConfig }
export interface Actor { userId: string; username: string }
export const TEAMS: Record<string, string> = { MTL: 'Canadiens de Montréal' };

export function normalizeSportsConfig(raw: any, previous?: SportsConfig): SportsConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: r.enabled === undefined ? previous?.enabled ?? true : r.enabled === true,
    team: typeof r.team === 'string' && TEAMS[r.team] ? r.team : previous?.team ?? 'MTL',
    goalBonus: normalizeGoalBonus(r.goalBonus, previous?.goalBonus ?? DEFAULT_GOAL_BONUS),
  };
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
  /** Moment où le tableau des scores en direct a été lu (le chrono du match est exact à cet instant). */
  private liveAt = 0;
  private logos = new Map<string, { at: number; svg: string }>();

  constructor(private settings: SettingsService, private audit: AuditService, private goals: GoalBonusService) {}

  async config(): Promise<SportsConfig> { return normalizeSportsConfig(await this.settings.get(KEY)); }

  async saveConfig(actor: Actor, body: any, ip?: string | null) {
    const before = await this.config();
    const next = normalizeSportsConfig(body ?? {}, before);
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

  /** Logo d'une équipe de la LNH (SVG en couleurs), gardé en mémoire : les membres ne contactent jamais la LNH directement. */
  async logo(abbrev: string): Promise<string | null> {
    if (!/^[A-Z]{2,3}$/.test(abbrev)) return null;
    const hit = this.logos.get(abbrev);
    if (hit && Date.now() - hit.at < 7 * 86400_000) return hit.svg;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`, { signal: ctrl.signal, headers: { 'User-Agent': 'Seeduction/1.0 (score des Canadiens)' } });
      if (!r.ok) throw new Error(`LNH : réponse ${r.status}`);
      const svg = await r.text();
      if (!svg.trimStart().startsWith('<svg') && !svg.trimStart().startsWith('<?xml')) throw new Error('logo invalide');
      if (this.logos.size > 80) this.logos.clear();
      this.logos.set(abbrev, { at: Date.now(), svg });
      return svg;
    } catch (e) {
      this.logger.warn(`Logo ${abbrev} indisponible : ${(e as Error).message}`);
      return hit?.svg ?? null;
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
      if (c) this.liveAt = Math.max(this.liveAt, c.at);
    }
    return games.map((g) => {
      const live = byId.get(g.id);
      if (!live) return g;
      const n = normalizeGame(live, team);
      return { ...n, venue: n.venue ?? g.venue, tv: n.tv.length ? n.tv : g.tv, kind: n.kind === 'AUTRE' ? g.kind : n.kind };
    });
  }

  /** Tous les matchs de la saison du club (calendrier en cache), pour les jeux. Liste vide si la LNH est injoignable. */
  async seasonGames(): Promise<Game[]> {
    const cfg = await this.config();
    try { return await this.loadSchedule(cfg.team, new Date()); } catch { return this.schedule?.games ?? []; }
  }

  /**
   * Pendant un match, le serveur lit lui-même le tableau des scores toutes les 10 secondes : un but est ainsi repéré (et récompensé) même si
   * aucun membre n'a la pastille ouverte, et le score de départ est connu avant la mise au jeu.
   */
  @Interval(10_000)
  async watch() {
    try {
      const cfg = await this.config();
      if (!cfg.enabled || !cfg.goalBonus.enabled) return;
      if (!this.schedule) { await this.canadiens(); return; } // premier chargement du calendrier
      if (!inLiveWindow(this.schedule.games, new Date())) return;
      await this.canadiens();
    } catch { /* la prochaine lecture réessaiera */ }
  }

  async canadiens() {
    const cfg = await this.config();
    if (!cfg.enabled) return { enabled: false };
    const now = new Date();
    if (this.result && this.result.team === cfg.team && now.getTime() - this.result.at < RESULT_TTL) return { ...this.result.payload, serverNow: now.toISOString() };
    if (!this.inflight) {
      this.inflight = (async () => {
        try {
          const games = await this.overlayLive(cfg.team, await this.loadSchedule(cfg.team, now), now);
          const summary: Summary = summarize(games, now);
          this.goals.observe(summary.live, cfg.goalBonus, TEAMS[cfg.team]);
          const payload = { enabled: true, available: true, stale: false, team: { abbrev: cfg.team, name: TEAMS[cfg.team] }, ...summary, updatedAt: now.toISOString(), clockAt: new Date(this.liveAt || now.getTime()).toISOString() };
          this.result = { at: now.getTime(), team: cfg.team, payload };
          return { ...payload, serverNow: new Date().toISOString() };
        } catch (e: any) {
          this.logger.warn(`LNH injoignable : ${e?.message ?? e}`);
          return this.result ? { ...this.result.payload, stale: true } : { enabled: true, available: false };
        } finally { this.inflight = null; }
      })();
    }
    return this.inflight;
  }
}
