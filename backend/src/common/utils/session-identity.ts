/**
 * Identité à jour d'un compte pour une session déjà ouverte. Le jeton de connexion dure 7 jours : le rôle et l'état du compte ne sont donc pas crus sur parole, ils sont relus
 * dans la base (au plus toutes les 15 secondes par compte). Un membre banni, un compte désactivé, une personne de l'équipe rétrogradée ou un compte supprimé perdent leurs
 * droits presque tout de suite, et un changement de mot de passe coupe les sessions ouvertes avant lui.
 */
export interface SessionIdentity { status: string; role: string; validAfter: number }
export const IDENTITY_TTL_MS = 15_000;

const cache = new Map<string, SessionIdentity & { at: number }>();

export type IdentityDb = { user: { findUnique: (args: any) => Promise<{ status: string; role: string; sessionsValidAfter: Date | null } | null> } };

/** Lit (avec un cache de 15 s) l'état du compte ; `null` : le compte n'existe plus. */
export async function loadIdentity(db: IdentityDb, userId: string): Promise<SessionIdentity | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit.status === 'MISSING' ? null : hit;
  const row = await db.user.findUnique({ where: { id: userId }, select: { status: true, role: true, sessionsValidAfter: true } });
  const value = row ? { status: row.status, role: row.role, validAfter: row.sessionsValidAfter?.getTime() ?? 0 } : { status: 'MISSING', role: '', validAfter: 0 };
  if (cache.size > 2000) cache.clear();
  cache.set(userId, { ...value, at: Date.now() });
  return row ? value : null;
}

/** Raison du refus d'une session (jeton émis à `iat`, en secondes), ou `null` si elle est valide. */
export function sessionRefusal(id: SessionIdentity | null, iat?: number): string | null {
  if (!id) return 'Compte introuvable : reconnecte-toi';
  if (id.status === 'BANNED' || id.status === 'DISABLED') return 'Compte indisponible';
  if (id.validAfter && (iat ?? 0) * 1000 < id.validAfter) return 'Session expirée : reconnecte-toi';
  return null;
}

/** Oublie ce qu'on sait d'un compte (après un bannissement, un changement de rôle...) : la prochaine requête relit la base. */
export function forgetIdentity(userId: string) { cache.delete(userId); }
