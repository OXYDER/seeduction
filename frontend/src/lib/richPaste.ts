/**
 * Collage mis en forme : le HTML qui vient d'une page web, de Word, de Google Docs, d'un courriel... est nettoyé (aucun script, style libre, police, taille ni
 * fond d'une autre page), puis converti dans ce que l'éditeur du site sait afficher : gras, italique, souligné, barré, titres, listes, citations, liens, images,
 * couleurs lisibles sur le thème sombre. Le reste est du texte simple. Même résultat que si le texte avait été mis en forme à la main dans l'éditeur.
 */
import { htmlToBbcode } from './htmlToBbcode';

const DROP = 'script,style,meta,link,title,head,svg,iframe,object,embed,form,input,button,select,textarea,noscript,template,canvas,video,audio,base';
const BLOCKS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE', 'HR']);
const SAFE_URL = /^https?:\/\//i;

/** Luminance (0 = noir, 1 = blanc) d'une couleur CSS « #rgb », « #rrggbb » ou « rgb(...) » ; null si elle n'est pas lisible. */
function luminance(color: string): number | null {
  const c = color.trim().toLowerCase();
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
  else if (c === 'black') return 0;
  else if (c === 'white') return 1;
  else return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function unwrap(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Entoure le contenu d'un élément d'une suite de balises de mise en forme (b, i, u, s...). */
function wrapContent(doc: Document, el: Element, tags: string[]) {
  let inner: Element = el;
  for (const tag of tags) {
    const w = doc.createElement(tag);
    while (inner.firstChild) w.appendChild(inner.firstChild);
    inner.appendChild(w);
    inner = w;
  }
}

/**
 * Le HTML collé, ramené à une petite liste de balises sans style (sauf une couleur lisible et un alignement).
 * Un élément `<span style="font-weight:700">` devient `<b>`, un titre devient un paragraphe en gras, un tableau devient des lignes de texte.
 */
export function cleanPastedHtml(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  body.querySelectorAll(DROP).forEach((n) => n.remove());
  body.querySelectorAll('*').forEach((n) => { if (n.tagName.includes(':')) n.remove(); }); // <o:p> de Word

  // Google Docs enveloppe tout dans <b style="font-weight:normal" id="docs-internal-guid-…"> : ce n'est pas du gras.
  body.querySelectorAll('b[id^="docs-internal-guid"]').forEach(unwrap);

  // Titres → paragraphes en gras.
  body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const p = doc.createElement('p');
    const b = doc.createElement('b');
    while (h.firstChild) b.appendChild(h.firstChild);
    p.appendChild(b);
    h.replaceWith(p);
  });

  // Tableaux → une ligne de texte par rangée, cellules séparées par « | ».
  body.querySelectorAll('table').forEach((t) => {
    const out = doc.createElement('div');
    t.querySelectorAll('tr').forEach((tr) => {
      const line = doc.createElement('div');
      Array.from(tr.children).forEach((cell, i) => {
        if (i) line.appendChild(doc.createTextNode(' | '));
        while (cell.firstChild) line.appendChild(cell.firstChild);
      });
      out.appendChild(line);
    });
    t.replaceWith(out);
  });

  body.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName;
    const style = (el as HTMLElement).style;
    if (tag === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (!SAFE_URL.test(href)) { unwrap(el); return; }
      Array.from(el.attributes).forEach((a) => { if (a.name !== 'href') el.removeAttribute(a.name); });
      return;
    }
    if (tag === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      if (!SAFE_URL.test(src)) { el.remove(); return; }
      Array.from(el.attributes).forEach((a) => { if (a.name !== 'src') el.removeAttribute(a.name); });
      return;
    }
    // Mise en forme portée par un style (Word, Google Docs, pages web) → vraies balises.
    const tags: string[] = [];
    const weight = style?.fontWeight ?? '';
    if (!['B', 'STRONG'].includes(tag) && (weight === 'bold' || Number(weight) >= 600)) tags.push('b');
    if (!['I', 'EM'].includes(tag) && style?.fontStyle === 'italic') tags.push('i');
    const deco = `${style?.textDecoration ?? ''} ${style?.textDecorationLine ?? ''}`;
    if (!['U', 'A'].includes(tag) && deco.includes('underline')) tags.push('u');
    if (!['S', 'STRIKE', 'DEL'].includes(tag) && deco.includes('line-through')) tags.push('s');
    // Les couleurs foncées d'une page claire seraient invisibles sur le thème sombre : on ne garde que les couleurs lisibles.
    const color = style?.color || el.getAttribute('color') || '';
    const lum = color ? luminance(color) : null;
    const keepColor = lum !== null && lum >= 0.3 ? color : '';
    const align = style?.textAlign === 'center' || style?.textAlign === 'right' ? style.textAlign : '';
    const isBlock = BLOCKS.has(tag);
    el.removeAttribute('style'); el.removeAttribute('class'); el.removeAttribute('id'); el.removeAttribute('color'); el.removeAttribute('face'); el.removeAttribute('size'); el.removeAttribute('align');
    if (tags.length) wrapContent(doc, el, tags);
    if (keepColor || (align && isBlock)) {
      const h = el as HTMLElement;
      if (keepColor) h.style.color = keepColor;
      if (align && isBlock) h.style.textAlign = align;
    }
  });

  // Les <span> et <font> sans rien à dire disparaissent (le texte reste).
  body.querySelectorAll('span,font').forEach((el) => { if (!(el as HTMLElement).getAttribute('style')) unwrap(el); });
  return body;
}

