import { detectReleaseMeta } from '../../importer/release-meta';
import { containerOf } from './container-format';
import { stripReleaseExtension } from './release-name';

/**
 * Propositions de noms de release standardisés, d'après le nom actuel, la liste des fichiers du torrent et le NFO / MediaInfo.
 * Forme : Titre[.Année][.S01E03].LANGUE.RÉSOLUTION[.HDR].SOURCE[.AUDIO].CODEC-TEAM, comme les autres torrents du site
 * (« No.String.Attached.2011.MULTi.VFF.1080p.WEB.H265-CHiLL », « Alone.UK.S01E03.MULTi.VFF.1080p.WEB.H264-COLL3CTiF »).
 */

export interface NameSuggestion { name: string; label: string }
export interface NameAnalysis {
  /** Vrai quand le nom actuel suit déjà la forme standard (points, résolution, team). */
  wellFormed: boolean;
  suggestions: NameSuggestion[];
  /** Ce qui n'a pas pu être lu et que le membre peut compléter à la main (« langue », « source »...). */
  missing: string[];
}

const GENERIC_GROUPS = new Set(['notag', 'nogrp', 'nogroup', 'unknown', 'scene', 'p2p', 'repack', 'proper', 'internal', 'readnfo']);
const TECH_TAGS = /^(?:\d{3,4}p|x26[45]|h26[45]|hevc|avc|aac|ac3|eac3|dts|flac|mp3|web|webdl|webrip|bluray|bdrip|hdtv|dvdrip|multi|vff|vfq|vf2|vfi|vostfr|truefrench|french|remux|hdr|hdr10|dv|uhd|sdr|atmos)$/i;
const QUALITY_TOKEN = /^(?:(?:19|20)\d{2}|\d{3,4}[pi]|4k|uhd|hdr\d*|dv|bluray|blu-ray|bdrip|brrip|web-?dl|web-?rip|webrip|web|hdtv|dvdrip|cam|multi\d?|multilang|multilangue|dual|vo|vof|vff|vfq|vfb|vfi|vf2|vostfr|vost|truefrench|french|subfrench|muet|x26[45]|h[ .]?26[45]|hevc|avc|av1|xvid|remux|s\d{1,2}(?:e\d{1,3})?|e\d{1,3}|saison|season|int[eé]grale|complete|flac|mp3|aac|ac3|eac3|dts|ddp\d*|atmos|amzn|nf|dsnp|atvp|hmax|proper|repack|internal|extended|unrated|imax)$/i;

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Un mot de nom de release : sans accents, apostrophes ni signes, mots séparés par des points. */
const dotted = (s: string) => strip(s).replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^A-Za-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');

/** La team : ce qui suit le dernier tiret (« …-TARDiS », « … - TARDiS »). */
function groupOf(base: string): { rest: string; group: string | null } {
  const m = /(?:\s+[-–]\s*|-)([A-Za-z0-9][A-Za-z0-9_]{1,19})\s*$/.exec(base);
  if (!m) return { rest: base, group: null };
  const g = m[1];
  if (/^\d+$/.test(g) || GENERIC_GROUPS.has(g.toLowerCase()) || TECH_TAGS.test(g)) return { rest: base, group: null };
  return { rest: base.slice(0, m.index).trim(), group: g };
}

/** Le titre : le nom jusqu'au premier mot de qualité, d'année, de langue ou de saison. */
function titleOf(rest: string): string {
  const parts = rest.split(/[.\s_]+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && QUALITY_TOKEN.test(p)) break;
    out.push(p);
  }
  return dotted(out.join(' '));
}

const VIDEO = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/i;
const base = (p: string) => (p.split(/[\\/]/).pop() ?? p).replace(/\.[a-z0-9]{2,4}$/i, '');

/** S01E03 (un épisode), S01 (une saison complète : plusieurs épisodes d'une même saison), S01-S03 (plusieurs saisons). */
function episodeTag(name: string, files: { path: string }[]): string | null {
  const pad = (n: string) => String(Number(n)).padStart(2, '0');
  const fromName = /\bS(\d{1,2})[ ._-]?E(\d{1,3})\b/i.exec(name);
  const seasonOnly = /\bS(\d{1,2})(?![ ._-]?E\d|\d)\b/i.exec(name) ?? /\b(?:saison|season)[ ._-]?(\d{1,2})\b/i.exec(name);
  const seen = new Map<string, Set<string>>();
  for (const f of files.filter((x) => VIDEO.test(x.path)).slice(0, 2000)) {
    const m = /\bS(\d{1,2})[ ._-]?E(\d{1,3})\b/i.exec(base(f.path));
    if (m) { const s = pad(m[1]); seen.set(s, (seen.get(s) ?? new Set()).add(pad(m[2]))); }
  }
  const seasons = [...seen.keys()].sort();
  const episodes = [...seen.values()].reduce((n, s) => n + s.size, 0);
  if (seasons.length > 1) return `S${seasons[0]}-S${seasons[seasons.length - 1]}`;
  if (seasons.length === 1 && episodes > 1) return `S${seasons[0]}`; // plusieurs épisodes dans le torrent : c'est une saison
  if (fromName) return `S${pad(fromName[1])}E${pad(fromName[2])}`;
  if (seasonOnly) return `S${pad(seasonOnly[1])}`;
  if (seasons.length === 1) { const [s, eps] = [...seen.entries()][0]; return `S${s}E${[...eps][0]}`; }
  return null;
}

