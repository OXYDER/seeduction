import { api } from '../api/client';

/** Un filtre propre à une catégorie (format audio, console, genre...). Défini côté serveur (common/utils/facet-schema.ts). */
export interface FacetDef { key: string; label: string; multi: boolean; options: string[] }
export type FacetValues = Record<string, string[]>;

let schema: Promise<Record<string, FacetDef>> | null = null;

/** Libellés de tous les filtres (chargés une seule fois). */
export function loadFacetSchema(): Promise<Record<string, FacetDef>> {
  if (!schema) schema = api.get('/torrents/facet-schema').then((r) => r.data).catch(() => { schema = null; return {}; });
  return schema;
}

/** Couleur d'une pastille selon le filtre : on distingue formats, genres, langues, plateformes... d'un coup d'œil. */
export function facetTone(key: string): string {
  if (/^genre/.test(key)) return 'gen';
  if (/^(format|systeme|console)/.test(key) || key === 'format3d') return 'fmt';
  if (/^langue/.test(key)) return 'lang';
  if (['hdrFormat', 'channels', 'audioQuality', 'qualiteMusique'].includes(key)) return 'src';
  return 'oth';
}

/** Adresse : `f.formatMusique=FLAC|MP3` → { formatMusique: ['FLAC', 'MP3'] }. */
export function facetsFromParams(params: URLSearchParams): FacetValues {
  const out: FacetValues = {};
  params.forEach((v, k) => { if (k.startsWith('f.') && v) out[k.slice(2)] = v.split('|').filter(Boolean); });
  return out;
}
