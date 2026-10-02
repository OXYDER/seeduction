/** Compte famille : le pseudo d'un profil est « Nom·pseudo du compte » (« · » est interdit dans un pseudo ordinaire). */
export function splitProfileName(username?: string | null): { name: string; account: string | null } {
  const u = username ?? '';
  const i = u.indexOf('·');
  return i > 0 ? { name: u.slice(0, i), account: u.slice(i + 1) } : { name: u, account: null };
}