const AUDIO_TOKEN: Record<string, string> = { Atmos: 'Atmos', TrueHD: 'TrueHD', DTS: 'DTS', 'E-AC3': 'DDP', AC3: 'DD', FLAC: 'FLAC', Opus: 'OPUS', AAC: 'AAC', MP3: 'MP3' };

/** Le nom suit-il la forme standard : points (pas d'espaces), résolution en « p » minuscule et team après le dernier tiret ? */
export function isWellFormedName(name: string): boolean {
  const n = stripReleaseExtension(name);
  return !/\s/.test(n) && n.split('.').length >= 4 && /\b(?:2160|1080|720|576|480)p\b/.test(n) && /-[A-Za-z0-9][A-Za-z0-9_]{1,19}$/.test(n) && !/[ _]/.test(n);
}

export function suggestReleaseNames(input: { name: string; files?: { path: string; size?: number }[]; nfo?: string; title?: string | null; year?: number | null }): NameAnalysis {
  const files = (input.files ?? []).filter((f) => f && typeof f.path === 'string');
  const current = stripReleaseExtension(String(input.name ?? '')).trim();
  const wellFormed = isWellFormedName(current);
  if (!current) return { wellFormed: false, suggestions: [], missing: [] };

  const { rest, group } = groupOf(current);
  const video = [...files].filter((f) => VIDEO.test(f.path)).sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))[0];
  const nfo = input.nfo ?? '';
  const meta = detectReleaseMeta(current, nfo);
  const fromFile = video ? detectReleaseMeta(base(video.path), '') : {};
  const pick = <K extends keyof typeof meta>(k: K) => (meta[k] ?? (fromFile as typeof meta)[k]) as (typeof meta)[K];

  const resolution = pick('resolution');
  const isVideo = !!resolution || !!video || !!containerOf(files) || /\bS\d{1,2}(?:E\d{1,3})?\b/i.test(current);
  if (!isVideo) return { wellFormed, suggestions: [], missing: [] };

  const year = (() => {
    const m = [...rest.split(/[.\s_()[\]]+/)].slice(1).find((t) => /^(?:19|20)\d{2}$/.test(t) && Number(t) <= new Date().getFullYear() + 1);
    return m ? Number(m) : (meta.year ?? input.year ?? null);
  })();
  const se = episodeTag(current, files);

  // Langue : l'étiquette de la règle du site (MULTi.VFF, VFQ, VOSTFR...) ; à défaut ce que le nom annonce déjà.
  let language = pick('language') ? String(pick('language')).replace(/^MULTI/, 'MULTi') : '';
  const languageExact = !!language;
  if (!language) language = /\bmulti\d?\b/i.test(current) ? 'MULTi' : /\btruefrench\b/i.test(current) ? 'TRUEFRENCH' : /\bfrench\b/i.test(current) ? 'FRENCH' : '';

  const res = resolution === '4K/2160p' ? '2160p' : resolution ?? '';
  const sourceMeta = pick('source');
  const web = sourceMeta === 'WEB-DL';
  const source = !sourceMeta ? '' : web ? 'WEB' : sourceMeta === 'Remux' ? 'REMUX' : sourceMeta;
  const codecMeta = pick('codec');
  const codec = !codecMeta ? '' : codecMeta === 'x265/HEVC' ? (web ? 'H265' : 'x265') : codecMeta === 'x264' ? (web ? 'H264' : 'x264') : codecMeta;
  const hdr = pick('hdr') ? [/dolby[ ._]?vision|\bdv\b/i.test(current) ? 'DV' : '', /hdr/i.test(current) || !/dolby|\bdv\b/i.test(current) ? 'HDR' : ''].filter(Boolean).join('.') : '';
  const audio = pick('audio') ? AUDIO_TOKEN[String(pick('audio'))] ?? '' : '';

  const build = (title: string, withAudio: boolean) => {
    const core = [title, se ? null : year, se, language, res, hdr, source, withAudio ? audio : '', codec].filter((p) => p !== null && p !== '' && p !== undefined).join('.');
    return `${core}${group ? `-${group}` : ''}`;
  };

  const ownTitle = titleOf(rest);
  const out: NameSuggestion[] = [];
  const add = (name: string, label: string) => { if (name && name !== current && !out.some((o) => o.name.toLowerCase() === name.toLowerCase())) out.push({ name, label }); };
  if (ownTitle) {
    add(build(ownTitle, false), 'Nom standard');
    if (audio) add(build(ownTitle, true), "Nom standard avec le codec audio");
  }
  const ficheTitle = input.title ? dotted(input.title) : '';
  if (ficheTitle && ficheTitle.toLowerCase() !== ownTitle.toLowerCase()) add(build(ficheTitle, false), `Avec le titre de la fiche (${input.title})`);

  const missing: string[] = [];
  if (!languageExact) missing.push('langue (VFF, VFQ, MULTi.VFF, VOSTFR...)');
  if (!res) missing.push('résolution');
  if (!source) missing.push('source (WEB, BluRay...)');
  if (!codec) missing.push('codec vidéo');
  if (!group) missing.push('team (après le dernier tiret)');
  return { wellFormed, suggestions: out, missing };
}
