/**
 * Langue d'une release, selon la règle de Seeduction (tags du nom de la release) :
 *
 *  - une seule piste audio en français : VOF (version officielle), TRUEFRENCH ou VFF (France), VFI (internationale), VFB (belge), VFQ (québécoise) ;
 *  - plusieurs pistes de langues différentes, avec UNE piste française : MULTI + sa précision (MULTI.VOF, MULTI.VFF, MULTI.VFQ...) ;
 *  - VFF et VFQ présents ensemble : MULTI.VF2 ;
 *  - aucune piste française : VOSTFR, seulement avec des sous-titres français complets (sinon la release est refusée) ;
 *  - piste audio muette : MUET (MUET.VOSTFR avec sous-titres).
 *
 * Le champ stocke l'étiquette complète (« MULTI.VFQ »). Un filtre « VFQ » retrouve pourtant VFQ, MULTI.VFQ et MULTI.VF2 :
 * ce sont les « atomes » de l'étiquette (voir languageAtoms).
 */
export const FR_VARIANTS = ['VOF', 'TRUEFRENCH', 'VFF', 'VFI', 'VFB', 'VFQ'] as const;

/** Étiquettes valides à l'envoi, dans l'ordre d'affichage. */
export const LANGUAGE_TAGS: string[] = [
  ...FR_VARIANTS,
  ...FR_VARIANTS.map((v) => `MULTI.${v}`),
  'MULTI.VF2',
  'VOSTFR',
  'MUET',
  'MUET.VOSTFR',
];

/** Anciennes valeurs (avant la règle) : conservées telles quelles sur les torrents existants, plus proposées. */
export const LEGACY_LANGUAGES = ['VF', 'VO', 'MULTI'];

/** Normalise une saisie libre : « multi vfq », « Multi-VFQ » -> « MULTI.VFQ » ; « VF2 » -> « MULTI.VF2 ». */
export function normalizeLanguage(value?: string | null): string | undefined {
  const raw = String(value ?? '').trim().toUpperCase().replace(/[\s+/_-]+/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
  if (!raw) return undefined;
  const parts = raw.split('.');
  if (parts.includes('VF2')) return 'MULTI.VF2';
  if (parts.includes('VFF') && parts.includes('VFQ')) return 'MULTI.VF2';
  return raw;
}

/** Les « atomes » d'une étiquette : ce qu'un filtre peut chercher (MULTI.VF2 contient MULTI, VF2, VFF et VFQ). */
export function languageAtoms(stored: string): string[] {
  const atoms = new Set(String(stored).toUpperCase().split('.').filter(Boolean));
  if (atoms.has('VF2')) { atoms.add('VFF'); atoms.add('VFQ'); atoms.add('MULTI'); }
  return [...atoms];
}

/** Valeurs stockées que retrouve un filtre sur `atom` ; null si l'atome est inconnu (on retombe alors sur l'égalité simple). */
export function storedValuesFor(atom: string): string[] | null {
  const a = String(atom).trim().toUpperCase();
  const all = [...LANGUAGE_TAGS, ...LEGACY_LANGUAGES];
  const hit = all.filter((v) => languageAtoms(v).includes(a));
  return hit.length ? hit : null;
}
