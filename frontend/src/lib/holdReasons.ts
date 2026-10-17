/** Motifs de suspension d'un torrent en attente (même liste que backend/src/common/utils/torrent-hold.ts). */
export const HOLD_REASONS: Record<string, string> = {
  noseed: 'Pas de seed : ton client doit seeder ce torrent pour qu\'on puisse le valider',
  description: 'Erreur dans la description',
  nfo: 'NFO manquant ou ce n\'est pas le bon NFO',
  fiche: 'Mauvaise fiche sélectionnée',
  category: 'Mauvaise catégorie',
  name: 'Nom de la release à corriger',
  language: 'Langue ou qualité incorrecte',
  other: 'Autre (voir le message de l\'équipe)',
};

/** Libellés courts pour la modération. */
export const HOLD_SHORT: Record<string, string> = {
  noseed: 'Pas de seed', description: 'Description', nfo: 'NFO', fiche: 'Mauvaise fiche', category: 'Catégorie', name: 'Nom', language: 'Langue / qualité', other: 'Autre',
};

export interface HoldInfo { at: string; reasons: string[]; note: string | null; by: string | null }
export interface ResubmitInfo { at: string; note: string | null }
