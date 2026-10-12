// Sauvegarde complète : logique pure (nommage, rétention, planification, phrase de récupération, signature des liens), sans accès au disque ni à la base
// pour pouvoir la tester. Le service (backup.service.ts) s'en sert pour fabriquer, vérifier et ranger les paquets.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export interface BackupConfig {
  enabled: boolean;
  /** Heure de la sauvegarde quotidienne (HH:MM) dans le fuseau ci-dessous. */
  time: string;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  /** Dossier de copie externe (chemin DANS le conteneur : un disque USB, un partage réseau monté dans docker-compose.yml). Vide = aucune. */
  offsiteDir: string;
  /** Destination rclone (« nom:dossier »), pour un nuage ou un serveur SFTP. Vide = aucune. */
  rcloneRemote: string;
  notifyFailure: boolean;
  /** Phrase de récupération : chiffre chaque paquet. Générée automatiquement au premier lancement. */
  passphrase: string;
  passphraseCreatedAt: string | null;
  /** Le propriétaire a confirmé avoir noté la phrase ailleurs que sur le serveur. */
  passphraseConfirmedAt: string | null;
}

export const DEFAULT_BACKUP: BackupConfig = {
  enabled: true, time: '03:30', timezone: 'America/Toronto', keepDaily: 7, keepWeekly: 4, keepMonthly: 6,
  offsiteDir: '', rcloneRemote: '', notifyFailure: true, passphrase: '', passphraseCreatedAt: null, passphraseConfirmedAt: null,
};

const int = (v: any, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('fr-CA', { timeZone: tz }); return true; } catch { return false; }
}

export function normalizeBackupConfig(raw: any): BackupConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_BACKUP;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.time ?? '')) ? String(r.time) : d.time;
  const tz = typeof r.timezone === 'string' && isValidTimezone(r.timezone) ? r.timezone : d.timezone;
  const clean = (s: any, max = 300) => String(s ?? '').trim().slice(0, max);
  return {
    enabled: r.enabled === undefined ? d.enabled : r.enabled === true,
    time, timezone: tz,
    keepDaily: int(r.keepDaily, d.keepDaily, 1, 60), keepWeekly: int(r.keepWeekly, d.keepWeekly, 0, 52), keepMonthly: int(r.keepMonthly, d.keepMonthly, 0, 60),
    offsiteDir: clean(r.offsiteDir), rcloneRemote: clean(r.rcloneRemote),
    notifyFailure: r.notifyFailure === undefined ? d.notifyFailure : r.notifyFailure === true,
    passphrase: clean(r.passphrase, 200),
    passphraseCreatedAt: typeof r.passphraseCreatedAt === 'string' ? r.passphraseCreatedAt : null,
    passphraseConfirmedAt: typeof r.passphraseConfirmedAt === 'string' ? r.passphraseConfirmedAt : null,
  };
}

// ------------------------------------------------------------------ noms de fichiers

export const BUNDLE_PREFIX = 'seeduction-backup-';
export const PREDEPLOY_PREFIX = 'seeduction-predeploy-';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** « seeduction-backup-20261012-033000.tar.enc » (UTC : stable d'une machine à l'autre). */
export function bundleName(date: Date, opts: { encrypted: boolean; predeploy?: boolean } = { encrypted: true }): string {
  const d = date;
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `${opts.predeploy ? PREDEPLOY_PREFIX : BUNDLE_PREFIX}${stamp}.tar${opts.encrypted ? '.enc' : ''}`;
}

/** Date contenue dans le nom d'un paquet (UTC), ou null si le nom n'en est pas un. */
export function parseBundleName(name: string): { date: Date; encrypted: boolean; predeploy: boolean } | null {
  const m = /^(seeduction-backup|seeduction-predeploy)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.tar(\.enc)?$/.exec(name);
  if (!m) return null;
  const date = new Date(Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7]));
  return Number.isNaN(date.getTime()) ? null : { date, encrypted: !!m[8], predeploy: m[1] === 'seeduction-predeploy' };
}

// ------------------------------------------------------------------ rétention

export interface BundleRef { name: string; date: Date }

/** Numéro de semaine ISO (année-semaine), pour garder une sauvegarde par semaine. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400_000 + 1) / 7);
  return `${year}-W${pad(week)}`;
}
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Quels paquets garder : le plus récent de chacun des `keepDaily` derniers jours, de chacune des `keepWeekly` dernières semaines et de chacun des
 * `keepMonthly` derniers mois. Les trois derniers paquets sont toujours gardés, quoi qu'il arrive (jamais d'élagage jusqu'à zéro).
 * Renvoie les noms à GARDER ; tout le reste peut être supprimé.
 */
