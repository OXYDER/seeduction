/**
 * Double authentification obligatoire pour l'équipe (réglage Admin > Sécurité). Quand il est actif, une personne de l'équipe (modérateur et plus) qui n'a pas activé la 2FA
 * garde son compte de membre, mais ne peut plus utiliser les outils de l'équipe (modération, admin, courriel...) tant qu'elle ne l'a pas fait.
 */
export const STAFF_ROLES = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] as const;
export const STAFF_2FA_KEY = 'staff2faRequired';
export const STAFF_2FA_CODE = 'STAFF_2FA_REQUIRED';
export const STAFF_2FA_MESSAGE = "La double authentification est obligatoire pour l'équipe : active-la dans Profil > Sécurité pour retrouver l'accès aux outils de l'équipe.";

export const isStaffRole = (role?: string | null) => !!role && (STAFF_ROLES as readonly string[]).includes(role);

/** Cette personne doit-elle être bloquée des outils de l'équipe ? (`twoFactor` inconnu = on ne bloque pas : profil famille, jeton de choix de profil...) */
export function staffBlockedFor2fa(required: boolean, role: string | undefined, twoFactor: boolean | undefined): boolean {
  return required && isStaffRole(role) && twoFactor === false;
}

type Db = { siteSetting: { findUnique: (a: any) => Promise<{ value: any } | null> } };
let cache: { at: number; value: boolean } | null = null;
const TTL_MS = 15_000;

/** Le réglage, relu au plus toutes les 15 secondes. */
export async function staff2faRequired(db: Db): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await db.siteSetting.findUnique({ where: { key: STAFF_2FA_KEY } });
  const value = row?.value === true;
  cache = { at: Date.now(), value };
  return value;
}
export function forgetStaff2fa() { cache = null; }
