/**
 * Corrections proposées par les membres sur la fiche d'un torrent (langue, qualité, saison / épisode...) : seuls certains champs sont modifiables par cette voie,
 * chaque valeur est nettoyée, et on retire ce qui ne change rien. Logique pure (testée) ; la lecture de la base est dans TorrentFixesService.
 */
import { LANGUAGE_TAGS, normalizeLanguage } from './language';

/** Champs qu'un membre peut proposer de corriger, avec leur longueur maximale (ou type). */
export const FIX_FIELDS: Record<string, { label: string; max?: number; kind?: 'text' | 'int' | 'language' | 'id' }> = {
  name: { label: 'Nom de la release', max: 300 },
  language: { label: 'Langue', kind: 'language' },
  resolution: { label: 'Résolution', max: 20 },
  source: { label: 'Source', max: 30 },
  codec: { label: 'Codec vidéo', max: 40 },
  audio: { label: 'Audio', max: 60 },
  season: { label: 'Saison', max: 10 },
  episode: { label: 'Épisode', max: 10 },
  year: { label: 'Année', kind: 'int' },
  categoryId: { label: 'Catégorie', kind: 'id' },
};

export const FIX_NOTE_MIN = 10;
export const FIX_NOTE_MAX = 500;

/** Valeurs proposées, nettoyées : champs inconnus ignorés, texte rogné, entiers vérifiés. Lève une erreur de message clair si une valeur est invalide. */
export function sanitizeFixChanges(raw: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, spec] of Object.entries(FIX_FIELDS)) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === undefined || v === null) continue;
    if (spec.kind === 'int') {
      const n = Number(v);
      if (String(v).trim() === '') continue;
      if (!Number.isInteger(n) || n < 1880 || n > new Date().getFullYear() + 2) throw new Error('Année invalide');
      out[key] = n;
    } else if (spec.kind === 'language') {
      const s = String(v).trim();
      if (!s) continue;
      const lang = normalizeLanguage(s);
      if (!lang || !LANGUAGE_TAGS.includes(lang)) throw new Error('Langue non reconnue (VO, VOSTFR, VFQ, MULTI.VFF...)');
      out[key] = lang;
    } else if (spec.kind === 'id') {
      const s = String(v).trim();
      if (s) out[key] = s.slice(0, 64);
    } else {
      const s = String(v).replace(/\s+/g, ' ').trim().slice(0, spec.max ?? 100);
      if (s) out[key] = s;
    }
  }
  return out;
}

/** Retire les valeurs identiques à l'actuelle : ne reste que ce qui change vraiment. */
export function diffFixChanges(current: Record<string, unknown>, changes: Record<string, string | number>): Record<string, { from: string | number | null; to: string | number }> {
  const out: Record<string, { from: string | number | null; to: string | number }> = {};
  for (const [key, to] of Object.entries(changes)) {
    const from = current[key] === undefined || current[key] === null || current[key] === '' ? null : (current[key] as string | number);
    if (String(from ?? '').toLowerCase() === String(to).toLowerCase()) continue;
    out[key] = { from, to };
  }
  return out;
}

/** Message d'erreur si la demande est irrecevable (note trop courte, rien à dire). */
export function fixProblem(changes: Record<string, unknown>, note: string): string | null {
  const n = String(note ?? '').trim();
  if (n.length < FIX_NOTE_MIN) return `Explique en quelques mots ce qui ne va pas (${FIX_NOTE_MIN} caractères minimum) : l'équipe vérifie avant d'appliquer.`;
  if (Object.keys(changes).length === 0 && n.length < 25) return 'Sans correction précise, décris ce qui te semble louche ou pas clair (25 caractères minimum).';
  return null;
}

/** Points offerts à l'auteur d'une correction acceptée, et plafond par jour. */
export const FIX_REWARD = 15;
export const FIX_REWARDS_PER_DAY = 5;
/** Corrections en attente (toutes fiches confondues) et créées par jour, par membre. */
export const FIX_PENDING_MAX = 3;
export const FIX_PER_DAY_MAX = 10;
