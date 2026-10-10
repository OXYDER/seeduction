/**
 * Détection automatique de la catégorie d'une release à partir de son nom (puis, pour les cas ambigus, de la fiche TMDB).
 * Ne choisit jamais « au hasard » : une release dont le type n'est pas clair n'a pas de type.
 */
export type ContentType =
  | 'FILM' | 'ANIMATION' | 'DOCUMENTAIRE' | 'CONCERT'
  | 'SERIE' | 'ANIMATION_SERIE' | 'DOC_SERIE' | 'EMISSION'
  | 'SPORT' | 'MUSIQUE' | 'LIVRE' | 'XXX';

/** Noms de sous-catégories à essayer, dans l'ordre, pour chaque type (arbre recommandé de Seeduction, puis arbre par défaut). Le premier qui existe gagne. */
export const CATEGORY_CANDIDATES: Record<ContentType, string[]> = {
  FILM: ['Film', 'Films'],
  ANIMATION: ['Animation', 'Animes', 'Film', 'Films'],
  DOCUMENTAIRE: ['Documentaire', 'Film', 'Films'],
  CONCERT: ['Concert', 'Spectacle', 'Film', 'Films'],
  SERIE: ['Série TV', 'Séries TV', 'Séries'],
  ANIMATION_SERIE: ['Animation Série', 'Animes', 'Série TV', 'Séries TV'],
  DOC_SERIE: ['Série Documentaire', 'Documentaire', 'Série TV', 'Séries TV'],
  EMISSION: ['Émission TV', 'Émissions TV', 'Série TV', 'Séries TV'],
  SPORT: ['Sport', 'Sports'],
  MUSIQUE: ['Musique'],
  LIVRE: ['Livres', 'Livre'],
  XXX: ['XXX Films', 'XXX'],
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Premier nom de la liste qui est une sous-catégorie existante (comparaison sans accents ni casse). */
export function resolveCandidate(type: ContentType, leafNames: Map<string, string>): string | null {
  for (const c of CATEGORY_CANDIDATES[type]) { const hit = leafNames.get(norm(c)); if (hit) return hit; }
  return null;
}
export const leafKey = norm;

const TAG = /^(s\d{1,2}(e\d{1,3})?|saison\d*|season\d*|complete|integrale|multi\d?|french|truefrench|vff|vfq|vfi|vfb|vof|vf2?|vq|vostfr|vost|muet|dual|\d{3,4}[pi]|[248]k|uhd|hdr10?|dv|web|webrip|web-dl|webdl|bluray|bdrip|brrip|remux|hdtv|dvdrip|x26[45]|h26[45]|hevc|avc|aac|ac3|eac3|ddp\d*|dts|flac|mp3|ad|repack|proper|extended|unrated|imax|amzn|nf|dsnp|atvp|hmax|pack|xxx)$/i;

/** Titre lisible tiré d'un nom de release (« Last.Seen.S01.MULTi.1080p… » -> « Last Seen ») + année. */
export function cleanTitle(name: string): { title: string; year?: number } {
  const tokens = name.replace(/\.torrent$/i, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[.\s_]+/).filter(Boolean);
  const kept: string[] = [];
  let year: number | undefined;
  for (const t of tokens) {
    const y = t.match(/^((?:19|20)\d{2})$/);
    if (y && kept.length > 0) { year = Number(y[1]); break; }
    if (TAG.test(t.split('-')[0]) && kept.length > 0) break;
    kept.push(t);
  }
  return { title: kept.join(' ').trim(), year };
}

/** Type de contenu déduit du nom seul ; undefined si le nom ne permet pas de trancher. */
export function guessType(name: string): ContentType | undefined {
  // Étiquette « XXX » d'une release adulte (jamais en premier mot : « xXx.Return.of.Xander.Cage » est un film ordinaire).
  if (/[. _-]XXX(?=[. _-]|$)/.test(name)) return 'XXX';
  if (/\b(UFC|WWE|AEW|NBA|NHL|NFL|MLB|MLS|Formula[ .]?1|F1|MotoGP|Premier[ .]League|Ligue[ .]1|UEFA|FIFA|Roland[ .]Garros|Wimbledon)\b/i.test(name)) return 'SPORT';
  if (/\b(FLAC|MP3|\d{3}kbps|discograph(?:y|ie)|V0)\b/i.test(name) && !/\b(1080p|2160p|720p|x26[45]|WEB-?DL|BluRay)\b/i.test(name)) return 'MUSIQUE';
  if (/\b(epub|cbz|cbr|mobi|ebook)\b/i.test(name)) return 'LIVRE';
  if (/\bconcert\b/i.test(name)) return 'CONCERT';
  const doc = /[. _-](DOC|DOCU|DOCUMENTAIRE|DOCUMENTARY)[. _-]/i.test(name); // « Titre.2026.DOC.FRENCH... » : l'étiquette DOC des releases
  if (/\bS\d{1,2}(?:[ ._-]?E\d{1,3})?\b/i.test(name) || /\b(saison|season|int[eé]grale|complete[ ._-]series)[ ._-]?\d*\b/i.test(name)) return doc ? 'DOC_SERIE' : 'SERIE';
  // Un film : une année et une indication de qualité / de source dans le nom.
  if (/\b(19|20)\d{2}\b/.test(name) && /\b(\d{3,4}[pi]|uhd|4k|web[ -]?dl|webrip|bluray|blu-ray|bdrip|dvdrip|hdrip|hdlight|remux|hdtv)\b/i.test(name)) return doc ? 'DOCUMENTAIRE' : 'FILM';
  return undefined;
}

/** Affine un film / une série avec les genres TMDB (identifiants numériques, indépendants de la langue). */
export function refineWithGenres(type: ContentType, genreIds: number[]): ContentType {
  const has = (...ids: number[]) => ids.some((i) => genreIds.includes(i));
  if (type === 'SERIE') {
    if (has(16)) return 'ANIMATION_SERIE';
    if (has(99)) return 'DOC_SERIE';
    if (has(10764, 10767, 10763)) return 'EMISSION'; // téléréalité, talk-show, actualités
    return 'SERIE';
  }
  if (type === 'FILM') {
    if (has(16)) return 'ANIMATION';
    if (has(99)) return 'DOCUMENTAIRE';
    return 'FILM';
  }
  return type;
}

/**
 * Type de contenu d'après le libellé de catégorie d'un flux RSS (« Séries-Télé --> Émissions TV HD », « Séries Animées », « Films --> x265 »...).
 * `base` : le type déduit du nom, qui départage « animé / documentaire seul » entre film et série.
 */
export function typeFromFeedLabel(label: string, base?: ContentType): ContentType | undefined {
  const l = norm(label);
  if (!l) return undefined;
  if (/\b(xxx|adulte|adultes|adult|porn|porno|hentai)\b/.test(l)) return 'XXX';
  const isSeries = /\b(serie|series|tele|saison|episode|tv pack)\b/.test(l) || base === 'SERIE';
  if (/\bsports?\b/.test(l)) return 'SPORT';
  if (/\b(anime|animes|animee|animees|animation|dessin|dessins)\b/.test(l)) return isSeries ? 'ANIMATION_SERIE' : 'ANIMATION';
  if (/\b(documentaire|documentaires|docu|docus)\b/.test(l)) return isSeries ? 'DOC_SERIE' : 'DOCUMENTAIRE';
  if (/\b(emission|emissions|talk|reality|realite|variete|varietes)\b/.test(l)) return 'EMISSION';
  if (/\b(concert|concerts|spectacle|spectacles|humour)\b/.test(l)) return 'CONCERT';
  if (/\b(musique|audio|album|albums|flac|mp3)\b/.test(l)) return 'MUSIQUE';
  if (/\b(livre|livres|ebook|ebooks|bd|comics|manga)\b/.test(l)) return 'LIVRE';
  if (/\b(serie|series|tele|tv pack|saison)\b/.test(l)) return 'SERIE';
  if (/\b(film|films|dvd|bluray|remux|mhd|x264|x265|web dl|web rip|vost|vo)\b/.test(l)) return 'FILM';
  return undefined;
}

/** Libellé de catégorie d'un article RSS : le ou les « [ ... ] » au début du titre, sinon le début de la description. */
export function feedLabelOf(article: { title: string; description?: string }): string {
  const brackets = [...String(article.title).matchAll(/^\s*((?:\[[^\]]+\]\s*)+)/g)][0]?.[1];
  if (brackets) return brackets.replace(/[\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const d = String(article.description ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  return d.slice(0, 160);
}


export const isSeriesLike = (t: ContentType) => t === 'SERIE' || t === 'ANIMATION_SERIE' || t === 'DOC_SERIE' || t === 'EMISSION';
export const isFilmLike = (t: ContentType) => t === 'FILM' || t === 'ANIMATION' || t === 'DOCUMENTAIRE' || t === 'CONCERT';
