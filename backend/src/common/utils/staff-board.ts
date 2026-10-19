/**
 * Tableau de bord de l'équipe : ce qui attend un traitement, depuis combien de temps, et les délais de traitement récents. Logique pure (testée).
 */
export type Level = 'ok' | 'warn' | 'late';

/** Médiane et 90e centile d'une liste de durées (en heures), arrondis à 0,1 h ; `null` s'il n'y a rien. */
export function delayStats(hours: number[]): { median: number; p90: number; sample: number } | null {
  const v = hours.filter((h) => Number.isFinite(h) && h >= 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (q: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))];
  const r = (n: number) => Math.round(n * 10) / 10;
  return { median: r(at(0.5)), p90: r(at(0.9)), sample: v.length };
}

/** Niveau d'urgence d'une file : vide = ok ; sinon selon l'ancienneté de ce qui attend depuis le plus longtemps (heures d'attente seuils « à surveiller » puis « en retard »). */
export function levelOf(count: number, oldestHours: number | null, warnHours: number, lateHours: number): Level {
  if (count <= 0 || oldestHours === null) return 'ok';
  if (oldestHours >= lateHours) return 'late';
  if (oldestHours >= warnHours) return 'warn';
  return 'ok';
}

export const hoursSince = (d: Date | null | undefined, now = new Date()): number | null => (d ? Math.max(0, (now.getTime() - d.getTime()) / 3_600_000) : null);

export interface QueueSpec { key: string; label: string; icon: string; link: string; adminOnly?: boolean; warnHours: number; lateHours: number }
/** Les files affichées, dans l'ordre, avec leurs seuils d'attente. */
export const QUEUES: QueueSpec[] = [
  { key: 'torrents', label: 'Torrents à valider', icon: '🎬', link: '/moderation', warnHours: 12, lateHours: 48 },
  { key: 'corrections', label: 'Torrents corrigés à revoir', icon: '🛠️', link: '/moderation', warnHours: 12, lateHours: 48 },
  { key: 'reports', label: 'Signalements ouverts', icon: '🚩', link: '/moderation', warnHours: 6, lateHours: 24 },
  { key: 'support', label: 'Billets de support en attente', icon: '🎫', link: '/admin?tab=Support', warnHours: 8, lateHours: 24 },
  { key: 'cheats', label: 'Dossiers anti-triche ouverts', icon: '🕵️', link: '/admin?tab=Anti-triche', warnHours: 48, lateHours: 168 },
  { key: 'suggestions', label: 'Suggestions à traiter', icon: '💡', link: '/suggestions', warnHours: 168, lateHours: 720 },
  { key: 'review', label: 'Imports « à vérifier »', icon: '📥', link: '/admin?tab=Import', adminOnly: true, warnHours: 24, lateHours: 96 },
  { key: 'donations', label: 'Dons à attribuer', icon: '💝', link: '/admin?tab=Dons', adminOnly: true, warnHours: 12, lateHours: 72 },
];
