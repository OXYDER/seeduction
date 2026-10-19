/**
 * Sous-titres partagés par les membres : lecture d'un fichier envoyé (n'importe quel encodage courant, .srt ou .vtt), normalisation en SRT UTF-8, décalage de synchronisation.
 * Logique pure, sans accès à la base.
 */
export const MAX_SUBTITLE_BYTES = 600 * 1024;
export const MAX_CUES = 6000;

/** Langues proposées (code → nom, code ISO 639-2 pour VLC). */
export const SUBTITLE_LANGS: Record<string, { name: string; iso3: string }> = {
  fr: { name: 'Français', iso3: 'fra' }, 'fr-CA': { name: 'Français (Canada)', iso3: 'fra' }, en: { name: 'Anglais', iso3: 'eng' }, es: { name: 'Espagnol', iso3: 'spa' },
  de: { name: 'Allemand', iso3: 'deu' }, it: { name: 'Italien', iso3: 'ita' }, pt: { name: 'Portugais', iso3: 'por' }, nl: { name: 'Néerlandais', iso3: 'nld' },
  ru: { name: 'Russe', iso3: 'rus' }, ar: { name: 'Arabe', iso3: 'ara' }, ja: { name: 'Japonais', iso3: 'jpn' }, ko: { name: 'Coréen', iso3: 'kor' }, zh: { name: 'Chinois', iso3: 'zho' },
};

export function normalizeLang(input: unknown): string | null {
  const raw = String(input ?? '').trim();
  if (SUBTITLE_LANGS[raw]) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'fr-ca' || lower === 'fr_ca' || lower === 'fr-qc') return 'fr-CA';
  const base = lower.split(/[-_]/)[0];
  return SUBTITLE_LANGS[base] ? base : null;
}

/** Texte d'un fichier envoyé, quel que soit son encodage (UTF-8 avec ou sans BOM, UTF-16, ou Windows-1252 / Latin-1 très courant pour les vieux .srt). */
export function decodeSubtitle(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { const sw = Buffer.from(buf.subarray(2)); sw.swap16(); return new TextDecoder('utf-16le').decode(sw); }
  const start = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(start)); } catch { return new TextDecoder('windows-1252').decode(buf.subarray(start)); }
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const ARROW = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function parseTime(t: string): number {
  const m = TIME.exec(t);
  if (!m) return 0;
  const ms = (s: string) => Number(s.padEnd(3, '0').slice(0, 3));
  return m[1] !== undefined ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + ms(m[4]) : (Number(m[5]) * 60 + Number(m[6])) * 1000 + ms(m[7]);
}

export function formatTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000), m = Math.floor((t % 3_600_000) / 60_000), s = Math.floor((t % 60_000) / 1000), r = t % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export interface Cue { start: number; end: number; text: string }

/** Lit un .srt ou un .vtt : liste des répliques. Les balises de style sont conservées (VLC les comprend), les réglages de position WebVTT sont retirés. */
export function parseSubtitle(text: string): Cue[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = ARROW.exec(lines[i]);
    if (!m) { i++; continue; }
    const start = parseTime(m[1]), end = parseTime(m[2]);
    const body: string[] = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '') { body.push(lines[i]); i++; }
    const textOut = body.join('\n').replace(/<\d{1,2}:\d{2}[.,]\d{1,3}>/g, '').replace(/<\/?c(\.[^>]*)?>/g, '').trim();
    if (textOut && end >= start) cues.push({ start, end, text: textOut });
    if (cues.length > MAX_CUES) throw new Error('Trop de répliques');
  }
  return cues;
}

/** Le fichier en SRT propre (répliques numérotées, temps `HH:MM:SS,mmm`), avec un décalage éventuel en millisecondes (positif = plus tard). */
export function toSrt(cues: Cue[], offsetMs = 0): string {
  return cues.map((c, k) => `${k + 1}\n${formatTime(c.start + offsetMs)} --> ${formatTime(c.end + offsetMs)}\n${c.text}\n`).join('\n');
}

/** Vérifie et normalise un fichier de sous-titres envoyé : renvoie le SRT UTF-8 et le nombre de répliques, ou une raison de refus. */
export function prepareSubtitle(buf: Buffer): { ok: true; srt: string; cues: number } | { ok: false; reason: string } {
  if (buf.length === 0) return { ok: false, reason: 'Fichier vide' };
  if (buf.length > MAX_SUBTITLE_BYTES) return { ok: false, reason: 'Fichier trop gros (600 Ko au plus)' };
  if (buf.includes(0) && !(buf[0] === 0xff || buf[0] === 0xfe)) return { ok: false, reason: 'Ce fichier ne ressemble pas à des sous-titres texte (.srt ou .vtt)' };
  let cues: Cue[];
  try { cues = parseSubtitle(decodeSubtitle(buf)); } catch { return { ok: false, reason: 'Trop de répliques : fichier refusé' }; }
  if (cues.length < 5) return { ok: false, reason: 'Aucune réplique reconnue : le fichier doit être un .srt ou un .vtt' };
  return { ok: true, srt: toSrt(cues), cues: cues.length };
}

/** Décalage de synchronisation permis : ±10 minutes. */
export const clampOffset = (n: unknown): number => Math.max(-600_000, Math.min(600_000, Math.round(Number(n) || 0)));
