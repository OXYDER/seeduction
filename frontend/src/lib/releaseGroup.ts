// Équipe (team) d'une release, lue dans son nom : ce qui suit le dernier tiret (« …x264-TOXIC » → TOXIC). Même règle que le serveur, qui en fait une team.

const GENERIC_GROUPS = new Set(['notag', 'nogrp', 'nogroup', 'unknown', 'scene', 'p2p', 'repack', 'proper', 'internal', 'readnfo']);
const TECH_TAGS = /^(?:\d{3,4}p|x26[45]|h26[45]|hevc|avc|aac|ac3|eac3|dts|flac|mp3|web|webdl|webrip|bluray|bdrip|hdtv|dvdrip|multi|vff|vfq|vf2|vfi|vostfr|truefrench|french|remux|hdr|hdr10|dv|uhd|sdr|atmos)$/i;

/** Équipe de release : ce qui suit le dernier tiret du nom (« …x264-TOXIC » → TOXIC) — même règle que le serveur, qui en fait une team. */
export function releaseGroup(name: string): string | null {
  const base = name.replace(/\[[^\]]*\]\s*$/, '').replace(/\.(mkv|mp4|avi|iso|zip|rar|torrent|nfo)$/i, '').trim();
  const m = /-([A-Za-z0-9][A-Za-z0-9_]{1,19})$/.exec(base);
  if (!m) return null;
  const g = m[1];
  return /^\d+$/.test(g) || GENERIC_GROUPS.has(g.toLowerCase()) || TECH_TAGS.test(g) ? null : g;
}
export const teamSlug = (g: string) => g.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
