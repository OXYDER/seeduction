/**
 * Markdown → BBCode (le format stocké par le site). Pour les descriptions envoyées par l'API et les textes collés : titres, gras, italique, barré, listes, citations,
 * liens, images, blocs de code, traits et tableaux. Ce qui n'a pas d'équivalent en BBCode (code en ligne, notes de bas de page) devient du texte simple.
 * NB : une copie identique de ce fichier existe côté navigateur (frontend/src/lib/markdownToBbcode.ts) ; garder les deux alignés.
 */

const SAFE_URL = /^https?:\/\/[^\s\]\[<>"]+$/i;
const BBCODE_TAG = /\[\/?(?:b|i|u|s|url|img|quote|code|color|size|center|right|left|spoiler|hr|block)(?:=[^\]]*)?\]/i;

/** Le texte est-il du BBCode (au moins une balise du site) ? Dans ce cas on n'y touche pas. */
export const looksLikeBbcode = (text: string): boolean => BBCODE_TAG.test(text);

/** Le texte est-il du Markdown ? (titre, gras, liste, citation, lien, image ou bloc de code) */
export function looksLikeMarkdown(text: string): boolean {
  if (looksLikeBbcode(text)) return false;
  return /^#{1,6}\s+\S/m.test(text)
    || /\*\*[^*\n]+\*\*/.test(text)
    || /(^|\s)__[^_\n]+__(\s|$|[.,;:!?])/.test(text)
    || /~~[^~\n]+~~/.test(text)
    || /^\s*(?:[-*+]|\d+[.)])\s+\S/m.test(text) && /\n\s*(?:[-*+]|\d+[.)])\s+\S/.test(text)
    || /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(text)
    || /!\[[^\]\n]*\]\(https?:\/\/[^)\s]+\)/.test(text)
    || /^```/m.test(text)
    || /^>\s+\S/m.test(text)
    || /^\|.+\|\s*\n\|\s*:?-{2,}/m.test(text);
}

function inline(text: string): string {
  const codes: string[] = [];
  // Le code en ligne est mis à l'abri : son contenu n'est jamais interprété.
  let t = text.replace(/`([^`\n]+)`/g, (_m, c: string) => `\u0001${codes.push(c) - 1}\u0001`);
  t = t.replace(/!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, u: string) => (SAFE_URL.test(u) ? `[img]${u}[/img]` : ''));
  t = t.replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, label: string, u: string) => (SAFE_URL.test(u) ? `[url=${u}]${label}[/url]` : label));
  t = t.replace(/<(https?:\/\/[^\s>]+)>/g, (m, u: string) => `[url=${u}]${u}[/url]`);
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, '[b]$1[/b]').replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, '$1[b]$2[/b]');
  t = t.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?=[^*\w]|$)/g, '$1[i]$2[/i]').replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?=[^\w]|$)/g, '$1[i]$2[/i]');
  t = t.replace(/~~([^~\n]+?)~~/g, '[s]$1[/s]');
  return t.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => codes[Number(i)]);
}

export function markdownToBbcode(markdown: string): string {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let quote: string[] = [];
  const flushQuote = () => { if (quote.length) { out.push(`[quote]${quote.join('\n')}[/quote]`); quote = []; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Bloc de code : ``` ... ```
    const fence = /^\s*```/.exec(line);
    if (fence) {
      flushQuote();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      out.push(`[code]${body.join('\n')}[/code]`);
      continue;
    }
    const q = /^\s{0,3}>\s?(.*)$/.exec(line);
    if (q) { quote.push(inline(q[1])); continue; }
    flushQuote();
    // Tableau : une ligne « | a | b | » suivie de « |---|---| ».
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // ligne de séparation
      out.push(inline(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join(' | ')));
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('[hr]'); continue; }
    const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { out.push(`[b]${inline(h[1])}[/b]`); continue; }
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { out.push(`${li[1].length >= 2 ? '   ' : ''}• ${inline(li[2])}`); continue; }
    out.push(inline(line));
  }
  flushQuote();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
