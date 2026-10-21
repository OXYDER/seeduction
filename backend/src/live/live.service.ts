import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { jobMonitor } from '../common/utils/job-monitor';
import {
  activeAt, LiveConfig, normalizeLiveConfig, Repeat, SlotLike, upcoming, validStreamUrl,
} from '../common/utils/live-schedule';

const KEY = 'liveRelay';
const PUSH_EVERY_MS = 60_000;

export interface RelayStatus {
  /** Dernier envoi au relais. */
  lastPushAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  /** Ce que le relais a reçu : un flux (nom) ou « rien ». */
  pushed: string | null;
}

/**
 * Directs planifiés (Admin > Direct) : le membre de l'équipe enregistre ses flux (adresses de son Dispatcharr) et un calendrier ;
 * toutes les 20 secondes, le site calcule le flux qui doit être diffusé et le communique au serveur relais, qui le publie sous une seule adresse.
 * Les adresses des flux ne sont jamais montrées aux membres : ils ne reçoivent que l'adresse publique du relais, et seulement pendant une diffusion.
 */
@Injectable()
export class LiveService {
  private readonly log = new Logger(LiveService.name);
  private lastKey: string | null = null;
  private lastPushAt = 0;
  private status: RelayStatus = { lastPushAt: null, lastOk: null, lastError: null, pushed: null };
  private busy = false;

  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  // ── Réglages du relais ──────────────────────────────────────────────────────

  async config(): Promise<LiveConfig> { return normalizeLiveConfig(await this.settings.get(KEY)); }

  async saveConfig(raw: any): Promise<LiveConfig> {
    const next = normalizeLiveConfig(raw, await this.config());
    if (next.enabled && (!next.controlUrl || !next.secret)) throw new BadRequestException('Pour activer les directs, renseigne l\'adresse de contrôle du relais et son secret.');
    await this.settings.set(KEY, next);
    this.lastKey = null; // on renvoie l'état au relais tout de suite
    void this.sync().catch(() => undefined);
    return next;
  }

  /** Version sans le secret, pour le navigateur. */
  publicConfig(c: LiveConfig) {
    const { secret, ...rest } = c;
    return { ...rest, secretSet: !!secret };
  }

  // ── Flux ───────────────────────────────────────────────────────────────────

  streams() { return this.prisma.liveStream.findMany({ orderBy: { createdAt: 'asc' } }); }

  private streamData(body: any, partial = false) {
    const data: any = {};
    if (!partial || body?.name !== undefined) {
      const name = String(body?.name ?? '').trim();
      if (!name || name.length > 80) throw new BadRequestException('Donne un nom au flux (80 caractères au plus).');
      data.name = name;
    }
    if (!partial || body?.url !== undefined) {
      if (!validStreamUrl(body?.url)) throw new BadRequestException('Adresse de flux invalide : elle doit commencer par http://, https://, rtmp://, rtsp://, srt:// ou udp://, sans espace ni guillemet.');
      data.url = String(body.url).trim();
    }
    if (body?.enabled !== undefined) data.enabled = !!body.enabled;
    return data;
  }

  async createStream(body: any) {
    const row = await this.prisma.liveStream.create({ data: this.streamData(body) });
    this.lastKey = null;
    return row;
  }

  async updateStream(id: string, body: any) {
    await this.mustStream(id);
    const row = await this.prisma.liveStream.update({ where: { id }, data: this.streamData(body, true) });
    this.lastKey = null;
    return row;
  }

  async deleteStream(id: string) {
    await this.mustStream(id);
    await this.prisma.liveStream.delete({ where: { id } }); // ses créneaux partent avec lui
    this.lastKey = null;
  }

  private async mustStream(id: string) {
    const s = await this.prisma.liveStream.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Flux introuvable');
    return s;
  }

  // ── Calendrier ──────────────────────────────────────────────────────────────

  slots() { return this.prisma.liveSlot.findMany({ orderBy: { startsAt: 'asc' }, include: { stream: { select: { id: true, name: true } } } }); }

