// Thèmes d'événements (Halloween, Noël, Saint-Valentin...) : calendrier et choix du thème actif. Logique pure, sans base, pour pouvoir la tester.
// Le service (src/event-themes) l'applique à la configuration enregistrée ; les dessins et les couleurs vivent côté site (frontend/src/lib/eventArt.ts).

export type EventId = 'valentin' | 'paques' | 'saintjean' | 'canada' | 'halloween' | 'noel' | 'nouvelan';

export interface EventSchedule {
  enabled: boolean;
  /** Début et fin (inclus) de l'année civile, « MM-JJ ». La fin peut être avant le début (période à cheval sur le Nouvel An). Ignorés pour Pâques. */
  from: string;
  to: string;
  /** Pâques seulement : jours avant et après le dimanche de Pâques. */
  easterBefore: number;
  easterAfter: number;
}

export interface EventConfig {
  /** Interrupteur général : faux = aucun décor nulle part. */
  enabled: boolean;
  /** Particules animées (chauves-souris, neige, cœurs...) : réglage par défaut ; chaque membre peut les couper chez lui. */
  particles: boolean;
  timezone: string;
  events: Record<EventId, EventSchedule>;
  /** Activation immédiate pour tout le monde, hors calendrier (jusqu'à `until`, ou jusqu'à arrêt manuel si null). */
  force: { id: EventId | null; until: string | null };
  /** Compte à rebours du Jour de l'An : affiché à partir de `daysBefore` jours avant minuit, avec des confettis à minuit. */
  countdown: { enabled: boolean; daysBefore: number };
}

export interface EventInfo { id: EventId; name: string; icon: string; blurb: string; defaults: Omit<EventSchedule, 'enabled'> }

/** Les événements connus. L'ordre est la priorité quand deux périodes se chevauchent (le premier gagne). */
export const EVENTS: EventInfo[] = [
  { id: 'valentin', name: 'Saint-Valentin', icon: '💝', blurb: 'Cœurs, lettres d\'amour', defaults: { from: '02-07', to: '02-15', easterBefore: 0, easterAfter: 0 } },
  { id: 'paques', name: 'Pâques', icon: '🐰', blurb: 'Lapin, poussin, œufs et tulipes', defaults: { from: '03-20', to: '04-20', easterBefore: 7, easterAfter: 1 } },
  { id: 'saintjean', name: 'Saint-Jean-Baptiste', icon: '⚜️', blurb: 'Fleur de lys, feu de joie (24 juin)', defaults: { from: '06-17', to: '06-25', easterBefore: 0, easterAfter: 0 } },
  { id: 'canada', name: 'Fête du Canada', icon: '🍁', blurb: 'Feuilles d\'érable, feux d\'artifice (1er juillet)', defaults: { from: '06-27', to: '07-02', easterBefore: 0, easterAfter: 0 } },
  { id: 'halloween', name: 'Halloween', icon: '🎃', blurb: 'Citrouilles, fantômes, chauves-souris', defaults: { from: '10-15', to: '11-01', easterBefore: 0, easterAfter: 0 } },
  { id: 'noel', name: 'Noël', icon: '🎄', blurb: 'Sapin, bonhomme de neige, flocons', defaults: { from: '12-01', to: '12-27', easterBefore: 0, easterAfter: 0 } },
  { id: 'nouvelan', name: 'Jour de l\'An', icon: '🥂', blurb: 'Champagne, confettis, horloge de minuit', defaults: { from: '12-28', to: '01-03', easterBefore: 0, easterAfter: 0 } },
];
export const EVENT_IDS = EVENTS.map((e) => e.id);
const isEventId = (v: any): v is EventId => EVENT_IDS.includes(v);

const int = (v: any, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const validMmdd = (s: any) => { if (!MMDD.test(String(s))) return false; const [m, d] = String(s).split('-').map(Number); return d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; };

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('fr-CA', { timeZone: tz }); return true; } catch { return false; }
}

export function defaultEventConfig(): EventConfig {
  return {
    enabled: true, particles: true, timezone: 'America/Toronto',
    events: Object.fromEntries(EVENTS.map((e) => [e.id, { enabled: true, ...e.defaults }])) as Record<EventId, EventSchedule>,
    force: { id: null, until: null },
    countdown: { enabled: true, daysBefore: 30 },
  };
}

/** `previous` : valeurs déjà enregistrées, gardées quand une nouvelle valeur est invalide (plutôt que de retomber sur les valeurs d'origine). */
export function normalizeEventConfig(raw: any, previous?: EventConfig): EventConfig {
  const base = defaultEventConfig();
  const r = raw && typeof raw === 'object' ? raw : {};
  const events = { ...base.events };
  for (const e of EVENTS) {
    const s = r.events?.[e.id] ?? {};
    const prev = previous?.events[e.id];
    events[e.id] = {
      enabled: s.enabled === undefined ? prev?.enabled ?? true : s.enabled === true,
      from: validMmdd(s.from) ? s.from : prev?.from ?? e.defaults.from,
      to: validMmdd(s.to) ? s.to : prev?.to ?? e.defaults.to,
      easterBefore: int(s.easterBefore, prev?.easterBefore ?? e.defaults.easterBefore, 0, 30),
      easterAfter: int(s.easterAfter, prev?.easterAfter ?? e.defaults.easterAfter, 0, 30),
    };
  }
  const until = typeof r.force?.until === 'string' && !Number.isNaN(Date.parse(r.force.until)) ? r.force.until : null;
  return {
    enabled: r.enabled === undefined ? true : r.enabled === true,
    particles: r.particles === undefined ? true : r.particles === true,
    timezone: typeof r.timezone === 'string' && isValidTimezone(r.timezone) ? r.timezone : base.timezone,
    events,
    force: { id: isEventId(r.force?.id) ? r.force.id : null, until: isEventId(r.force?.id) ? until : null },
    countdown: {
      enabled: r.countdown?.enabled === undefined ? previous?.countdown.enabled ?? true : r.countdown.enabled === true,
      daysBefore: int(r.countdown?.daysBefore, previous?.countdown.daysBefore ?? 30, 1, 120),
    },
  };
}

