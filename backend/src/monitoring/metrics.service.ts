import { Injectable } from '@nestjs/common';

interface Bucket {
  requests: number;
  errors: number;
  announces: number;
}

const WINDOW_MINUTES = 60;

/** Compteurs en mémoire, par minute, sur la dernière heure — remis à zéro à chaque redémarrage du backend. */
@Injectable()
export class MetricsService {
  private buckets = new Map<number, Bucket>();

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