  private async slotData(body: any, partial = false) {
    const data: any = {};
    if (!partial || body?.streamId !== undefined) {
      await this.mustStream(String(body?.streamId ?? ''));
      data.streamId = String(body.streamId);
    }
    if (!partial || body?.startsAt !== undefined) {
      const d = new Date(body?.startsAt);
      if (!Number.isFinite(d.getTime())) throw new BadRequestException('Date et heure de début invalides.');
      data.startsAt = d;
    }
    if (!partial || body?.durationMin !== undefined) {
      const n = Math.floor(Number(body?.durationMin));
      if (!Number.isFinite(n) || n < 5 || n > 1440) throw new BadRequestException('La durée doit être de 5 minutes à 24 heures.');
      data.durationMin = n;
    }
    if (!partial || body?.repeat !== undefined) {
      if (!['NONE', 'DAILY', 'WEEKLY'].includes(body?.repeat ?? 'NONE')) throw new BadRequestException('Répétition invalide.');
      data.repeat = body?.repeat ?? 'NONE';
    }
    if (body?.repeatUntil !== undefined) {
      if (body.repeatUntil === null || body.repeatUntil === '') data.repeatUntil = null;
      else {
        const d = new Date(body.repeatUntil);
        if (!Number.isFinite(d.getTime())) throw new BadRequestException('Date de fin de répétition invalide.');
        data.repeatUntil = d;
      }
    }
    if (body?.title !== undefined) data.title = body.title ? String(body.title).trim().slice(0, 120) || null : null;
    if (body?.enabled !== undefined) data.enabled = !!body.enabled;
    return data;
  }

  async createSlot(body: any) {
    const row = await this.prisma.liveSlot.create({ data: await this.slotData(body) });
    this.lastKey = null;
    return row;
  }

  async updateSlot(id: string, body: any) {
    if (!(await this.prisma.liveSlot.findUnique({ where: { id } }))) throw new NotFoundException('Créneau introuvable');
    const row = await this.prisma.liveSlot.update({ where: { id }, data: await this.slotData(body, true) });
    this.lastKey = null;
    return row;
  }

  async deleteSlot(id: string) {
    if (!(await this.prisma.liveSlot.findUnique({ where: { id } }))) throw new NotFoundException('Créneau introuvable');
    await this.prisma.liveSlot.delete({ where: { id } });
    this.lastKey = null;
  }

  private slotLikes(rows: any[]): SlotLike[] {
    return rows.map((r) => ({ id: r.id, streamId: r.streamId, title: r.title, startsAt: r.startsAt, durationMin: r.durationMin, repeat: r.repeat as Repeat, repeatUntil: r.repeatUntil, enabled: r.enabled }));
  }

  /** Ce qui est diffusé à cet instant : le créneau en cours et son flux (null si rien, si le flux est désactivé ou si les directs sont arrêtés). */
  async current(now = new Date()) {
    const cfg = await this.config();
    const [rows, streams] = await Promise.all([this.prisma.liveSlot.findMany(), this.prisma.liveStream.findMany()]);
    const occ = activeAt(this.slotLikes(rows), now, cfg.timezone);
    const stream = occ ? streams.find((s) => s.id === occ.slot.streamId) ?? null : null;
    return { cfg, occ, stream: stream && stream.enabled ? stream : null, streams };
  }

  // ── Page d'administration ───────────────────────────────────────────────────

  async overview() {
    const now = new Date();
    const cfg = await this.config();
    const [rows, streams] = await Promise.all([this.slots(), this.streams()]);
    const occ = activeAt(this.slotLikes(rows), now, cfg.timezone);
    const names = new Map(streams.map((s) => [s.id, s.name]));
    return {
      config: this.publicConfig(cfg),
      streams,
      slots: rows,
      now: occ ? { slotId: occ.slot.id, streamId: occ.slot.streamId, streamName: names.get(occ.slot.streamId) ?? '?', title: occ.slot.title ?? null, start: occ.start, end: occ.end } : null,
      next: upcoming(this.slotLikes(rows), now, 14, 12, cfg.timezone).map((o) => ({ slotId: o.slot.id, streamName: names.get(o.slot.streamId) ?? '?', title: o.slot.title ?? null, start: o.start, end: o.end })),
      relay: this.status,
    };
  }

  // ── Côté membres ────────────────────────────────────────────────────────────

