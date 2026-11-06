import * as sanitizeHtml from 'sanitize-html';

/**
 * Description envoyée en HTML (API d'envoi) → BBCode, le format stocké par le site.
 * Le HTML est d'abord nettoyé (liste blanche de balises, pas de script ni de style libre), puis converti balise par balise.
 * Ce que le BBCode du site ne sait pas faire (tableaux, classes, styles libres) est déplié en simple texte.
 */

const HTML_TAG = /<\/?(?:b|strong|i|em|u|s|strike|del|a|img|br|p|div|span|h[1-6]|ul|ol|li|blockquote|pre|code|hr|center|font|table|tr|td|th|details|summary|small|mark)\b[^>]*>/i;

/** Le texte est-il du HTML ? (au moins une balise de mise en forme courante) */
export const looksLikeHtml = (text: string): boolean => HTML_TAG.test(text);

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

function toHex(color: string): string | null {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(c)) return c;
  const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  return /^[a-z]+$/.test(c) ? c : null;
}

/** Valeur d'une propriété dans un attribut style="a:b;c:d". */
const styleOf = (attrs: string, prop: string): string | null => {
  const s = /style="([^"]*)"/i.exec(attrs)?.[1] ?? '';
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(s);
  return m ? m[1].trim() : null;
};
const attrOf = (attrs: string, name: string): string | null => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs)?.[1] ?? null;
const SAFE_URL = /^(https?:\/\/|\/(?!\/))/i;

export function htmlToBbcode(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'img', 'br', 'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'center', 'font', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'details', 'summary', 'small', 'mark'],
    allowedAttributes: { a: ['href'], img: ['src'], span: ['style'], div: ['style'], p: ['style'], font: ['color', 'size'] },
    allowedStyles: { '*': { color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.]+\)$/i, /^[a-z]+$/i], 'text-align': [/^(left|center|right)$/], 'font-weight': [/^(bold|[6-9]00)$/], 'font-style': [/^italic$/], 'font-size': [/^\d+(\.\d+)?px$/], 'text-decoration': [/^(underline|line-through)$/] } },
    allowedSchemes: ['http', 'https'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
  });

  // <details><summary>Titre</summary>… → [spoiler=Titre]… : le titre est repris dans un attribut pour la conversion balise par balise.
  const withSpoilers = clean.replace(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>/gi, (_m, t: string) => `<details title="${decode(t.replace(/<[^>]*>/g, '')).replace(/[\[\]"\n]/g, ' ').replace(/\s+/g, ' ').trim().replace(/&/g, '&amp;')}">`);

  let out = '';
  const stack: string[] = []; // texte de fermeture, dans l'ordre inverse
  let inPre = 0;
  for (const m of withSpoilers.matchAll(/<(\/?)([a-z0-9]+)((?:\s[^>]*)?)\/?>|([^<]+)/gi)) {
    if (m[4] !== undefined) {
      out += inPre ? m[4] : m[4].replace(/\s+/g, ' ');
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (closing) {
      // On ferme jusqu'à la balise correspondante : un HTML mal imbriqué ne doit pas laisser de BBCode ouvert.
      const idx = stack.map((s) => s.split('\u0001')[0]).lastIndexOf(tag);
      if (idx < 0) continue;
      while (stack.length > idx) {
        const [t, bb] = stack.pop()!.split('\u0001');
        out += bb;
        if (t === 'pre') inPre--;
      }
      continue;
    }
    const open = (bbOpen: string, bbClose: string) => { out += bbOpen; stack.push(`${tag}\u0001${bbClose}`); };
    switch (tag) {
      case 'br': out += '\n'; break;
      case 'hr': out += '\n[hr]\n'; break;
      case 'b': case 'strong': open('[b]', '[/b]'); break;
      case 'i': case 'em': open('[i]', '[/i]'); break;
      case 'u': open('[u]', '[/u]'); break;
      case 's': case 'strike': case 'del': open('[s]', '[/s]'); break;
      case 'center': open('\n[center]', '[/center]\n'); break;
      case 'blockquote': open('\n[quote]', '[/quote]\n'); break;
      case 'pre': inPre++; open('\n[code]', '[/code]\n'); break;
      case 'code': open('', ''); break;
      case 'ul': case 'ol': case 'table': case 'tbody': case 'thead': case 'tr': open('', '\n'); break;
      case 'li': open('• ', '\n'); break;
      case 'details': open(`\n[spoiler=${decode(attrOf(attrs, 'title') ?? '') || 'Dossier'}]\n`, '\n[/spoiler]\n'); break;
      case 'td': case 'th': open('', ' '); break;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': open('\n[b]', '[/b]\n\n'); break;
      case 'a': {
        const href = attrOf(attrs, 'href');
        if (href && SAFE_URL.test(decode(href))) open(`[url=${decode(href)}]`, '[/url]'); else open('', '');
        break;
      }
      case 'img': {
        const src = attrOf(attrs, 'src');
        if (src && SAFE_URL.test(decode(src))) out += `[img]${decode(src)}[/img]`;
        break;
      }
      case 'font': {
        const color = attrOf(attrs, 'color') ? toHex(attrOf(attrs, 'color')!) : null;
        const size = Number(attrOf(attrs, 'size'));
        const pairs: [string, string][] = [];
        if (size >= 1 && size <= 7) pairs.push([`[size=${size}]`, '[/size]']);
        if (color) pairs.push([`[color=${color}]`, '[/color]']);
        open(pairs.map((p) => p[0]).join(''), pairs.map((p) => p[1]).reverse().join(''));
        break;
      }
      case 'p': case 'div': case 'span': {
        const pairs: [string, string][] = [];
        const align = styleOf(attrs, 'text-align');
        const color = styleOf(attrs, 'color') ? toHex(styleOf(attrs, 'color')!) : null;
        if (align === 'center' || align === 'right') pairs.push([`[${align}]`, `[/${align}]`]);
        if (color) pairs.push([`[color=${color}]`, '[/color]']);
        if (/bold|[6-9]00/.test(styleOf(attrs, 'font-weight') ?? '')) pairs.push(['[b]', '[/b]']);
        if (styleOf(attrs, 'font-style') === 'italic') pairs.push(['[i]', '[/i]']);
        const px = /^(\d+(?:\.\d+)?)px$/.exec(styleOf(attrs, 'font-size') ?? '');
        if (px) pairs.push([`[size=${Math.min(7, Math.max(1, Math.round((Number(px[1]) - 8) / 4)))}]`, '[/size]']);
        const deco = styleOf(attrs, 'text-decoration') ?? '';
        if (deco.includes('underline')) pairs.push(['[u]', '[/u]']);
        if (deco.includes('line-through')) pairs.push(['[s]', '[/s]']);
        const block = tag !== 'span';
        open((block ? '\n' : '') + pairs.map((p) => p[0]).join(''), pairs.map((p) => p[1]).reverse().join('') + (block ? (tag === 'p' ? '\n\n' : '\n') : ''));
        break;
      }
      default: open('', '');
    }
  }
  while (stack.length) out += stack.pop()!.split('\u0001')[1];

  return decode(out)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\[spoiler=[^\]]*\])\n+/g, '$1\n')
    .replace(/\n+(\[\/spoiler\])/g, '\n$1')
    .trim();
}
