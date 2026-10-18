import { Injectable } from '@nestjs/common';

interface Bucket {
  requests: number;
  errors: number;
  announces: number;
}

const WINDOW_MINUTES = 60;
const MAX_ROUTES = 300;
const KEEP_SAMPLES = 60;

/** Ramène une adresse à sa forme générale (sans paramètres ni identifiants) pour regrouper les mesures d'une même route. */
export function routeKey(url: string): string {
  return url.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/[0-9]+(?=\/|$)/g, '/:n').replace(/\/[0-9a-f]{32,}(?=\/|$)/gi, '/:token').slice(0, 90);
}

interface RouteStat { count: number; totalMs: number; maxMs: number; samples: number[]; slow: number }

/** Compteurs en mémoire, par minute, sur la dernière heure — remis à zéro à chaque redémarrage du backend. */
@Injectable()
export class MetricsService {
  private buckets = new Map<number, Bucket>();
  private routes = new Map<string, RouteStat>();
  private lagMax = new Map<number, number>();
  private lagTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Retard de la boucle d'événements : si le serveur fait un long calcul sans rendre la main, tout le site attend ; on mesure le plus grand retard de chaque minute.
    let last = Date.now();
    this.lagTimer = setInterval(() => {
      const now = Date.now();
      const lag = Math.max(0, now - last - 500);
      last = now;
      const minute = Math.floor(now / 60_000);
      if (lag > (this.lagMax.get(minute) ?? 0)) this.lagMax.set(minute, lag);
      for (const k of this.lagMax.keys()) if (k <= minute - 30) this.lagMax.delete(k);
    }, 500);
    this.lagTimer.unref?.();
  }

  /** Durée d'une requête (ms), regroupée par route. */
  timing(url: string, ms: number) {
    if (url.includes('/admin/monitoring') || url.startsWith('/tracker/') || url.includes('/stream/')) return;
    const key = routeKey(url);
    let r = this.routes.get(key);
    if (!r) { if (this.routes.size >= MAX_ROUTES) return; r = { count: 0, totalMs: 0, maxMs: 0, samples: [], slow: 0 }; this.routes.set(key, r); }
    r.count++; r.totalMs += ms; if (ms > r.maxMs) r.maxMs = ms; if (ms > 1000) r.slow++;
    r.samples.push(ms); if (r.samples.length > KEEP_SAMPLES) r.samples.shift();
  }

  /** Les routes les plus lentes depuis le démarrage (95e centile des dernières mesures). */
  slowest(limit = 12) {
    return [...this.routes.entries()]
      .map(([route, r]) => { const s = [...r.samples].sort((a, b) => a - b); return { route, count: r.count, avgMs: Math.round(r.totalMs / r.count), p95Ms: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0), maxMs: Math.round(r.maxMs), slow: r.slow }; })
      .filter((r) => r.count >= 2)
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, limit);
  }

  /** Plus grand retard de la boucle d'événements, sur la dernière minute et la dernière demi-heure. */
  eventLoop() {
    const minute = Math.floor(Date.now() / 60_000);
    return { lastMinuteMs: Math.round(Math.max(this.lagMax.get(minute) ?? 0, this.lagMax.get(minute - 1) ?? 0)), last30MinMs: Math.round(Math.max(0, ...this.lagMax.values())) };
  }

  record(path: string, status: number) {
    // Le polling du panneau monitoring lui-même ne doit pas fausser les chiffres.
    if (path.includes('/admin/monitoring')) return;

    const minute = Math.floor(Date.now() / 60_000);
    const bucket = this.buckets.get(minute) ?? { requests: 0, errors: 0, announces: 0 };
    bucket.requests++;
    if (status >= 500) bucket.errors++;
    if (path.startsWith('/tracker/') && path.includes('/announce')) bucket.announces++;
    this.buckets.set(minute, bucket);

    for (const key of this.buckets.keys()) {
      if (key <= minute - WINDOW_MINUTES) this.buckets.delete(key);
    }
  }

  /** Une entrée par minute sur la dernière heure (zéros inclus), de la plus ancienne à la plus récente. */
  series() {
    const nowMinute = Math.floor(Date.now() / 60_000);
    const out: { time: string; requests: number; errors: number; announces: number }[] = [];
    for (let m = nowMinute - WINDOW_MINUTES + 1; m <= nowMinute; m++) {
      const b = this.buckets.get(m) ?? { requests: 0, errors: 0, announces: 0 };
      out.push({
        time: new Date(m * 60_000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        ...b,
      });
    }
    return out;
  }
}
