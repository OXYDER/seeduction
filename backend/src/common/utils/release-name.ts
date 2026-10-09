/**
 * Extensions de fichier qu'on ne veut jamais voir dans le titre d'un torrent (« Serie.S01E01.FRENCH.1080p.WEB-GRP.mkv » -> « …WEB-GRP »).
 * Seulement les conteneurs vidéo et les fichiers annexes : « .iso », « .zip », « .flac »… peuvent être de vraies étiquettes de release, ils sont gardés.
 */
const EXT = 'mkv|mp4|avi|m4v|mov|wmv|mpg|mpeg|m2ts|nfo|torrent';
const TRAILING = new RegExp(`\\.(?:${EXT})$`, 'i');

/** Retire l'extension de fichier à la fin du nom d'une release (une seule fois, et seulement si le reste du nom n'est pas vide). */
export function stripReleaseExtension(name: string): string {
  const trimmed = String(name ?? '').trim();
  const stripped = trimmed.replace(TRAILING, '').trim();
  return stripped.length >= 2 ? stripped : trimmed;
}

/** Même règle en expression régulière PostgreSQL (rattrapage des torrents déjà en base). */
export const RELEASE_EXTENSION_SQL = `\\.(${EXT})$`;
