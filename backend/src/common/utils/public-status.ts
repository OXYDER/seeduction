/**
 * Page d'état publique (« le site fonctionne ») : ce qu'un visiteur peut voir sans connexion, sans rien d'interne. Les contrôles de santé du site sont ramenés à quelques services
 * aux noms simples, et l'historique à une grille de jours (bon, dégradé, panne). Logique pure (testée) ; la lecture de la base est dans PublicStatusService.
 */
export type ServiceState = 'ok' | 'degraded' | 'outage';
export type DayState = 'ok' | 'degraded' | 'down' | 'nodata';

export const COMPONENTS: { id: string; label: string }[] = [
  { id: 'site', label: 'Site web et API' },
  { id: 'tracker', label: 'Tracker BitTorrent' },
  { id: 'database', label: 'Base de données' },
  { id: 'sports', label: 'Pronostics et données sportives' },
  { id: 'mail', label: 'Courriels' },
];

/** Contrôles de santé que la page publique reprend (les autres — sécurité, mémoire, configuration — restent réservés à l'équipe), et ce qu'ils deviennent côté public. */
export const PUBLIC_CHECKS: Record<string, { component: string; label: string; counts: boolean }> = {
  database: { component: 'database', label: 'Base de données', counts: true },
  errors: { component: 'site', label: 'Erreurs du serveur', counts: true },
  nhl: { component: 'sports', label: 'Données sportives (LNH)', counts: false },
  smtp: { component: 'mail', label: 'Envoi de courriels', counts: false },
};

export interface StatusIncident { checkId: string; level: string; startedAt: Date; resolvedAt: Date | null }

const rank: Record<ServiceState, number> = { ok: 0, degraded: 1, outage: 2 };
const worst = (a: ServiceState, b: ServiceState): ServiceState => (rank[a] >= rank[b] ? a : b);

/** État de chaque service d'après les incidents ouverts. Le tracker suit le site et la base : sans eux, il ne répond pas non plus. */
export function componentStates(open: StatusIncident[]): Record<string, ServiceState> {
  const out: Record<string, ServiceState> = Object.fromEntries(COMPONENTS.map((c) => [c.id, 'ok' as ServiceState]));
  for (const i of open) {
    const meta = PUBLIC_CHECKS[i.checkId];
    if (!meta || i.resolvedAt) continue;
    out[meta.component] = worst(out[meta.component], i.level === 'error' ? 'outage' : 'degraded');
  }
  out.tracker = worst(out.tracker, worst(out.site, out.database));
  return out;
}

export const overallState = (states: Record<string, ServiceState>): ServiceState => Object.values(states).reduce(worst, 'ok' as ServiceState);

const DAY_MS = 86_400_000;
export const dayKeyUtc = (t: number | Date) => new Date(t).toISOString().slice(0, 10);

/** Liste des `n` derniers jours (UTC), du plus ancien au plus récent, aujourd'hui compris. */
export function lastDays(n: number, now = Date.now()): string[] {
  return Array.from({ length: n }, (_, i) => dayKeyUtc(now - (n - 1 - i) * DAY_MS));
}

/** Minutes d'un incident qui tombent dans un jour (UTC). */
function overlapMinutes(i: StatusIncident, day: string, now: number): number {
  const start = Date.parse(day + 'T00:00:00Z'), end = start + DAY_MS;
  const a = Math.max(start, i.startedAt.getTime()), b = Math.min(end, (i.resolvedAt ?? new Date(now)).getTime(), now);
  return Math.max(0, Math.round((b - a) / 60_000));
}

export interface DayInput {
  days: string[];
  incidents: StatusIncident[];
  /** Nombre d'heures enregistrées par le site pour chaque jour (le site inscrit une ligne par heure où il tourne). */
  hoursSeen: Map<string, number>;
  /** Requêtes et erreurs par jour. */
  traffic: Map<string, { requests: number; errors: number }>;
  /** Premier jour où le site a tourné : avant, « pas de données ». */
  firstDay: string | null;
  now?: number;
}

export interface DayResult { date: string; status: DayState; downMinutes: number }

export function dayStatuses(input: DayInput): DayResult[] {
  const now = input.now ?? Date.now();
  const today = dayKeyUtc(now);
  return input.days.map((date) => {
    if (!input.firstDay || date < input.firstDay) return { date, status: 'nodata' as const, downMinutes: 0 };
    let down = 0, warn = 0;
    for (const i of input.incidents) {
      const meta = PUBLIC_CHECKS[i.checkId];
      if (!meta?.counts) continue;
      const m = overlapMinutes(i, date, now);
      if (i.level === 'error') down += m; else warn += m;
    }
    // Une heure sans aucune ligne = le site ne tournait pas du tout (le premier jour, on ne sait pas depuis quand : ignoré).
    if (date > input.firstDay) {
      const expected = date === today ? new Date(now).getUTCHours() : 24;
      down += Math.max(0, expected - (input.hoursSeen.get(date) ?? 0)) * 60;
    }
    down = Math.min(1440, down);
    const t = input.traffic.get(date);
    const noisy = !!t && t.requests >= 200 && t.errors / t.requests >= 0.02;
    const status: DayState = down >= 15 ? 'down' : down > 0 || warn >= 30 || noisy ? 'degraded' : 'ok';
    return { date, status, downMinutes: down };
  });
}

/** Disponibilité sur les jours qui ont des données (une pastille « panne » d'un quart d'heure ne fait pas perdre un jour entier). */
export function uptimePercent(days: DayResult[]): number | null {
  const withData = days.filter((d) => d.status !== 'nodata');
  if (withData.length === 0) return null;
  const total = withData.length * 1440;
  const down = withData.reduce((n, d) => n + d.downMinutes, 0);
  return Math.round((1 - down / total) * 10000) / 100;
}
