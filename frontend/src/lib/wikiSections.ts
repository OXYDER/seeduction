export interface WikiSection { id: string; title: string; body: string }
export interface WikiParts { intro: string; sections: WikiSection[] }

/**
 * Découpe un article du wiki en sections pour l'afficher en blocs repliables avec une table des matières, SANS changer
 * son contenu (BBCode) : un paragraphe qui COMMENCE par un texte en gras, seul sur sa ligne ou suivi de « : », devient le
 * titre d'une section (par ex. « [b]La règle[/b] » ou « [b]Codes d'invitation[/b] (admins) : … »). Le reste du paragraphe
 * et les paragraphes suivants, jusqu'au prochain titre, forment le corps. Ce qui précède le premier titre est l'introduction.
 */
export function splitWiki(content: string): WikiParts {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);
  let intro = '';
  const sections: WikiSection[] = [];
  const HEAD = /^\[b\]([^\[\]\n]{2,90}?)\[\/b\]([ \t]*\([^)\n]{0,70}\))?[ \t]*(:[ \t]*|\n|$)/;
  for (const raw of blocks) {
    const block = raw.replace(/^\n+|\n+$/g, '');
    if (!block) continue;
    const m = HEAD.exec(block);
    if (m) {
      // Le titre est le texte en gras seul ; une précision entre parenthèses (« (admins) ») reste au début du corps.
      const rest = block.slice(m[1].length + 7); // 7 = longueur de [b] + [/b]
      const body = (m[2] ? rest.replace(/^[ \t]*/, '').replace(/^(\([^)\n]*\))[ \t]*:?[ \t]*/, '$1 ') : rest.replace(/^[ \t]*:?[ \t]*/, '')).replace(/^\n+/, '');
      sections.push({ id: `s${sections.length + 1}`, title: m[1].trim(), body: body.replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase()) });
    } else if (sections.length) {
      const last = sections[sections.length - 1];
      last.body = last.body ? `${last.body}\n\n${block}` : block;
    } else {
      intro = intro ? `${intro}\n\n${block}` : block;
    }
  }
  return { intro, sections };
}

/** Texte sans balises BBCode, pour le temps de lecture et les extraits de recherche. */
export const plainText = (bbcode: string) => bbcode.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

export const readingMinutes = (bbcode: string) => Math.max(1, Math.round(plainText(bbcode).split(' ').length / 200));

/** Extrait autour de la première occurrence de `q` (pour les résultats de recherche). */
export function snippet(bbcode: string, q: string, radius = 110): { before: string; hit: string; after: string } {
  const text = plainText(bbcode);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return { before: text.slice(0, radius * 2), hit: '', after: '' };
  const start = Math.max(0, i - radius);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, i),
    hit: text.slice(i, i + q.length),
    after: text.slice(i + q.length, i + q.length + radius) + (i + q.length + radius < text.length ? '…' : ''),
  };
}
