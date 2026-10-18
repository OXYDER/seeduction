/**
 * Règles de choix d'un mot de passe (logique pure). Un mot de passe trop prévisible se devine en quelques secondes même avec les limites de tentatives : on refuse les plus courants,
 * ceux qui ne sont qu'une suite évidente, et ceux qui contiennent le pseudo ou le début du courriel du membre.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Mots de passe parmi les plus utilisés (anglais et français), comparés sans casse ni chiffres de fin simples. */
const COMMON = new Set([
  'password', 'passw0rd', 'p@ssword', 'p@ssw0rd', 'motdepasse', 'monmotdepasse', 'motdepasse1', 'bienvenue', 'bonjour', 'soleil', 'doudou', 'chouchou', 'azerty', 'azertyuiop', 'qwerty', 'qwertyuiop',
  'qwertz', 'abc123', 'abcd1234', 'abcdefgh', 'iloveyou', 'jetaime', 'letmein', 'welcome', 'admin', 'administrateur', 'administrator', 'root', 'toor', 'login', 'master', 'dragon', 'monkey',
  'football', 'baseball', 'hockey', 'canadiens', 'habs', 'montreal', 'quebec', 'seeduction', 'tracker', 'torrent', 'torrents', 'freeleech', 'starwars', 'superman', 'batman', 'trustno1', 'princess',
  'sunshine', 'shadow', 'michael', 'jennifer', 'jordan', 'harley', 'ranger', 'buster', 'thomas', 'summer', 'hello', 'freedom', 'whatever', 'secret', 'changeme', 'default', 'test', 'testtest',
  'minecraft', 'pokemon', 'naruto', 'liverpool', 'chelsea', 'arsenal', 'charlie', 'killer', 'hunter', 'cheese', 'computer', 'internet', 'samsung', 'google', 'facebook', 'ginger', 'pepper',
  'access', 'flower', 'hottie', 'loveme', 'zaq12wsx', 'azsxdc', '1q2w3e4r', '1qaz2wsx', 'qazwsx', 'qwe123', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'poiuytreza', 'mdp', 'motdepasse123',
]);
const SEQUENCES = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'azertyuiopqsdfghjklmwxcvbn', 'qwertyuiopasdfghjklzxcvbnm'];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Message à montrer au membre, ou `null` si le mot de passe est acceptable. */
export function passwordProblem(password: string, who: { username?: string | null; email?: string | null } = {}): string | null {
  const p = String(password ?? '');
  if (p.length < MIN_PASSWORD_LENGTH) return `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`;
  if (p.length > MAX_PASSWORD_LENGTH) return `Mot de passe trop long (${MAX_PASSWORD_LENGTH} caractères maximum)`;
  const n = norm(p);
  const letters = n.replace(/[^a-z0-9]/g, '');
  const stripped = letters.replace(/\d+$/, '');
  if (COMMON.has(n) || COMMON.has(letters) || (stripped.length >= 4 && COMMON.has(stripped))) return 'Ce mot de passe est trop courant : choisis-en un plus original (une phrase de plusieurs mots est idéale)';
  if (new Set(n).size <= 2) return 'Ce mot de passe est trop répétitif : choisis-en un plus original';
  if (/^\d+$/.test(p) && p.length < 12) return 'Un mot de passe composé uniquement de chiffres est trop facile à deviner : ajoute des lettres';
  if (SEQUENCES.some((s) => s.includes(letters) && letters.length >= 6)) return 'Ce mot de passe est une suite évidente de touches ou de chiffres : choisis-en un plus original';
  const user = norm(String(who.username ?? ''));
  if (user.length >= 4 && n.includes(user)) return 'Ton mot de passe ne doit pas contenir ton pseudo';
  const local = norm(String(who.email ?? '').split('@')[0] ?? '');
  if (local.length >= 4 && n.includes(local)) return 'Ton mot de passe ne doit pas contenir le début de ton courriel';
  return null;
}
