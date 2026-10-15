/**
 * Crédit d'envoi : à l'approbation d'un torrent, une part de sa taille s'ajoute à l'upload de son uploader (même si personne ne l'a encore téléchargé),
 * à condition qu'il le seede vraiment, avec des plafonds par torrent et par jour. Règles pures, sans base de données.
 */
export interface UploadCreditConfig {
  enabled: boolean;
  /** Part de la taille du torrent créditée (en %). */
  percent: number;
  /** Crédit maximal pour un seul torrent (Go). */
  maxPerTorrentGb: number;
  /** Crédit maximal par compte sur 24 heures (Go ; 0 = sans limite). */
  dailyMaxGb: number;
  /** L'uploader doit être en train de seeder le torrent (annonce récente) pour recevoir le crédit. */
  requireSeeding: boolean;
  /** Date d'activation : seuls les torrents approuvés après sont crédités (pas de rattrapage du passé). */
  startedAt: string | null;
}

export const GB = 1_000_000_000;
export const DEFAULT_UPLOAD_CREDIT: UploadCreditConfig = { enabled: true, percent: 25, maxPerTorrentGb: 25, dailyMaxGb: 100, requireSeeding: true, startedAt: null };

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeUploadCredit(raw: any, previous: UploadCreditConfig = DEFAULT_UPLOAD_CREDIT): UploadCreditConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const startedAt = typeof r.startedAt === 'string' && !Number.isNaN(Date.parse(r.startedAt)) ? new Date(r.startedAt).toISOString() : previous.startedAt;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : previous.enabled,
    percent: int(r.percent, 0, 100, previous.percent),
    maxPerTorrentGb: int(r.maxPerTorrentGb, 1, 10_000, previous.maxPerTorrentGb),
    dailyMaxGb: int(r.dailyMaxGb, 0, 1_000_000, previous.dailyMaxGb),
    requireSeeding: typeof r.requireSeeding === 'boolean' ? r.requireSeeding : previous.requireSeeding,
    startedAt,
  };
}

/** Octets crédités pour un torrent : la part de sa taille, plafonnée par torrent. */
export function creditBytes(sizeBytes: bigint | number, cfg: UploadCreditConfig): bigint {
  const size = BigInt(Math.max(0, Math.floor(Number(sizeBytes))));
  const raw = (size * BigInt(cfg.percent)) / 100n;
  const cap = BigInt(cfg.maxPerTorrentGb) * BigInt(GB);
  return raw < cap ? raw : cap;
}

/** Ce qu'il reste à créditer aujourd'hui, compte tenu du plafond journalier (null = sans limite). */
export function roomToday(cfg: UploadCreditConfig, creditedLast24h: bigint): bigint | null {
  if (cfg.dailyMaxGb <= 0) return null;
  const left = BigInt(cfg.dailyMaxGb) * BigInt(GB) - creditedLast24h;
  return left > 0n ? left : 0n;
}
