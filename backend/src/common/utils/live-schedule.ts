/**
 * Calendrier des diffusions en direct (Admin > Direct) : à chaque instant, quel flux doit être diffusé.
 * Les heures se règlent à l'heure locale du site (fuseau choisi, Montréal par défaut) : une diffusion « tous les mardis à 20 h » reste à 20 h
 * après le changement d'heure. Fonctions pures, sans base de données ni réseau.
 */
export type Repeat = 'NONE' | 'DAILY' | 'WEEKLY';

export interface SlotLike {
  id: string;
  streamId: string;
  title?: string | null;
  /** Première occurrence (instant UTC). Les suivantes gardent la même heure locale. */
  startsAt: Date;
  durationMin: number;
  repeat: Repeat;
  /** Dernière occurrence permise (instant UTC) pour une répétition ; absent = sans fin. */
  repeatUntil?: Date | null;
  enabled: boolean;
}

export interface Occurrence { slot: SlotLike; start: Date; end: Date }

export const DEFAULT_TIMEZONE = 'America/Toronto';
const MIN = 60_000;
const DAY = 86_400_000;

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('fr-CA', { timeZone: tz }); return true; } catch { return false; }
}

/** Date et heure locales d'un instant dans un fuseau. `weekday` : 0 = dimanche. */
export function zonedParts(date: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  return { y, m, d, h: Number(p.hour), min: Number(p.minute), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** Écart (ms) entre l'heure locale du fuseau et l'UTC à cet instant. */
function offsetMs(date: Date, timeZone: string): number {
  const z = zonedParts(date, timeZone);
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, 0) - Math.floor(date.getTime() / MIN) * MIN;
}

/** L'instant UTC qui correspond à une date et une heure locales du fuseau (à l'heure d'été, une heure inexistante est décalée vers l'avant). */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min, 0);
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** Les occurrences d'un créneau dont la période [début, fin) touche [from, to]. */
export function occurrencesBetween(slot: SlotLike, from: Date, to: Date, timeZone: string = DEFAULT_TIMEZONE): Occurrence[] {
  if (!slot.enabled || !(slot.durationMin > 0)) return [];
  const durMs = slot.durationMin * MIN;
  const make = (start: Date): Occurrence => ({ slot, start, end: new Date(start.getTime() + durMs) });
  const touches = (o: Occurrence) => o.end.getTime() > from.getTime() && o.start.getTime() <= to.getTime();

  if (slot.repeat === 'NONE' || !slot.repeat) {
    const o = make(slot.startsAt);
    return touches(o) ? [o] : [];
  }
  const base = zonedParts(slot.startsAt, timeZone);
  const last = slot.repeatUntil ? slot.repeatUntil.getTime() : Infinity;
  const out: Occurrence[] = [];
  // Jours locaux à examiner : de la veille du début de la fenêtre (une diffusion peut passer minuit) jusqu'à la fin.
  const first = zonedParts(new Date(from.getTime() - durMs - DAY), timeZone);
  const lastDay = zonedParts(to, timeZone);
  const endDay = Date.UTC(lastDay.y, lastDay.m - 1, lastDay.d);
  for (let t = Date.UTC(first.y, first.m - 1, first.d); t <= endDay; t += DAY) {
    const day = new Date(t);
    if (slot.repeat === 'WEEKLY' && day.getUTCDay() !== base.weekday) continue;
    const start = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), base.h, base.min, timeZone);
    if (start.getTime() < slot.startsAt.getTime() - MIN || start.getTime() > last) continue;
    const o = make(start);
    if (touches(o)) out.push(o);
  }
  return out;
}

/** La diffusion en cours à cet instant. Si plusieurs créneaux se chevauchent, celui qui a commencé en dernier l'emporte (le plus récent remplace l'ancien). */
export function activeAt(slots: SlotLike[], now: Date, timeZone: string = DEFAULT_TIMEZONE): Occurrence | null {
  let best: Occurrence | null = null;
  for (const s of slots) {
    for (const o of occurrencesBetween(s, now, now, timeZone)) {
      if (o.start.getTime() <= now.getTime() && o.end.getTime() > now.getTime()) {
        if (!best || o.start.getTime() > best.start.getTime()) best = o;
      }
    }
  }
  return best;
}

/** Les prochaines occurrences (la diffusion en cours comprise), de la plus proche à la plus lointaine. */
export function upcoming(slots: SlotLike[], now: Date, days: number, limit: number, timeZone: string = DEFAULT_TIMEZONE): Occurrence[] {
  const to = new Date(now.getTime() + days * DAY);
  return slots.flatMap((s) => occurrencesBetween(s, now, to, timeZone))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);
}

// ── Réglages du relais ────────────────────────────────────────────────────────

export interface LiveConfig {
  enabled: boolean;
  /** Adresse de contrôle du relais (ex. https://relais.exemple.com/controle). */
  controlUrl: string;
  /** Secret partagé avec le relais (jamais renvoyé au navigateur). */
  secret: string;
  /** Adresse publique du flux sur le relais (ex. https://relais.exemple.com/live/ABC123/index.m3u8). */
  playbackUrl: string;
  /** Le relais ne se connecte au flux que lorsqu'un spectateur regarde. */
  onDemand: boolean;
  timezone: string;
  /** Compatibilité navigateur : le relais copie le flux tel quel, convertit le son seulement (AAC) ou l'image et le son (H.264 + AAC). */
  transcode: Transcode;
}

export type Transcode = 'copy' | 'audio' | 'full';
export const TRANSCODES: Transcode[] = ['copy', 'audio', 'full'];

export const DEFAULT_LIVE_CONFIG: LiveConfig = { enabled: false, controlUrl: '', secret: '', playbackUrl: '', onDemand: true, timezone: DEFAULT_TIMEZONE, transcode: 'copy' };

const cleanUrl = (v: unknown, previous: string): string => {
  if (typeof v !== 'string') return previous;
  const s = v.trim();
  if (!s) return '';
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s.replace(/\/+$/, '') : previous;
};

export function normalizeLiveConfig(raw: any, previous: LiveConfig = DEFAULT_LIVE_CONFIG): LiveConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const playback = typeof r.playbackUrl === 'string' ? (/^https?:\/\/[^\s"'<>]+$/i.test(r.playbackUrl.trim()) ? r.playbackUrl.trim() : r.playbackUrl.trim() === '' ? '' : previous.playbackUrl) : previous.playbackUrl;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    controlUrl: cleanUrl(r.controlUrl, previous.controlUrl),
    // Un secret vide dans le formulaire = « ne pas le changer ».
    secret: typeof r.secret === 'string' && r.secret.trim() ? r.secret.trim().slice(0, 200) : previous.secret,
    playbackUrl: playback,
    onDemand: typeof r.onDemand === 'boolean' ? r.onDemand : previous.onDemand,
    timezone: isValidTimezone(r.timezone) ? r.timezone : previous.timezone,
    transcode: TRANSCODES.includes(r.transcode) ? r.transcode : previous.transcode ?? 'copy',
  };
}

/** L'adresse d'un flux (celle de ton Dispatcharr) : protocoles lisibles par ffmpeg, sans espace ni guillemet. */
export function validStreamUrl(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 1000 && /^(https?|rtmp|rtsp|srt|udp):\/\/[^\s"'\\]+$/i.test(v.trim());
}
