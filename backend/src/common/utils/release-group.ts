/**
 * Équipe (« team ») d'une release : ce qui suit le dernier tiret du nom, comme dans « Film.2026.1080p.WEB-DL.x264-TOXIC ».
 * Les mentions génériques (NOTAG, NOGRP...) et les simples tags techniques (1080p, x264, AAC...) n'en sont pas.
 */
const GENERIC = new Set(['notag', 'nogrp', 'nogroup', 'unknown', 'scene', 'p2p', 'repack', 'proper', 'internal', 'readnfo']);
const TECH = /^(?:\d{3,4}p|x26[45]|h26[45]|hevc|avc|aac|ac3|eac3|dts|flac|mp3|web|webdl|webrip|bluray|bdrip|hdtv|dvdrip|multi|vff|vfq|vf2|vfi|vostfr|truefrench|french|remux|hdr|hdr10|dv|uhd|sdr|atmos)$/i;

export function detectReleaseGroup(name: string): string | null {
  const base = String(name ?? '').replace(/\[[^\]]*\]\s*$/, '').replace(/\.(mkv|mp4|avi|iso|zip|rar|torrent|nfo)$/i, '').trim();
  const m = /-([A-Za-z0-9][A-Za-z0-9_]{1,19})$/.exec(base);
  if (!m) return null;
  const g = m[1];
  if (/^\d+$/.test(g) || GENERIC.has(g.toLowerCase()) || TECH.test(g)) return null;
  return g;
}

/** Forme normalisée (minuscules, lettres et chiffres) : sert de clé entre les torrents et les teams, sans tenir compte de la casse. */
export function groupSlug(group: string): string {
  return group.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
