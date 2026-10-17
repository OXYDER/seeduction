/**
 * Torrent « en attente de correction » : le staff le met en suspens et demande au membre de le corriger (pas de seed, erreur dans la description, mauvais NFO,
 * mauvaise fiche...). Le torrent reste « en attente » (invisible du public) ; il quitte la file à examiner jusqu'à ce que le membre le renvoie corrigé.
 */
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

export const HOLD_NOTE_MAX = 600;
export const RESUBMIT_NOTE_MAX = 400;

export interface HoldRequest { reasons: string[]; note: string }

/** Motifs connus (sans doublon, dans l'ordre de la liste) et message nettoyé ; refuse une demande vide. */
export function normalizeHold(raw: any): HoldRequest {
  const asked = Array.isArray(raw?.reasons) ? raw.reasons.filter((r: unknown): r is string => typeof r === 'string') : [];
  const reasons = Object.keys(HOLD_REASONS).filter((k) => asked.includes(k));
  const note = typeof raw?.note === 'string' ? raw.note.replace(/\s+\n/g, '\n').trim().slice(0, HOLD_NOTE_MAX) : '';
  if (reasons.length === 0 && !note) throw new Error('Choisis au moins un motif ou écris un message au membre');
  return { reasons, note };
}

/** Le texte envoyé au membre (notification) : la liste des motifs puis le message de l'équipe. */
export function holdMessage(torrentName: string, hold: HoldRequest, by: string): string {
  const lines = hold.reasons.map((r) => `• ${HOLD_REASONS[r]}`);
  return [torrentName, ...lines, hold.note ? `${by} : « ${hold.note} »` : ''].filter(Boolean).join('\n');
}
