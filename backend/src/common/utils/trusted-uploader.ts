/**
 * Rang « Uploadeur » automatique : un membre dont les torrents sont presque toujours approuvés sans demande de correction obtient le rang ; ses torrents ne passent alors plus par la modération.
 * Pour le garder, il doit continuer à envoyer régulièrement, sans faute (correction demandée, refus) ni trop de signalements. Logique pure (testée) ; la lecture de la base est dans TrustedUploadersService.
 */
export interface TrustedConfig {
  /** Active la promotion et la rétrogradation automatiques. */
  enabled: boolean;
  /** Ancienneté minimale du compte (jours). */
  minAccountDays: number;
  /** Torrents approuvés au total. */
  minApproved: number;
  /** Fenêtre d'observation (jours) pour la promotion. */
  windowDays: number;
  /** Torrents approuvés du premier coup (sans correction demandée) dans la fenêtre. */
  minClean: number;
  /** Part des torrents examinés dans la fenêtre qui ont été approuvés du premier coup (0 à 1). */
  minCleanRate: number;
  /** Pour garder le rang : au moins un envoi dans les N derniers jours. */
  keepActiveDays: number;
  /** Fenêtre (jours) pour compter les fautes et les signalements quand on garde le rang. */
  keepWindowDays: number;
  /** Fautes (correction demandée ou refus) tolérées dans cette fenêtre : au-delà, le rang est retiré. */
  maxFaults: number;
  /** Signalements non classés sans suite tolérés dans cette fenêtre : au-delà, le rang est retiré. */
  maxReports: number;
}

export const DEFAULT_TRUSTED_CONFIG: TrustedConfig = {
  enabled: true, minAccountDays: 30, minApproved: 15, windowDays: 90, minClean: 10, minCleanRate: 0.9,
  keepActiveDays: 60, keepWindowDays: 60, maxFaults: 2, maxReports: 3,
};

/** Réglages enregistrés, ramenés à des valeurs raisonnables (jamais de valeur absurde, même si la base a été modifiée à la main). */
export function normalizeTrustedConfig(raw: any): TrustedConfig {
  const d = DEFAULT_TRUSTED_CONFIG;
  const num = (v: unknown, def: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  return {
    enabled: raw?.enabled === undefined ? d.enabled : raw.enabled === true,
    minAccountDays: Math.round(num(raw?.minAccountDays, d.minAccountDays, 0, 3650)),
    minApproved: Math.round(num(raw?.minApproved, d.minApproved, 1, 10000)),
    windowDays: Math.round(num(raw?.windowDays, d.windowDays, 7, 730)),
    minClean: Math.round(num(raw?.minClean, d.minClean, 1, 10000)),
    minCleanRate: num(raw?.minCleanRate, d.minCleanRate, 0.5, 1),
    keepActiveDays: Math.round(num(raw?.keepActiveDays, d.keepActiveDays, 7, 730)),
    keepWindowDays: Math.round(num(raw?.keepWindowDays, d.keepWindowDays, 7, 730)),
    maxFaults: Math.round(num(raw?.maxFaults, d.maxFaults, 0, 100)),
    maxReports: Math.round(num(raw?.maxReports, d.maxReports, 0, 100)),
  };
}

export interface UploaderStats {
  accountDays: number;
  approvedTotal: number;
  /** Fenêtre de promotion. */
  window: { approvedClean: number; reviewed: number };
  /** Fenêtre « garder le rang ». */
  keep: { faults: number; reports: number };
  /** Jours depuis le dernier envoi (null : aucun envoi). */
  daysSinceLastUpload: number | null;
  /** Avertissement ou bannissement récent. */
  recentSanction: boolean;
}

export type Verdict = { action: 'promote' | 'demote' | 'none'; reasons: string[] };

/** Un membre ordinaire remplit-il les conditions pour devenir Uploadeur ? */
export function shouldPromote(s: UploaderStats, c: TrustedConfig): Verdict {
  if (!c.enabled) return { action: 'none', reasons: [] };
  const missing: string[] = [];
  if (s.accountDays < c.minAccountDays) missing.push(`compte de moins de ${c.minAccountDays} jours`);
  if (s.approvedTotal < c.minApproved) missing.push(`moins de ${c.minApproved} torrents approuvés`);
  if (s.window.approvedClean < c.minClean) missing.push(`moins de ${c.minClean} torrents approuvés du premier coup en ${c.windowDays} jours`);
  const rate = s.window.reviewed > 0 ? s.window.approvedClean / s.window.reviewed : 0;
  if (rate < c.minCleanRate) missing.push(`seulement ${Math.round(rate * 100)} % approuvés du premier coup`);
  if (s.keep.reports > 0) missing.push('signalement(s) sur ses torrents');
  if (s.keep.faults > 0) missing.push('correction ou refus récent');
  if (s.recentSanction) missing.push('sanction récente');
  return missing.length === 0 ? { action: 'promote', reasons: [`${s.window.approvedClean} torrents approuvés du premier coup sur ${s.window.reviewed} examinés`] } : { action: 'none', reasons: missing };
}

/** Un Uploadeur promu automatiquement garde-t-il son rang ? */
export function shouldDemote(s: UploaderStats, c: TrustedConfig): Verdict {
  if (!c.enabled) return { action: 'none', reasons: [] };
  const why: string[] = [];
  if (s.daysSinceLastUpload === null || s.daysSinceLastUpload > c.keepActiveDays) why.push(`aucun envoi depuis plus de ${c.keepActiveDays} jours`);
  if (s.keep.faults > c.maxFaults) why.push(`${s.keep.faults} fautes (correction demandée ou refus) en ${c.keepWindowDays} jours`);
  if (s.keep.reports > c.maxReports) why.push(`${s.keep.reports} signalements en ${c.keepWindowDays} jours`);
  if (s.recentSanction) why.push('sanction récente');
  return why.length ? { action: 'demote', reasons: why } : { action: 'none', reasons: [] };
}
