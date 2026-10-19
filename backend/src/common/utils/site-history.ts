/**
 * Historique du site : une ligne par heure (requêtes, erreurs, annonces du tracker, pic de membres en ligne, mémoire, retard maximal) conservée 120 jours, et regroupement par jour pour les longues périodes.
 * Logique pure (testée).
 */
import { dayKey } from './ledger';

export interface Sample { hour: Date; requests: number; errors: number; announces: number; onlinePeak: number; rssMB: number; lagMs: number }
export interface Point { label: string; at: string; requests: number; errors: number; announces: number; onlinePeak: number; rssMB: number; lagMs: number }

export const RANGES = { '24h': 24, '7d': 168, '30d': 720 } as const;
export type Range = keyof typeof RANGES;
export const parseRange = (r: unknown): Range => (r === '7d' || r === '30d' ? r : '24h');
export const HOUR_MS = 3_600_000;
export const hourStart = (t: number): Date => new Date(Math.floor(t / HOUR_MS) * HOUR_MS);

const fmtHour = (d: Date) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

/** 24 h et 7 jours : une valeur par heure. 30 jours : une par jour (sommes, pics et maximums). */
export function toPoints(samples: Sample[], range: Range): Point[] {
  const sorted = [...samples].sort((a, b) => a.hour.getTime() - b.hour.getTime());
  if (range !== '30d') {
    return sorted.map((s) => ({ label: fmtHour(s.hour), at: s.hour.toISOString(), requests: s.requests, errors: s.errors, announces: s.announces, onlinePeak: s.onlinePeak, rssMB: s.rssMB, lagMs: s.lagMs }));
  }
  const days = new Map<string, Point & { t: number }>();
  for (const s of sorted) {
    const k = dayKey(s.hour);
    const d = days.get(k) ?? { label: k, at: s.hour.toISOString(), t: s.hour.getTime(), requests: 0, errors: 0, announces: 0, onlinePeak: 0, rssMB: 0, lagMs: 0 };
    d.requests += s.requests; d.errors += s.errors; d.announces += s.announces;
    d.onlinePeak = Math.max(d.onlinePeak, s.onlinePeak); d.rssMB = Math.max(d.rssMB, s.rssMB); d.lagMs = Math.max(d.lagMs, s.lagMs);
    days.set(k, d);
  }
  return [...days.values()].map(({ t, ...p }) => p);
}

/** Les chiffres clés d'une période. */
export function summarize(samples: Sample[]): { requests: number; errors: number; errorRate: number; peakOnline: number; maxLagMs: number; maxRssMB: number } {
  const requests = samples.reduce((s, x) => s + x.requests, 0), errors = samples.reduce((s, x) => s + x.errors, 0);
  return {
    requests, errors, errorRate: requests > 0 ? Math.round((errors / requests) * 10000) / 100 : 0,
    peakOnline: Math.max(0, ...samples.map((x) => x.onlinePeak)), maxLagMs: Math.max(0, ...samples.map((x) => x.lagMs)), maxRssMB: Math.max(0, ...samples.map((x) => x.rssMB)),
  };
}

/** Durée d'un incident, lisible. */
export function incidentSpan(startedAt: Date, resolvedAt: Date | null, now = new Date()): string {
  const ms = Math.max(0, (resolvedAt ?? now).getTime() - startedAt.getTime());
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'moins d\'une minute';
  if (min < 90) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}