/** Le HTML collé → BBCode (format de l'éditeur du site). Vide s'il n'y a rien d'exploitable. */
export function pastedHtmlToBbcode(html: string): string {
  return htmlToBbcode(cleanPastedHtml(html).innerHTML).trim();
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Du code copié depuis un éditeur (VS Code, terminal...) : police à chasse fixe et espaces conservés. On le colle en texte simple, sans ses couleurs de coloration. */
export const looksLikeCode = (html: string): boolean => /font-family:[^;"]*(monospace|consolas|courier|menlo|monaco)/i.test(html) && /white-space:\s*pre/i.test(html);

/** Le collage apporte-t-il de la mise en forme par rapport au texte brut ? (sinon on colle simplement le texte) */
export function hasFormatting(bbcode: string, plain: string): boolean {
  return !!bbcode && norm(bbcode) !== norm(plain) && /\[(\/?(b|i|u|s|url|img|quote|color|center|right|code|hr)\b|\*)|•/i.test(bbcode);
}

/**
 * Le HTML collé → Markdown léger du chat (**gras**, *italique*, ~~barré~~, `code`, « > citation »). Les liens gardent leur adresse, les images
 * sont remplacées par leur adresse, les listes deviennent des lignes « • ».
 */
export function pastedHtmlToChatMarkdown(html: string): string {
  const root = cleanPastedHtml(html);
  const mark = (inner: string, m: string) => (inner.trim() ? `${/^\s/.test(inner) ? ' ' : ''}${m}${inner.trim()}${m}${/\s$/.test(inner) ? ' ' : ''}` : inner);
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join('');
    switch (el.tagName) {
      case 'B': case 'STRONG': return mark(inner, '**');
      case 'I': case 'EM': return mark(inner, '*');
      case 'S': case 'STRIKE': case 'DEL': return mark(inner, '~~');
      case 'CODE': return inner.trim() && !inner.includes('`') ? `\`${inner.trim()}\`` : inner;
      case 'BR': return '\n';
      case 'HR': return '\n';
      case 'IMG': return ` ${el.getAttribute('src') ?? ''} `;
      case 'A': { const href = el.getAttribute('href') ?? ''; const t = inner.trim(); return !t || t === href ? href : `${t} (${href})`; }
      case 'LI': return `\n• ${inner.trim()}\n`;
      case 'BLOCKQUOTE': return `\n${inner.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n`;
      case 'PRE': return `\n${el.textContent ?? ''}\n`;
      case 'P': case 'DIV': case 'UL': case 'OL': case 'TR': return `\n${inner}\n`;
      default: return inner;
    }
  };
  return Array.from(root.childNodes).map(walk).join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\n\n(?=• )/g, '\n').trim();
}
