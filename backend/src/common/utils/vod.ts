/**
 * « Seeduction TV » (catalogue vidéo à la demande de l'application Android) : logique pure, testée.
 *
 * Accès réservé : donateurs (don actif), membres fondateurs et uploaders (plus l'équipe). Le spectateur n'a pas de ratio à gérer :
 * ce qu'il télécharge pendant la lecture n'est pas compté (le tracker traite l'annonce marquée `vod=1` comme du freeleech) ; seul
 * l'envoi de ceux qui seedent compte, comme d'habitude. La disponibilité d'un titre ne repose que sur son nombre de seeders.
 */

import { languageAtoms } from './language';

export type VodReason = 'staff' | 'uploader' | 'founder' | 'donor';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

export const VOD_RULE_TEXT = 'Réservé aux donateurs, aux membres fondateurs et aux uploaders.';

export const VOD_REASON_LABELS: Record<VodReason, string> = {
  staff: "Équipe du site",
  uploader: 'Uploader',
  founder: 'Membre fondateur',
  donor: 'Donateur',
};

/** Pourquoi ce compte a accès au catalogue, ou null s'il n'y a pas accès. Se juge sur le COMPTE (pas sur un profil famille). */
export function vodAccess(u: { role?: string | null; founderAt?: Date | null; donorUntil?: Date | null } | null | undefined, now: Date = new Date()): VodReason | null {
  if (!u) return null;
  if (u.role && STAFF.includes(u.role)) return 'staff';
  if (u.role === 'UPLOADER') return 'uploader';
  if (u.founderAt) return 'founder';
  if (u.donorUntil && u.donorUntil.getTime() > now.getTime()) return 'donor';
  return null;
}

export type VodHealth = 'instant' | 'ok' | 'slow' | 'none';

/** Ce qu'on peut attendre du démarrage, d'après le seul nombre de seeders. */
export function vodHealth(seeders: number): VodHealth {
  if (seeders >= 5) return 'instant';
  if (seeders >= 2) return 'ok';
  if (seeders >= 1) return 'slow';
  return 'none';
}

export const VIDEO_FILE = /\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|flv|mpg|mpeg)$/i;
/** En dessous, un fichier vidéo est un « sample » ou une bande-annonce, pas un épisode. */
export const MIN_VIDEO_BYTES = 30 * 1024 * 1024;

