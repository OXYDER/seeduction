export const CLASS_LABEL: Record<string, string> = {
  NOUVEAU: 'Nouveau', MEMBRE: 'Membre', POWER_USER: 'Power User', ELITE: 'Élite', VETERAN: 'Vétéran',
};

export const CLASS_ICON: Record<string, string> = {
  NOUVEAU: '🌱', MEMBRE: '👤', POWER_USER: '⚡', ELITE: '💎', VETERAN: '🏆',
};

/** Rang à afficher : le rôle du staff s'il y en a un, sinon la classe automatique (Nouveau, Membre, Power User...). */
export function displayRank(user: { role?: string; memberClass?: string } | null | undefined, roleLabels: Record<string, string>): string {
  if (!user) return '';
  if (user.role && ['MODERATOR', 'ADMIN', 'OWNER'].includes(user.role)) return roleLabels[user.role] ?? user.role;
  const cls = user.memberClass ?? 'NOUVEAU';
  return `${CLASS_ICON[cls] ?? ''} ${CLASS_LABEL[cls] ?? cls}`.trim();
}
