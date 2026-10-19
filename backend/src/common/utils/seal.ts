import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { jwtSecret } from './secret';

/**
 * Chiffre un texte secret (mot de passe d'une boîte courriel, par exemple) avant de le ranger en base : un export de la base ne le montre pas en clair. AES-256-GCM, avec une clé dérivée du
 * secret des sessions et d'un « usage » (un secret chiffré pour un usage n'est pas lisible par un autre). Si JWT_SECRET change, les secrets sont à ressaisir (`openText` renvoie null).
 */
const keyOf = (purpose: string) => createHash('sha256').update(`seeduction-${purpose}:` + jwtSecret()).digest();

export function sealText(text: string, purpose: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(purpose), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function openText(blob: string, purpose: string): string | null {
  if (!blob) return null;
  try {
    const raw = Buffer.from(blob, 'base64');
    const d = createDecipheriv('aes-256-gcm', keyOf(purpose), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}