  /** Ce que voit un membre : la diffusion en cours (avec l'adresse du relais) et les prochaines. Jamais l'adresse d'un flux source. */
  async forMembers() {
    const now = new Date();
    const { cfg, occ, stream } = await this.current(now);
    const [rows, streams] = await Promise.all([this.prisma.liveSlot.findMany(), this.prisma.liveStream.findMany()]);
    const names = new Map(streams.map((s) => [s.id, s.name]));
    const live = cfg.enabled && !!occ && !!stream && !!cfg.playbackUrl;
    const next = cfg.enabled
      ? upcoming(this.slotLikes(rows).filter((s) => streams.find((x) => x.id === s.streamId)?.enabled), now, 14, 6, cfg.timezone)
        .filter((o) => !occ || o.slot.id !== occ.slot.id || o.start.getTime() !== occ.start.getTime())
        .map((o) => ({ title: o.slot.title ?? names.get(o.slot.streamId) ?? 'Direct', start: o.start, end: o.end }))
      : [];
    return {
      live,
      title: live ? occ!.slot.title ?? stream!.name : null,
      endsAt: live ? occ!.end : null,
      playbackUrl: live ? cfg.playbackUrl : null,
      next,
    };
  }

  // ── Envoi au relais ─────────────────────────────────────────────────────────

  /** Toutes les 20 s : calcule le flux voulu et le communique au relais (sans rien renvoyer si rien n'a changé, sauf un rappel par minute). */
  @Interval(20_000)
  async tick() {
    jobMonitor.run('direct.relais', 20_000);
    try { await this.sync(); } catch (e) { jobMonitor.fail('direct.relais', e); this.log.warn(`Direct : ${(e as Error).message}`); }
  }

  async sync(force = false) {
    if (this.busy) {
      if (!force) return;
      for (let i = 0; i < 100 && this.busy; i++) await new Promise((r) => setTimeout(r, 50)); // un envoi est déjà en cours : on attend qu'il finisse
      if (this.busy) return;
    }
    this.busy = true;
    try {
      const { cfg, stream } = await this.current();
      if (!cfg.controlUrl || !cfg.secret) return;
      const want = cfg.enabled && stream ? { url: stream.url, onDemand: cfg.onDemand, transcode: cfg.transcode } : { url: null as string | null, onDemand: cfg.onDemand, transcode: cfg.transcode };
      const key = JSON.stringify(want);
      if (!force && key === this.lastKey && Date.now() - this.lastPushAt < PUSH_EVERY_MS) return;
      // Sans rien à diffuser et sans avoir jamais rien envoyé : pas la peine de déranger le relais.
      if (!force && this.lastKey === null && !want.url && !cfg.enabled) { this.lastKey = key; return; }
      await this.pushToRelay(cfg, want);
      this.lastKey = key;
      this.lastPushAt = Date.now();
      this.status = { lastPushAt: new Date().toISOString(), lastOk: true, lastError: null, pushed: want.url ? stream!.name : 'rien (en veille)' };
    } catch (e) {
      this.status = { ...this.status, lastPushAt: new Date().toISOString(), lastOk: false, lastError: String((e as Error).message ?? e).slice(0, 300) };
      this.lastKey = null; // on réessaie au prochain passage
      throw e;
    } finally { this.busy = false; }
  }

  private async relay(cfg: LiveConfig, method: 'GET' | 'PUT', path: string, body?: unknown) {
    const res = await fetch(cfg.controlUrl + path, {
      method,
      headers: { Authorization: `Bearer ${cfg.secret}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Le relais a répondu ${res.status}${res.status === 401 ? ' (secret refusé)' : ''}${text ? ` : ${text.slice(0, 120)}` : ''}`);
    try { return JSON.parse(text); } catch { return {}; }
  }

  private pushToRelay(cfg: LiveConfig, want: { url: string | null; onDemand: boolean; transcode: string }) { return this.relay(cfg, 'PUT', '/source', want); }

  /** Bouton « Tester le relais » : demande son état et vérifie le secret. */
  async testRelay() {
    const cfg = await this.config();
    if (!cfg.controlUrl || !cfg.secret) throw new BadRequestException('Renseigne l\'adresse de contrôle du relais et son secret, puis enregistre.');
    try { return { ok: true, relay: await this.relay(cfg, 'GET', '/etat') }; } catch (e) { return { ok: false, error: String((e as Error).message ?? e).slice(0, 300) }; }
  }
}