/** Saison et épisode lus dans un nom de fichier (« Show.S02E05.mkv », « Show 2x05 »), ou null. */
export function parseEpisode(path: string): { season: number; episode: number } | null {
  const m = /[Ss](\d{1,3})[ ._-]?[Ee](\d{1,4})/.exec(path) ?? /(?:^|[^0-9])(\d{1,2})x(\d{2,3})(?:[^0-9]|$)/.exec(path);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

export const episodeLabel = (season: number | null, episode: number | null) =>
  season != null && episode != null ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : '';

export interface FileEntry { path: string; size: number }

/** Fichiers vidéo lisibles d'un torrent (avec leur index dans le torrent), sans les « samples ». */
export function videoFiles(fileList: unknown): { index: number; path: string; size: number }[] {
  if (!Array.isArray(fileList)) return [];
  const out: { index: number; path: string; size: number }[] = [];
  fileList.forEach((f: any, index) => {
    const path = String(f?.path ?? f?.name ?? '');
    const size = Number(f?.size ?? f?.length ?? 0);
    if (path && VIDEO_FILE.test(path) && size >= MIN_VIDEO_BYTES && !/(^|[\\/._ -])sample([\\/._ -]|$)/i.test(path)) out.push({ index, path, size });
  });
  return out;
}

export interface EpisodeSource {
  torrentId: string;
  fileIndex: number;
  season: number | null;
  episode: number | null;
  size: number;
  seeders: number;
  resolution: string | null;
  language: string | null;
  label: string;
  /** Détails qui distinguent deux releases de même qualité : source, codec, audio, team. */
  tech?: string | null;
}

/** Hauteur d'image d'après le texte de qualité (« 4K/2160p », « 1080p », « 720p », « SD »…) ; 0 si inconnue. */
export function resolutionHeight(res: string | null | undefined): number {
  const t = String(res ?? '').toLowerCase();
  if (!t) return 0;
  if (/2160|4k|uhd/.test(t)) return 2160;
  const m = /(\d{3,4})\s*p/.exec(t) ?? /(?:^|\D)(\d{3,4})(?:\D|$)/.exec(t);
  if (m) return Number(m[1]);
  if (/(^|[^a-z])sd([^a-z]|$)|dvd/.test(t)) return 480;
  return 0;
}

/** Qualité courte et lisible pour l'écran de choix : « 4K », « 1080p »… (le texte d'origine si on ne la reconnaît pas). */
export function qualityLabel(res: string | null | undefined): string {
  const h = resolutionHeight(res);
  if (h >= 2160) return '4K';
  if (h >= 100) return `${h}p`;
  return String(res ?? '').trim() || 'Qualité inconnue';
}

/** Débit supposé d'un seeder, en Mbit/s (prudent : certains font bien plus, d'autres moins). */
export const SEEDER_MBPS = 5;
/** Débit de connexion supposé tant que l'appareil ne l'a pas mesuré, en Mbit/s. */
export const DEFAULT_LINK_MBPS = 40;
/** Un démarrage estimé sous ce délai est « rapide » : c'est le seuil pour recommander la plus belle qualité. */
export const QUICK_START_SECONDS = 20;

/** great : très fluide ; good : fluide ; weak : débit insuffisant pour cette release (attente ou coupures possibles) ; none : personne ne partage. */
export type StreamFit = 'great' | 'good' | 'weak' | 'none';

export interface StreamContext {
  /** Débit de connexion mesuré par l'appareil, en Mbit/s. */
  mbps?: number | null;
  /** Durée du film ou de l'épisode, en minutes (sert à calculer le débit que la vidéo demande). */
  minutes?: number | null;
  /** Langue préférée du membre : « vff », « vfq », « vfi », « vo ». Les releases dans cette langue passent avant. */
  lang?: string | null;
}

export interface StreamEstimate {
  /** Débit que demande la vidéo, en Mbit/s (taille du fichier / durée). */
  bitrateMbps: number;
  /** Débit qu'on peut espérer : les seeders, plafonnés par la connexion. */
  rateMbps: number;
  /** Délai estimé avant que la lecture démarre, en secondes ; null si personne ne partage. */
  startSeconds: number | null;
  /** Débit espéré / débit demandé : sous 1,25 la lecture risque de saccader. */
  ratio: number;
  fit: StreamFit;
}

/** Ce qu'on peut attendre d'une release pour cet appareil : délai de démarrage et fluidité, d'après sa taille, ses seeders et la connexion. */
export function estimateStream(o: { size: number; seeders: number }, ctx: StreamContext = {}): StreamEstimate {
  const minutes = ctx.minutes && ctx.minutes > 0 ? ctx.minutes : 100;
  const bitrate = (Math.max(0, o.size) * 8) / (minutes * 60) / 1e6;
  const link = (ctx.mbps && ctx.mbps > 0 ? ctx.mbps : DEFAULT_LINK_MBPS) * 0.85;
  const rate = o.seeders >= 1 ? Math.min(o.seeders * SEEDER_MBPS, link) : 0;
  const ratio = bitrate > 0 ? rate / bitrate : rate > 0 ? 99 : 0;
  const bufferMbit = Math.max(64, bitrate * 8); // le début du fichier + l'index (une huitaine de Mo) et quelques secondes d'avance
  const startSeconds = rate > 0 ? Math.round(4 + bufferMbit / rate) : null;
  const fit: StreamFit = o.seeders < 1 ? 'none' : ratio >= 2.5 ? 'great' : ratio >= 1.25 ? 'good' : 'weak';
  return { bitrateMbps: Math.round(bitrate * 10) / 10, rateMbps: Math.round(rate * 10) / 10, startSeconds, ratio, fit };
}

/** La langue de la release est-elle celle que le membre préfère ? (« vo » : version originale, avec ou sans sous-titres). */
export function languageMatches(tag: string | null | undefined, pref: string | null | undefined): boolean {
  const p = String(pref ?? '').trim().toUpperCase();
  if (!p || !tag) return false;
  const atoms = languageAtoms(tag);
  if (p === 'VO') return atoms.includes('VO') || atoms.includes('VOSTFR');
  if (p === 'VFF') return atoms.includes('VFF') || atoms.includes('TRUEFRENCH');
  return atoms.includes(p);
}

/**
 * Le classement de plusieurs releases du même contenu pour cet appareil.
 *  - recommandée : parmi les releases qui se lisent sans coupure et démarrent vite (moins de 20 s), la plus belle qualité ; sinon, celle qui démarre le plus vite
 *    parmi celles qui se lisent bien ; sinon celle qui a le plus de chances de tenir. Si le membre a une langue préférée, les releases dans cette langue passent d'abord.
 *  - la plus rapide : celle qui démarre le plus tôt, toutes qualités confondues.
 */
export function rankOptions<T extends { resolution: string | null; seeders: number; size: number; language?: string | null }>(opts: T[], ctx: StreamContext = {}): { rec: T | null; fastest: T | null; est: Map<T, StreamEstimate> } {
  const est = new Map<T, StreamEstimate>(opts.map((o) => [o, estimateStream(o, ctx)]));
  if (opts.length === 0) return { rec: null, fastest: null, est };
  const h = (o: T) => resolutionHeight(o.resolution);
  const start = (o: T) => est.get(o)!.startSeconds ?? Infinity;
  const preferred = ctx.lang ? opts.filter((o) => languageMatches(o.language, ctx.lang)) : [];
  const pool = preferred.length ? preferred : opts;
  const smooth = pool.filter((o) => ['good', 'great'].includes(est.get(o)!.fit));
  const quick = smooth.filter((o) => start(o) <= QUICK_START_SECONDS);
  let rec: T;
  if (quick.length) rec = [...quick].sort((a, b) => h(b) - h(a) || start(a) - start(b) || a.size - b.size)[0];
  else if (smooth.length) rec = [...smooth].sort((a, b) => start(a) - start(b) || h(b) - h(a))[0];
  else rec = [...pool].sort((a, b) => est.get(b)!.ratio - est.get(a)!.ratio || h(b) - h(a) || a.size - b.size)[0];
  const playable = opts.filter((o) => o.seeders >= 1);
  const fastest = playable.length ? [...playable].sort((a, b) => start(a) - start(b) || a.size - b.size)[0] : null;
  return { rec, fastest, est };
}

/** La release recommandée (voir rankOptions) ; null pour une liste vide. */
export function pickRecommended<T extends { resolution: string | null; seeders: number; size: number; language?: string | null }>(opts: T[], ctx: StreamContext = {}): T | null {
  return rankOptions(opts, ctx).rec;
}

/** Toutes les releases de chaque épisode (clé « saison:épisode »), les plus belles qualités d'abord ; ce qui n'a ni saison ni épisode reconnus est ignoré ici. */
export function sourcesByEpisode(sources: EpisodeSource[]): Map<string, EpisodeSource[]> {
  const groups = new Map<string, EpisodeSource[]>();
  for (const s of sources) {
    if (s.season == null || s.episode == null) continue;
    const key = `${s.season}:${s.episode}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const [k, list] of groups) groups.set(k, list.sort((a, b) => resolutionHeight(b.resolution) - resolutionHeight(a.resolution) || b.seeders - a.seeders || a.size - b.size));
  return groups;
}

/**
 * Un seul choix par épisode : parmi toutes les releases qui le contiennent (épisode isolé ou fichier d'un pack de saison), la recommandée (voir pickRecommended).
 * Trié par saison puis épisode ; ce qui n'a ni saison ni épisode reconnus passe à la fin dans l'ordre d'arrivée.
 */
export function bestPerEpisode(sources: EpisodeSource[], ctx: StreamContext = {}): EpisodeSource[] {
  const loose = sources.filter((s) => s.season == null || s.episode == null);
  const best = [...sourcesByEpisode(sources).values()].map((g) => pickRecommended(g, ctx)!);
  best.sort((a, b) => (a.season! - b.season!) || (a.episode! - b.episode!));
  return [...best, ...loose];
}

export interface EpRef { season: number; episode: number }
export interface NextEpisode {
  /** next : le bon épisode suivant existe ; gap : un épisode manque mais un plus tard existe ; missing : l'épisode attendu manque et rien après ; end : fin de la série connue. */
  status: 'next' | 'gap' | 'missing' | 'end';
  next?: EpRef;
  missing: EpRef[];
}

/**
 * L'épisode à lire après `cur`, sans jamais en sauter un en silence. `available` : les épisodes disponibles sur le site ; `seasonSizes` : le nombre d'épisodes par saison
 * d'après la fiche (inconnu : on se fie aux épisodes disponibles).
 */
export function nextEpisode(available: EpRef[], cur: EpRef, seasonSizes: Record<number, number> = {}): NextEpisode {
  const has = (s: number, e: number) => available.some((a) => a.season === s && a.episode === e);
  const size = seasonSizes[cur.season] ?? null;
  const seasonOver = size !== null && cur.episode >= size;
  if (!seasonOver) {
    if (has(cur.season, cur.episode + 1)) return { status: 'next', next: { season: cur.season, episode: cur.episode + 1 }, missing: [] };
    const later = available.filter((a) => a.season === cur.season && a.episode > cur.episode + 1).sort((a, b) => a.episode - b.episode)[0];
    if (later) return { status: 'gap', next: later, missing: Array.from({ length: later.episode - cur.episode - 1 }, (_, i) => ({ season: cur.season, episode: cur.episode + 1 + i })).slice(0, 12) };
    if (size !== null) return { status: 'missing', missing: [{ season: cur.season, episode: cur.episode + 1 }] };
  }
  // fin de saison (ou de ce qu'on connaît) : le premier épisode de la saison suivante
  const nextSeason = Math.min(...available.filter((a) => a.season > cur.season).map((a) => a.season), Infinity);
  if (Number.isFinite(nextSeason)) {
    if (has(nextSeason, 1) && nextSeason === cur.season + 1) return { status: 'next', next: { season: nextSeason, episode: 1 }, missing: [] };
    const first = available.filter((a) => a.season === nextSeason).sort((a, b) => a.episode - b.episode)[0];
    const missing: EpRef[] = [];
    if (nextSeason === cur.season + 1) for (let e = 1; e < first.episode && e <= 12; e++) missing.push({ season: nextSeason, episode: e });
    return { status: 'gap', next: first, missing: missing.length ? missing : [{ season: cur.season + 1, episode: 1 }] };
  }
  return { status: 'end', missing: [] };
}
