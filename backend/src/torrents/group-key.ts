/**
 * Regroupement des releases d'un même contenu (vue « Groupé ») : la même fiche (TMDB, Deezer...) si elle est connue, sinon le titre nettoyé de la release
 * dans la même catégorie. Même règle que celle du navigateur (components/TorrentGroups.tsx), pour que les groupes soient identiques des deux côtés.
 */
const QUALITY_TOKEN = /^(?:(?:19|20)\d{2}|\d{3,4}p|4k|uhd|hdr\d*|dv|bluray|blu-ray|bdrip|brrip|web-?dl|web-?rip|webrip|hdtv|dvdrip|cam|multi|vff|vfq|vf2|vfi|vostfr|truefrench|french|subfrench|x26[45]|h26[45]|hevc|avc|remux|s\d{1,2}(?:e\d{1,3})?|e\d{1,3}|cd-?rip|flac|mp3|v\d+(?:\.\d+)+)$/i;

/** Titre « propre » d'une release : le nom jusqu'au premier tag de qualité / d'année (« The.Family.Plan.2.2025.1080p… » -> « The Family Plan 2 »). */
export function releaseTitle(name: string): string {
  const parts = name.replace(/\.(mkv|mp4|avi|iso|zip|rar)$/i, '').split(/[.\s_]+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && QUALITY_TOKEN.test(p)) break;
    out.push(p);
  }
  const title = out.join(' ').trim();
  return title.length >= 2 ? title : name;
}

export function groupKeyOf(t: { name: string; metaSource?: string | null; metaExternalId?: string | null; category?: { slug?: string | null } | null }): string {
  if (t.metaSource && t.metaExternalId) return `m:${t.metaSource}:${t.metaExternalId}`;
  return `t:${releaseTitle(t.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}|${t.category?.slug ?? ''}`;
}
