/**
 * Recherche dans le courriel, étendue aux pièces jointes : par leur nom (structure du message, sans rien télécharger) et par leur contenu quand c'est du texte
 * (.txt, .csv, .log, .json, .xml, .srt... ; le contenu des PDF et des documents Office n'est pas lu). Logique pure (testée) ; l'accès IMAP est dans WebmailService.
 */

/** Minuscules sans accents : « Résumé » et « resume » se retrouvent. */
export const fold = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Les mots de la recherche (tous doivent être présents), sans accents ni majuscules. */
export const termsOf = (q: string) => fold(q).split(/\s+/).filter((t) => t.length > 0).slice(0, 6);

/** Tous les mots sont-ils dans le texte ? */
export const matchesAll = (text: string, terms: string[]) => terms.length > 0 && terms.every((t) => fold(text).includes(t));

export interface AttachmentInfo { part: string; filename: string; type: string; size: number }

/** Les pièces jointes d'un message d'après sa structure MIME (imapflow : `part`, `type`, `size`, `disposition`, `dispositionParameters.filename`, `parameters.name`). */
export function attachmentsOf(node: any, out: AttachmentInfo[] = []): AttachmentInfo[] {
  if (!node) return out;
  const children: any[] = node.childNodes ?? [];
  if (children.length) { for (const c of children) attachmentsOf(c, out); return out; }
  const filename = String(node.dispositionParameters?.filename ?? node.parameters?.name ?? '').trim();
  // Une partie qui porte un nom de fichier est une pièce jointe (le corps du message, lui, n'en a pas).
  if (filename) out.push({ part: String(node.part ?? '1'), filename, type: String(node.type ?? 'application/octet-stream').toLowerCase(), size: Number(node.size ?? 0) });
  return out;
}

/** Les pièces jointes dont le nom contient tous les mots. */
export const attachmentsMatching = (list: AttachmentInfo[], terms: string[]) => list.filter((a) => matchesAll(a.filename, terms));

const TEXT_EXT = /\.(txt|csv|tsv|log|md|json|xml|ya?ml|ini|cfg|conf|srt|vtt|nfo|html?|eml|ics|vcf|sql|js|ts|py|sh)$/i;

/** Une pièce jointe dont on peut lire le contenu comme du texte (et pas trop grosse). */
export function isSearchableText(a: Pick<AttachmentInfo, 'filename' | 'type' | 'size'>, maxBytes = 200_000): boolean {
  if (a.size > maxBytes) return false;
  return /^text\//.test(a.type) || /^application\/(json|xml|x-yaml|yaml|csv|javascript|x-sh|x-subrip)/.test(a.type) || TEXT_EXT.test(a.filename);
}

/** Décode des octets en texte (UTF-8, ou latin-1 si ce n'est pas de l'UTF-8 valide). */
export function decodeText(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  return utf8.includes('�') ? buf.toString('latin1') : utf8;
}