// ------------------------------------------------------------------ dates

/** Jour, mois et année « civils » dans un fuseau. */
export function localDate(date: Date, timezone: string): { y: number; m: number; d: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus / Jones / Butcher). */
export function easterDate(year: number): { m: number; d: number } {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

const dayNumber = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86400_000);
const fromDayNumber = (n: number) => { const x = new Date(n * 86400_000); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
const mmddKey = (m: number, d: number) => m * 100 + d;
const parseMmdd = (s: string) => { const [m, d] = s.split('-').map(Number); return { m, d }; };

/** Période d'un événement pour une année : { start, end } en numéros de jour (la fin est incluse). Pour une période à cheval sur le Nouvel An, la fin tombe l'année suivante. */
export function windowFor(id: EventId, year: number, s: EventSchedule): { start: number; end: number } {
  if (id === 'paques') {
    const e = easterDate(year);
    const n = dayNumber(year, e.m, e.d);
    return { start: n - s.easterBefore, end: n + s.easterAfter };
  }
  const f = parseMmdd(s.from), t = parseMmdd(s.to);
  const start = dayNumber(year, f.m, f.d);
  const wraps = mmddKey(t.m, t.d) < mmddKey(f.m, f.d);
  return { start, end: dayNumber(wraps ? year + 1 : year, t.m, t.d) };
}

/** Le jour `today` (y, m, d) est-il dans la période de l'événement ? (cherche aussi la période commencée l'année précédente, pour les périodes à cheval) */
export function inWindow(id: EventId, today: { y: number; m: number; d: number }, s: EventSchedule): boolean {
  const n = dayNumber(today.y, today.m, today.d);
  for (const year of [today.y - 1, today.y]) { const w = windowFor(id, year, s); if (n >= w.start && n <= w.end) return true; }
  return false;
}

export interface ActiveEvent { id: EventId; source: 'forced' | 'schedule'; until: string | null }

/** Thème actif à cet instant : un forçage non expiré d'abord, sinon le premier événement activé dont la période couvre aujourd'hui. */
export function activeEvent(now: Date, cfg: EventConfig): ActiveEvent | null {
  if (!cfg.enabled) return null;
  if (cfg.force.id && (!cfg.force.until || new Date(cfg.force.until).getTime() > now.getTime())) return { id: cfg.force.id, source: 'forced', until: cfg.force.until };
  const today = localDate(now, cfg.timezone);
  for (const e of EVENTS) {
    const s = cfg.events[e.id];
    if (s.enabled && inWindow(e.id, today, s)) return { id: e.id, source: 'schedule', until: null };
  }
  return null;
}

/** Prochaine période (ou celle en cours) d'un événement : sert à l'écran d'administration. */
export function nextWindow(id: EventId, now: Date, cfg: EventConfig): { start: string; end: string; running: boolean } {
  const today = localDate(now, cfg.timezone);
  const n = dayNumber(today.y, today.m, today.d);
  const s = cfg.events[id];
  for (const year of [today.y - 1, today.y, today.y + 1]) {
    const w = windowFor(id, year, s);
    if (w.end >= n) {
      const a = fromDayNumber(w.start), b = fromDayNumber(w.end);
      const iso = (x: { y: number; m: number; d: number }) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
      return { start: iso(a), end: iso(b), running: n >= w.start };
    }
  }
  const w = windowFor(id, today.y + 2, s);
  const a = fromDayNumber(w.start), b = fromDayNumber(w.end);
  const iso = (x: { y: number; m: number; d: number }) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
  return { start: iso(a), end: iso(b), running: false };
}

/** Prochain minuit du Jour de l'An (le 1er janvier 00:00 dans le fuseau choisi) : l'instant exact, pour que tout le monde compte vers le même moment. */
export function nextNewYear(now: Date, timezone: string): { at: Date; year: number } {
  const year = localDate(now, timezone).y + 1;
  let lo = Date.UTC(year, 0, 1) - 15 * 3600_000; // encore l'année précédente, quel que soit le fuseau
  let hi = Date.UTC(year, 0, 1) + 15 * 3600_000; // déjà la nouvelle année
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2 / 1000) * 1000; // toujours une seconde entière : l'instant est exact à la seconde
    if (localDate(new Date(mid), timezone).y >= year) hi = mid; else lo = mid;
  }
  return { at: new Date(hi), year };
}
