/**
 * Couleur de pseudo par rang : le rôle du staff d'abord, puis « Uploadeur », puis la classe automatique (Power User, Élite, Vétéran).
 * « Nouveau » et « Membre » gardent la couleur ordinaire (rien à signaler), donc ne figurent pas dans la liste envoyée au site.
 */
export const COLORED_CLASSES = ['POWER_USER', 'ELITE', 'VETERAN'];
export const COLORED_ROLES = ['OWNER', 'ADMIN', 'SUPER_MODERATOR', 'MODERATOR', 'UPLOADER'];

/** Un membre fondateur passe avant tout : son pseudo est en or brillant (clé « FOUNDER »). */
export function rankKeyOf(role: string | null | undefined, memberClass: string | null | undefined, founder = false): string | null {
  if (founder) return 'FOUNDER';
  if (role && COLORED_ROLES.includes(role)) return role;
  if (memberClass && COLORED_CLASSES.includes(memberClass)) return memberClass;
  return null;
}
