/**
 * Suivi des tâches planifiées (règlement des pronostics, podiums, remise de fidélité...). Chaque tâche signale qu'elle s'exécute et, si elle échoue, pourquoi.
 * Les échecs étaient jusqu'ici seulement écrits dans les journaux : ce suivi permet de les voir dans l'administration et d'alerter.
 * Tout est en mémoire (remis à zéro au redémarrage) : c'est un état de santé, pas un historique.
 */
export interface JobState {
  name: string;
  /** Intervalle attendu entre deux exécutions (ms), pour les tâches fréquentes ; absent pour les tâches quotidiennes ou hebdomadaires. */
  everyMs?: number;
  runs: number;
  fails: number;
  lastRunAt: number | null;
  /** La dernière exécution a échoué (elle redevient normale à l'exécution suivante si tout va bien). */
  lastRunFailed: boolean;
  lastFailAt: number | null;
  lastError: string | null;
}

export class JobMonitor {
  private jobs = new Map<string, JobState>();
  private startedAt = Date.now();

  private state(name: string, everyMs?: number): JobState {
    let s = this.jobs.get(name);
    if (!s) { s = { name, everyMs, runs: 0, fails: 0, lastRunAt: null, lastRunFailed: false, lastFailAt: null, lastError: null }; this.jobs.set(name, s); }
    if (everyMs) s.everyMs = everyMs;
    return s;
  }

  /** La tâche démarre une exécution. */
  run(name: string, everyMs?: number): void {
    const s = this.state(name, everyMs);
    s.runs++; s.lastRunAt = Date.now(); s.lastRunFailed = false;
  }

  /** Une exécution a échoué. */
  fail(name: string, error: unknown): void {
    const s = this.state(name);
    s.fails++; s.lastRunFailed = true; s.lastFailAt = Date.now();
    s.lastError = String((error as Error)?.message ?? error).slice(0, 300);
  }

  snapshot(): JobState[] { return [...this.jobs.values()].sort((a, b) => a.name.localeCompare(b.name)); }

  /** Évalue l'état d'une tâche : en échec, bloquée (aucune exécution depuis longtemps) ou normale. */
  statusOf(s: JobState, now = Date.now()): { level: 'ok' | 'warn' | 'error'; detail: string } {
    if (s.lastRunFailed) return { level: 'error', detail: `Dernière exécution en échec : ${s.lastError ?? 'erreur inconnue'}` };
    if (s.everyMs && now - this.startedAt > 5 * s.everyMs) {
      const since = s.lastRunAt === null ? now - this.startedAt : now - s.lastRunAt;
      if (since > 5 * s.everyMs) return { level: 'warn', detail: `Aucune exécution depuis ${Math.round(since / 60_000)} minute(s) (attendue toutes les ${Math.round(s.everyMs / 1000)} s)` };
    }
    return { level: 'ok', detail: s.lastRunAt === null ? 'Pas encore exécutée' : `${s.runs} exécution(s), ${s.fails} échec(s)` };
  }
}

export const jobMonitor = new JobMonitor();
