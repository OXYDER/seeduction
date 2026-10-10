import { cleanTitle, ContentType, isFilmLike, isSeriesLike } from './category-guess';
import { parseAdultName } from '../metadata/porndb-match';
import { titleKey } from '../metadata/metadata.service';

/**
 * Clé de « mémoire » d'une release : ce qui fait que deux releases se ressemblent assez pour partager la même catégorie (et la même fiche).
 *  - une série : le titre (tous ses épisodes, toutes ses saisons) ;
 *  - un film : le titre ET l'année (deux films du même titre sont différents) ;
 *  - une scène adulte : le SITE (la catégorie se retient ; la fiche, propre à chaque scène, jamais) ;
 *  - un type inconnu : le titre, pour la catégorie seule.
 * `withFiche` : la fiche choisie peut aussi être retenue (même série ou même film), sinon seule la catégorie l'est.
 */
export function memoryKeyOf(name: string, type?: ContentType): { key: string; label: string; withFiche: boolean } | null {
  if (type === 'XXX') {
    const p = parseAdultName(name);
    if (p.kind === 'scene') { const k = titleKey(p.site); return k.length >= 3 ? { key: `S|${k}`, label: p.site, withFiche: false } : null; }
    const k = titleKey(p.title);
    return k.length >= 3 ? { key: `T|xxx|${k}|${p.year ?? ''}`, label: p.title + (p.year ? ` (${p.year})` : ''), withFiche: true } : null;
  }
  const { title, year } = cleanTitle(name);
  const k = titleKey(title);
  if (k.length < 3) return null;
  if (type && isSeriesLike(type)) return { key: `T|serie|${k}`, label: title, withFiche: true };
  if (type && isFilmLike(type)) return { key: `T|film|${k}|${year ?? ''}`, label: title + (year ? ` (${year})` : ''), withFiche: true };
  return { key: `N|${k}`, label: title, withFiche: false };
}
