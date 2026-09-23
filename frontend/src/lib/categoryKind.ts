/**
 * Type de contenu effectif d'une catégorie de torrent, pour le générateur de
 * description : celui de la catégorie elle-même, sinon celui de sa catégorie
 * parente (configurés dans Administration > Catégories torrents).
 */
export function resolveContentKind(category: { contentKind?: string | null } | undefined, parent: { contentKind?: string | null } | undefined): string | undefined {
  return category?.contentKind || parent?.contentKind || undefined;
}