export function selectKeep(bundles: BundleRef[], cfg: Pick<BackupConfig, 'keepDaily' | 'keepWeekly' | 'keepMonthly'>): Set<string> {
  const sorted = [...bundles].sort((a, b) => b.date.getTime() - a.date.getTime());
  const keep = new Set<string>(sorted.slice(0, 3).map((b) => b.name));
  const pick = (keyOf: (d: Date) => string, limit: number) => {
    const seen = new Set<string>();
    for (const b of sorted) { // du plus récent au plus ancien : le premier de chaque période est le plus récent de cette période
      const k = keyOf(b.date);
      if (seen.has(k)) continue;
      if (seen.size >= limit) break;
      seen.add(k);
      keep.add(b.name);
    }
  };
  pick(dayKey, cfg.keepDaily);
  if (cfg.keepWeekly > 0) pick(isoWeekKey, cfg.keepWeekly);
  if (cfg.keepMonthly > 0) pick(monthKey, cfg.keepMonthly);
  return keep;
}

// ------------------------------------------------------------------ planification

/** Heure et jour locaux d'une date dans un fuseau : { ymd: '2026-10-12', minutes: 210 }. */
export function localParts(date: Date, timezone: string): { ymd: string; minutes: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Est-il temps de lancer la sauvegarde quotidienne ? Oui si l'heure réglée est passée aujourd'hui (fuseau choisi) et qu'aucune sauvegarde
 * n'a réussi depuis cette heure-là. Si le serveur était éteint à l'heure prévue, elle part dès qu'il revient (rattrapage).
 */
export function isDue(now: Date, lastSuccess: Date | null, cfg: Pick<BackupConfig, 'enabled' | 'time' | 'timezone'>): boolean {
  if (!cfg.enabled) return false;
  const [h, m] = cfg.time.split(':').map(Number);
  const nowLocal = localParts(now, cfg.timezone);
  if (nowLocal.minutes < h * 60 + m) return false;
  if (!lastSuccess) return true;
  const last = localParts(lastSuccess, cfg.timezone);
  return last.ymd < nowLocal.ymd || (last.ymd === nowLocal.ymd && last.minutes < h * 60 + m);
}

// ------------------------------------------------------------------ phrase de récupération

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 : lisible à haute voix et recopiable

/** 6 groupes de 5 caractères (≈ 150 bits) : « K7QM2-X9PTR-… ». Se note facilement sur papier. */
export function generatePassphrase(): string {
  const bytes = randomBytes(30);
  const groups: string[] = [];
  for (let g = 0; g < 6; g++) {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[bytes[g * 5 + i] % ALPHABET.length];
    groups.push(s);
  }
  return groups.join('-');
}

// ------------------------------------------------------------------ liens de téléchargement signés

/** Signature d'un lien de téléchargement de courte durée (le navigateur télécharge directement, sans passer par un jeton de connexion). */
export function signDownload(name: string, expires: number, secret: string): string {
  return createHmac('sha256', secret).update(`${name}|${expires}`).digest('hex');
}

export function verifyDownload(name: string, expires: number, sig: string, secret: string, now = Date.now()): boolean {
  if (!Number.isFinite(expires) || expires < now) return false;
  const good = Buffer.from(signDownload(name, expires, secret), 'hex');
  let given: Buffer;
  try { given = Buffer.from(String(sig), 'hex'); } catch { return false; }
  return given.length === good.length && timingSafeEqual(given, good);
}

/** Nom de fichier sûr (jamais de chemin) : seuls les paquets reconnus peuvent être lus ou supprimés. */
export const isSafeBundleName = (name: string) => /^[A-Za-z0-9._-]+$/.test(name) && !!parseBundleName(name);

// ------------------------------------------------------------------ divers

/** Retire les identifiants d'une adresse git (https://utilisateur:jeton@github.com/...) avant de la noter dans un paquet. */
export function maskGitUrl(url: string): string {
  return String(url ?? '').replace(/^(https?:\/\/)[^@/\s]+@/i, '$1');
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 o';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** Décode une URL PostgreSQL (postgresql://user:mdp@hôte:port/base?schema=public) en paramètres pour pg_dump / psql. */
export function parseDatabaseUrl(url: string): { host: string; port: string; user: string; password: string; database: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port || '5432', user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, '')) };
  } catch { return null; }
}
