/**
 * Secret des sessions (JWT). Il sert aussi à chiffrer les mots de passe de seedbox et le jeton Telegram enregistrés : le changer oblige à les ressaisir et
 * déconnecte tout le monde. On ne le remplace donc jamais en silence ; on le lit à un seul endroit et on signale clairement un secret faible ou resté par défaut.
 */
export const DEV_SECRET = 'change-me-in-.env';

/** Valeurs connues et publiques : le secret par défaut du code et l'exemple du fichier `.env.example`. */
const KNOWN_WEAK = new Set([DEV_SECRET, 'change-me-generate-a-long-random-string', 'changeme', 'change-me', 'secret', 'password']);

/** Le secret en vigueur (celui de l'environnement, sinon la valeur de développement). */
export function jwtSecret(): string {
  return process.env.JWT_SECRET ?? DEV_SECRET;
}

/** Pourquoi ce secret est-il faible (null : il est correct) ? */
export function secretWeakness(secret: string | undefined = process.env.JWT_SECRET): string | null {
  if (!secret) return 'JWT_SECRET n\'est pas défini : le site utilise un secret public (n\'importe qui pourrait fabriquer une session administrateur)';
  if (KNOWN_WEAK.has(secret.trim().toLowerCase()) || KNOWN_WEAK.has(secret)) return 'JWT_SECRET est resté à la valeur d\'exemple, qui est publique';
  if (secret.length < 24) return `JWT_SECRET est trop court (${secret.length} caractères ; il en faut au moins 24)`;
  return null;
}
