// Éditeur du chat « tel quel » : on voit le gras, l'italique, le code... pendant qu'on écrit, mais le texte envoyé reste le même Markdown léger
// (**gras**, *italique*, ~~barré~~, `code`, ||spoiler||, « > citation ») que celui affiché par ChatText (chatFormat.tsx) : rien ne change côté
// messages, mentions, aperçus de liens ou modération. Ce module convertit dans les deux sens.

import { INLINE_MARKS } from './chatFormat';

/** Espace de largeur nulle : place le curseur juste après un élément mis en forme, pour que la suite ne soit pas en gras / code... */
export const ZW = '​';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const SPOILER_CLASS = 'msgr-ed-spoiler';
export const QUOTE_CLASS = 'msgr-ed-quote';

/** Une ligne de texte (sans retour à la ligne) du Markdown léger → HTML de l'éditeur (tout le texte est échappé). */
function inlineToHtml(text: string, depth = 0): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(INLINE_MARKS)) {
    const start = m.index ?? 0;
    out += esc(text.slice(last, start));
    const inner = (len: number) => (depth < 2 ? inlineToHtml(m[0].slice(len, m[0].length - len), depth + 1) : esc(m[0].slice(len, m[0].length - len)));
    if (m[1]) out += `<code>${esc(m[0].slice(1, -1))}</code>`;
    else if (m[2]) out += `<b>${inner(2)}</b>`;
    else if (m[3]) out += `<s>${inner(2)}</s>`;
    else if (m[4]) out += `<span class="${SPOILER_CLASS}" data-f="spoiler">${inner(2)}</span>`;
    else out += `<i>${inner(1)}</i>`;
    last = start + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** Markdown léger → HTML de l'éditeur : lignes séparées par <br>, lignes « > » regroupées en un bloc de citation. */
export function mdToEditorHtml(md: string): string {
  const lines = String(md ?? '').split('\n');
  let html = '';
  let quote: string[] = [];
  let needBr = false; // un retour à la ligne est dû avant la prochaine ligne de texte
  const flush = () => {
    if (!quote.length) return;
    html += `<blockquote class="${QUOTE_CLASS}" data-f="quote">${quote.map((l) => inlineToHtml(l)).join('<br>')}</blockquote>`;
    quote = [];
    needBr = false; // un bloc se termine tout seul
  };
  for (const line of lines) {
    const q = /^>\s?/.exec(line);
    if (q) { if (needBr) { html += '<br>'; needBr = false; } quote.push(line.slice(q[0].length)); continue; }
    flush();
    if (needBr) html += '<br>';
    html += inlineToHtml(line);
    needBr = true;
  }
  flush();
  return html;
}

/** Entoure `inner` de `mark`, en laissant les espaces de bord à l'extérieur (« ** gras** » ne serait pas reconnu à l'affichage). */
function wrapMark(mark: string, inner: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}

const BLOCKS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'PRE']);

function serializeChildren(parent: Node, state: { out: string }, inline = false): void {
  const ensureNl = () => { if (!inline && state.out && !state.out.endsWith('\n')) state.out += '\n'; };
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) { state.out += (node.nodeValue ?? '').replace(/​/g, '').replace(/ /g, ' '); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') { state.out += '\n'; return; }
    if (tag === 'BLOCKQUOTE') {
      const inner = { out: '' };
      serializeChildren(el, inner, true);
      const body = inner.out.replace(/\n+$/, '');
      ensureNl();
      state.out += body.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n') + '\n';
      return;
    }
    if (BLOCKS.has(tag)) {
      ensureNl();
      serializeChildren(el, state, inline);
      ensureNl();
      return;
    }
    // Mise en forme : balises (b, i, s, code, spoiler) ou, selon le navigateur, styles en ligne.
    const st = el.style;
    const bold = tag === 'B' || tag === 'STRONG' || parseInt(st?.fontWeight || '0', 10) >= 600 || st?.fontWeight === 'bold';
    const italic = tag === 'I' || tag === 'EM' || st?.fontStyle === 'italic';
    const strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(st?.textDecorationLine || st?.textDecoration || '');
    const spoiler = el.dataset?.f === 'spoiler';
    const inner = { out: '' };
    if (tag === 'CODE') inner.out = (el.textContent ?? '').replace(/​/g, '').replace(/ /g, ' ').replace(/\n/g, ' ');
    else serializeChildren(el, inner, true);
    let text = inner.out;
    if (tag === 'CODE') text = wrapMark('`', text);
    if (spoiler) text = wrapMark('||', text);
    if (strike) text = wrapMark('~~', text);
    if (italic) text = wrapMark('*', text);
    if (bold) text = wrapMark('**', text);
    state.out += text;
  });
}

/** HTML de l'éditeur → Markdown léger (la valeur envoyée). */
export function editorToMd(root: HTMLElement): string {
  const state = { out: '' };
  serializeChildren(root, state);
  return state.out;
}

/** Mises en forme qu'on reconnaît pendant la frappe : « **mot** » devient du gras dès le second astérisque fermant, comme dans Discord. */
export const AUTO_FORMATS: { re: RegExp; html: (inner: string) => string }[] = [
  { re: /`([^`\n]+)`$/, html: (t) => `<code>${esc(t)}</code>` },
  { re: /\*\*([^*\n]+?)\*\*$/, html: (t) => `<b>${esc(t)}</b>` },
  { re: /~~([^~\n]+?)~~$/, html: (t) => `<s>${esc(t)}</s>` },
  { re: /\|\|([^|\n]+?)\|\|$/, html: (t) => `<span class="${SPOILER_CLASS}" data-f="spoiler">${esc(t)}</span>` },
  { re: /(?<![*\p{L}\p{N}])\*([^*\s][^*\n]*?)\*$/u, html: (t) => `<i>${esc(t)}</i>` },
  { re: /(?<![\p{L}\p{N}_])_([^_\s][^_\n]*?)_$/u, html: (t) => `<i>${esc(t)}</i>` },
];
