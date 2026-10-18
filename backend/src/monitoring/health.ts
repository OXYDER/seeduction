/**
 * Santé du site : évaluation des contrôles et décision des alertes (logique pure, sans base de données ni réseau).
 */
import { JobMonitor, JobState } from '../common/utils/job-monitor';

export type Level = 'ok' | 'warn' | 'error';
export interface Check { id: string; label: string; level: Level; detail: string }

export interface HealthInput {
  db: { ok: boolean; latencyMs: number | null };
  secretWeakness: string | null;
  configWeaknesses?: string[];
  jobs: JobState[];
  jobMonitor: JobMonitor;
  nhl: { lastOkAt: number | null; lastErrorAt: number | null; lastError: string | null };
  rssMB: number;
  errors5xxLast10min: number;
  smtpConfigured: boolean;
  now?: number;
}

/** Libellés lisibles des tâches suivies. */
export const JOB_LABEL: Record<string, string> = {
  'picks.tick': 'Pronostics LNH : synchronisation et règlement', 'picks.weekly': 'Pronostics LNH : prix de la semaine', 'moj.tick': 'Mise-O-jeu : règlement des matchs',
  'hilo.sweep': 'Plus haut ou plus bas : parties abandonnées', 'blackjack.sweep': 'Blackjack : parties abandonnées', 'quiz.podium': 'Quiz : podium de la veille',
  'games.cashback': 'Remise de fidélité des jeux', 'economy.watch': 'Économie des points : surveillance',
};

const worse = (a: Level, b: Level): Level => (a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');
const ago = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : ms < 5_400_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`);

/** Tous les contrôles de santé à partir de l'état observé. */
export function evaluate(i: HealthInput): Check[] {
  const now = i.now ?? Date.now();
  const out: Check[] = [];
  out.push(i.db.ok
    ? { id: 'database', label: 'Base de données', level: (i.db.latencyMs ?? 0) > 1500 ? 'warn' : 'ok', detail: `Répond en ${i.db.latencyMs} ms` }
    : { id: 'database', label: 'Base de données', level: 'error', detail: 'Injoignable' });
  out.push(i.secretWeakness
    ? { id: 'secret', label: 'Sécurité : secret des sessions', level: 'error', detail: `${i.secretWeakness}. Définis un JWT_SECRET long et aléatoire dans backend/.env (les sessions seront réinitialisées et les mots de passe de seedbox et le jeton Telegram sont à ressaisir).` }
    : { id: 'secret', label: 'Sécurité : secret des sessions', level: 'ok', detail: 'Secret personnalisé et assez long' });
  const weak = i.configWeaknesses ?? [];
  out.push(weak.length > 0
    ? { id: 'config', label: 'Sécurité : configuration', level: 'warn', detail: weak.join(' ; ') + '.' }
    : { id: 'config', label: 'Sécurité : configuration', level: 'ok', detail: "Mot de passe de la base personnalisé, accès à l'API limité à ton site" });
  for (const j of i.jobs) {
    const st = i.jobMonitor.statusOf(j, now);
    out.push({ id: `job:${j.name}`, label: `Tâche : ${JOB_LABEL[j.name] ?? j.name}`, level: st.level, detail: st.detail });
  }
  const nhlBad = i.nhl.lastErrorAt !== null && (i.nhl.lastOkAt === null || i.nhl.lastErrorAt > i.nhl.lastOkAt) && now - i.nhl.lastErrorAt < 30 * 60_000;
  out.push(nhlBad
    ? { id: 'nhl', label: 'API de la LNH (pronostics)', level: 'warn', detail: `Ne répond pas depuis ${i.nhl.lastOkAt ? ago(now - i.nhl.lastOkAt) : 'le démarrage'} : ${i.nhl.lastError ?? 'erreur inconnue'}. Les matchs peuvent être réglés à la main dans Admin > Jeux.` }
    : { id: 'nhl', label: 'API de la LNH (pronostics)', level: 'ok', detail: i.nhl.lastOkAt ? `Dernière réponse il y a ${ago(now - i.nhl.lastOkAt)}` : 'Pas encore sollicitée' });
  out.push({ id: 'memory', label: 'Mémoire du serveur', level: i.rssMB > 1500 ? 'warn' : 'ok', detail: `${i.rssMB} Mo utilisés${i.rssMB > 1500 ? ' (élevé)' : ''}` });
  out.push({ id: 'errors', label: 'Erreurs serveur (10 dernières minutes)', level: i.errors5xxLast10min >= 20 ? 'error' : i.errors5xxLast10min >= 5 ? 'warn' : 'ok', detail: `${i.errors5xxLast10min} erreur(s) 5xx` });
  out.push({ id: 'smtp', label: 'Envoi de courriels', level: i.smtpConfigured ? 'ok' : 'warn', detail: i.smtpConfigured ? 'Serveur SMTP configuré' : 'SMTP_HOST n\'est pas défini : les courriels de confirmation d\'inscription ne partent pas' });
  return out;
}

export const overall = (checks: Check[]): Level => checks.reduce<Level>((l, c) => worse(l, c.level), 'ok');

export interface AlertState { at: number; level: Level }

/**
 * Décide des alertes : un problème nouveau est signalé une fois, rappelé après `repeatMs` s'il dure, et un message de rétablissement part quand il disparaît.
 * Les avertissements ne sont signalés qu'au-delà de `warnAfterRuns` contrôles consécutifs (pour ne pas alerter sur un raté d'une seconde).
 */
export function planAlerts(checks: Check[], alerted: Map<string, AlertState>, now: number, repeatMs = 12 * 3_600_000): { raise: Check[]; resolve: { id: string; label: string }[]; next: Map<string, AlertState> } {
  const next = new Map(alerted);
  const raise: Check[] = [];
  const resolve: { id: string; label: string }[] = [];
  const byId = new Map(checks.map((c) => [c.id, c]));
  for (const c of checks) {
    if (c.level === 'ok') continue;
    const prev = next.get(c.id);
    if (!prev || now - prev.at >= repeatMs || (prev.level === 'warn' && c.level === 'error')) { raise.push(c); next.set(c.id, { at: now, level: c.level }); }
  }
  for (const id of [...next.keys()]) {
    const c = byId.get(id);
    if (!c || c.level === 'ok') { resolve.push({ id, label: c?.label ?? id }); next.delete(id); }
  }
  return { raise, resolve, next };
}
