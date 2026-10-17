/**
 * Erreurs de l'announce du tracker. Les refus voulus (passkey invalide, ratio trop bas, torrent inconnu...) sont des messages écrits pour le membre et partent tels quels
 * au client BitTorrent. Les erreurs INTERNES (base de données injoignable, colonne manquante, trop de connexions...) ne doivent jamais lui être montrées : elles
 * contiennent des chemins et du code de l'application. On les journalise côté serveur et le client reçoit un message court.
 */
export const TEMPORARY_FAILURE = 'Erreur temporaire du tracker, réessaie dans quelques minutes';

/** Erreur venant de Prisma ou de la base (et non d'une règle du tracker). */
export function isInternalError(err: any): boolean {
  if (!err) return false;
  const name = String(err.name ?? '');
  const message = String(err.message ?? '');
  return /^PrismaClient/.test(name) || (typeof err.code === 'string' && /^P\d{4}$/.test(err.code)) || /^\s*Invalid `/.test(message) || /prisma/i.test(message);
}

/** Erreurs de connexion passagères (base qui redémarre, réservoir de connexions plein) : une nouvelle tentative immédiate suffit souvent. */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  return ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(code) || String(err.name ?? '') === 'PrismaClientInitializationError' || /Can't reach database|connection pool|Timed out fetching/i.test(String(err.message ?? ''));
}

/** Ce que le client BitTorrent doit lire : le message du tracker tel quel, ou un message court pour une erreur interne. */
export function failureReasonOf(err: any): string {
  return isInternalError(err) ? TEMPORARY_FAILURE : String(err?.message ?? 'Erreur tracker');
}
