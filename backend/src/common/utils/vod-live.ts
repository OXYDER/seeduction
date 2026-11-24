/**
 * Application Seeduction : appareils du membre, ce qui joue en direct, commandes à distance et statistiques de visionnage.
 * Fonctions pures (testées dans vod-live.spec.ts) ; l'état en direct lui-même vit dans VodLiveService.
 */

export const DEVICE_KINDS = ['phone', 'tablet', 'tv'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
/** Un appareil qui n'a rien envoyé depuis ce délai est considéré hors ligne (l'application écrit toutes les 3 s en lecture, 12 s sinon). */
export const ONLINE_MS = 30_000;
export const COMMAND_TYPES = ['play', 'pause', 'seek', 'seekBy', 'stop', 'start'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export interface RemoteCommand { id: string; type: CommandType; value?: number; torrentId?: string; fileIndex?: number; title?: string }

const num = (v: unknown, max = 1e9): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : 0; };
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

export function cleanDevice(raw: any): { deviceKey: string; name: string; kind: DeviceKind; appVersion: string | null } | null {
  const deviceKey = str(raw?.deviceKey, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceKey)) return null;
  const kind = (DEVICE_KINDS as readonly string[]).includes(raw?.kind) ? (raw.kind as DeviceKind) : 'phone';
  return { deviceKey, name: str(raw?.name, 60) || (kind === 'tv' ? 'Télévision' : kind === 'tablet' ? 'Tablette' : 'Téléphone'), kind, appVersion: str(raw?.appVersion, 20) || null };
}

export interface LivePlaying { torrentId: string; fileIndex: number; title: string; subtitle: string | null; cover: string | null; position: number; duration: number; paused: boolean }

/** Ce que l'application dit jouer (null : rien en lecture). Tout est borné : l'application est un client externe. */
export function cleanPlaying(raw: any): LivePlaying | null {
  const torrentId = str(raw?.torrentId, 64);
  if (!raw || !torrentId) return null;
  const cover = str(raw.cover, 300);
  return {
    torrentId, fileIndex: num(raw.fileIndex, 5000), title: str(raw.title, 160) || 'Lecture en cours', subtitle: str(raw.subtitle, 120) || null,
    cover: cover && (cover.startsWith('/') || cover.startsWith('https://')) ? cover : null,
    position: num(raw.position, 86_400), duration: num(raw.duration, 86_400), paused: raw.paused === true,
  };
}

/** Commande envoyée depuis le site (null : refusée). */
export function cleanCommand(raw: any, id: string): RemoteCommand | null {
  const type = raw?.type;
  if (!(COMMAND_TYPES as readonly string[]).includes(type)) return null;
  if (type === 'start') {
    const torrentId = str(raw.torrentId, 64);
    return torrentId ? { id, type, torrentId, fileIndex: num(raw.fileIndex, 5000), title: str(raw.title, 160) || undefined } : null;
  }
  if (type === 'seek') return { id, type, value: num(raw.value, 86_400) };
  if (type === 'seekBy') { const v = Number(raw.value); return Number.isFinite(v) ? { id, type, value: Math.max(-3600, Math.min(3600, Math.trunc(v))) } : null; }
  return { id, type };
}

/** Jour (AAAA-MM-JJ) à Montréal : les statistiques suivent la journée du membre, pas celle du serveur. */
export function dayKey(d: Date | number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export const daysAgo = (n: number, from: Date | number = Date.now()): string => dayKey(new Date(new Date(from).getTime() - n * 86_400_000));

export interface WatchRow { torrentId: string; deviceId: string; day: string; seconds: number; title: string; cover: string | null; kind: string; genres: string[] }

/** Chiffres de la page « Statistiques » : temps regardé (total, 7 et 30 jours), 30 derniers jours jour par jour, titres préférés, genres, appareils. */
export function summarizeWatch(rows: WatchRow[], today = dayKey(Date.now()), now: Date | number = Date.now()) {
  const week = daysAgo(6, now), month = daysAgo(29, now);
  let all = 0, w = 0, m = 0;
  const perDay = new Map<string, number>();
  const titles = new Map<string, { title: string; cover: string | null; kind: string; torrentId: string; seconds: number; last: string }>();
  const genres = new Map<string, number>();
  const devices = new Map<string, number>();
  const kinds = { film: 0, serie: 0 };
  for (const r of rows) {
    all += r.seconds;
    if (r.day >= week && r.day <= today) w += r.seconds;
    if (r.day >= month && r.day <= today) { m += r.seconds; perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.seconds); }
    const k = r.kind === 'serie' ? 'serie' : 'film';
    kinds[k] += r.seconds;
    const key = `${k}:${r.title.toLowerCase()}`;
    const t = titles.get(key) ?? { title: r.title, cover: r.cover, kind: k, torrentId: r.torrentId, seconds: 0, last: r.day };
    t.seconds += r.seconds; if (r.day > t.last) { t.last = r.day; t.torrentId = r.torrentId; t.cover = r.cover ?? t.cover; }
    titles.set(key, t);
    for (const g of r.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + r.seconds);
    devices.set(r.deviceId, (devices.get(r.deviceId) ?? 0) + r.seconds);
  }
  const days = Array.from({ length: 30 }, (_, i) => { const d = daysAgo(29 - i, now); return { day: d, seconds: perDay.get(d) ?? 0 }; });
  const top = (e: Iterable<[string, number]>, n: number) => [...e].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    seconds: { all, week: w, month: m },
    titles: titles.size,
    days,
    topTitles: [...titles.values()].filter((t) => t.seconds >= 60).sort((a, b) => b.seconds - a.seconds).slice(0, 8),
    genres: top(genres, 6).map(([genre, seconds]) => ({ genre, seconds })),
    devices: top(devices, 12).map(([deviceId, seconds]) => ({ deviceId, seconds })),
    kinds,
  };
}
