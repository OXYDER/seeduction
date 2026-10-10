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

// ------------------------------------------------------------------ choix appris des membres (au poids)
//
// Une release d'un membre ACCEPTÉE par la modération ajoute 1 au poids du choix (catégorie + fiche) fait pour ce genre de release. Plus le poids est
// élevé, plus on s'y fie :
//  - dès 1 acceptation : le choix est simplement SUGGÉRÉ (un clic pour l'utiliser) ;
//  - dès 3 acceptations de 2 membres différents (ou 6 d'un seul) : les releases qui ressemblent sont rangées TOUTES SEULES ;
//  - si des membres ne s'accordent pas, le choix n'est retenu que s'il pèse au moins deux fois plus que tous les autres ensemble.
export const LEARN_SUGGEST_WEIGHT = 1;
export const LEARN_AUTO_WEIGHT = 3;
export const LEARN_AUTO_MEMBERS = 2;
export const LEARN_STRONG_WEIGHT = 6;

export interface LearnedChoice { confirmations: number; members: string[] }

export function pickLearned<T extends LearnedChoice>(rows: T[]): { row: T; level: 'auto' | 'suggest'; weight: number } | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.confirmations - a.confirmations);
  const top = sorted[0];
  if (top.confirmations < LEARN_SUGGEST_WEIGHT) return null;
  const others = sorted.slice(1).reduce((sum, r) => sum + r.confirmations, 0);
  if (top.confirmations < 2 * others) return null; // désaccord : on ne propose rien plutôt qu'un choix contesté
  const auto = (top.confirmations >= LEARN_AUTO_WEIGHT && top.members.length >= LEARN_AUTO_MEMBERS) || top.confirmations >= LEARN_STRONG_WEIGHT;
  return { row: top, level: auto ? 'auto' : 'suggest', weight: top.confirmations };
}

/** Un même choix (catégorie + fiche) donne toujours la même empreinte, pour que ses acceptations s'additionnent. */
export const choiceHashOf = (c: { categoryId: string; metaKind?: string | null; metaId?: string | null; noMeta?: boolean }) =>
  [c.categoryId, c.metaId ? c.metaKind ?? '' : '', c.metaId ?? '', c.noMeta && !c.metaId ? '1' : '0'].join('|');
