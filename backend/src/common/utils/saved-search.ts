/**
 * Alertes de recherche : un membre enregistre les filtres de la page Parcourir (les mêmes paramètres que l'adresse de la page) et reçoit une alerte quand un torrent qui y correspond apparaît.
 * Ce module ne garde que ce qui est permis et le décrit en français ; la recherche elle-même est faite par TorrentsService.
 */
export const SAVED_SEARCH_KEYS = [
  'search', 'categoryId', 'year', 'language', 'origin', 'resolution', 'codec', 'hdr', 'audio', 'source', 'containerFormat', 'genre', 'minSize', 'maxSize', 'entityId', 'role',
] as const;
export const MAX_SAVED_SEARCHES = 20;

export type SavedQuery = Record<string, string>;

/** Ne garde que les filtres connus (et ceux de catégorie : `f.cle=valeur|valeur`), en texte court. `null` si rien d'utile n'est demandé. */
export function sanitizeQuery(input: unknown): SavedQuery | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: SavedQuery = {};
  for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue;
    const v = String(raw).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!v) continue;
    if ((SAVED_SEARCH_KEYS as readonly string[]).includes(k)) {
      if (k === 'hdr' && v !== 'true') continue;
      if ((k === 'year' || k === 'minSize' || k === 'maxSize') && !/^\d+(\.\d+)?$/.test(v)) continue;
      out[k] = v;
    } else if (/^f\.[A-Za-z0-9_-]{1,40}$/.test(k)) {
      const values = v.split('|').map((x) => x.trim()).filter(Boolean).slice(0, 12);
      if (values.length) out[k] = values.join('|');
    }
    if (Object.keys(out).length >= 24) break;
  }
  // une recherche trop vague (un seul mot de 1 lettre) n'a aucun intérêt
  if (out.search && out.search.length < 2) delete out.search;
  return Object.keys(out).length ? out : null;
}

/** « Dune · 2021 · 1080p · HDR » : de quoi reconnaître l'alerte dans une liste. */
export function describeQuery(q: SavedQuery): string {
  const parts: string[] = [];
  if (q.search) parts.push(`« ${q.search} »`);
  if (q.year) parts.push(q.year);
  for (const k of ['resolution', 'source', 'codec', 'audio', 'language', 'containerFormat', 'genre', 'origin']) if (q[k]) parts.push(q[k]);
  if (q.hdr === 'true') parts.push('HDR');
  if (q.minSize) parts.push(`≥ ${q.minSize} Go`);
  if (q.maxSize) parts.push(`≤ ${q.maxSize} Go`);
  for (const [k, v] of Object.entries(q)) if (k.startsWith('f.')) parts.push(v.split('|').join(' / '));
  return parts.join(' · ') || 'Tous les nouveaux torrents';
}

/** Nom proposé pour une alerte quand le membre n'en donne pas. */
export function defaultName(q: SavedQuery): string {
  return (q.search ? q.search : describeQuery(q)).slice(0, 60);
}
