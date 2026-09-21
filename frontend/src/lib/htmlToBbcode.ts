/**
 * Sens inverse de bbcodeToHtml (voir lib/bbcode.ts) — traduit le HTML produit
 * par l'éditeur WYSIWYG (contentEditable + document.execCommand) en BBCode.
 * Ne gère que ce que la barre d'outils de l'éditeur peut produire ; tout le
 * reste est simplement déplié en texte (le collage est d'ailleurs forcé en
 * texte brut), pas de conversion HTML arbitraire.
 */
const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

function toHexColor(color: string): string | null {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(c)) return c;
  const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  if (/^[a-z]+$/.test(c)) return c;
  return null;
}

function sizeFromPx(px: string): number | null {
  const m = px.match(/^([\d.]+)px$/);
  if (!m) return null;
  return Math.min(7, Math.max(1, Math.round((parseFloat(m[1]) - 8) / 4)));
}

function wrap(inner: string, open: string, close: string): string {
  return inner.trim() ? `${open}${inner}${close}` : inner;
}

function hasAlignedAncestor(el: HTMLElement): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.style.textAlign === 'center' || p.style.textAlign === 'right') return true;
  }
  return false;
}

function plainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/ /g, ' ');
  if (node.nodeName === 'BR') return '\n';
  return Array.from(node.childNodes).map(plainText).join('');
}

function serializeChildren(parent: Node): string {
  let out = '';
  parent.childNodes.forEach((child) => {
    const isBlock = child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((child as HTMLElement).tagName);
    if (isBlock && out && !out.endsWith('\n')) out += '\n';
    out += serializeNode(child);
  });
  return out;
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/ /g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const inner = serializeChildren(el);

  switch (el.tagName) {
    case 'B':
    case 'STRONG':
      return wrap(inner, '[b]', '[/b]');
    case 'I':
    case 'EM':
      return wrap(inner, '[i]', '[/i]');
    case 'U':
      return wrap(inner, '[u]', '[/u]');
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return wrap(inner, '[s]', '[/s]');
    case 'A': {
      const href = el.getAttribute('href') ?? '';
      return /^(https?:\/\/|\/)/i.test(href) ? wrap(inner, `[url=${href}]`, '[/url]') : inner;
    }
    case 'IMG': {
      const src = el.getAttribute('src') ?? '';
      return /^(https?:\/\/|\/)/i.test(src) ? `[img]${src}[/img]` : '';
    }
    case 'BR':
      return '\n';
    case 'HR':
      return '[hr]\n';
    case 'FONT': {
      const color = el.getAttribute('color') ? toHexColor(el.getAttribute('color')!) : null;
      return color ? wrap(inner, `[color=${color}]`, '[/color]') : inner;
    }
    case 'SPAN': {
      let out = inner;
      const s = el.style;
      const color = s.color ? toHexColor(s.color) : null;
      const size = s.fontSize ? sizeFromPx(s.fontSize) : null;
      if (s.textDecoration.includes('line-through') || s.textDecorationLine.includes('line-through')) out = wrap(out, '[s]', '[/s]');
      if (s.textDecoration.includes('underline') || s.textDecorationLine.includes('underline')) out = wrap(out, '[u]', '[/u]');
      if (s.fontStyle === 'italic') out = wrap(out, '[i]', '[/i]');
      if (s.fontWeight === 'bold' || Number(s.fontWeight) >= 600) out = wrap(out, '[b]', '[/b]');
      if (size) out = wrap(out, `[size=${size}]`, '[/size]');
      if (color) out = wrap(out, `[color=${color}]`, '[/color]');
      return out;
    }
    case 'UL':
    case 'OL':
      return Array.from(el.children)
        .filter((c) => c.tagName === 'LI')
        .map((li) => `• ${serializeChildren(li).trim()}\n`)
        .join('');
    case 'LI':
      return `• ${inner.trim()}\n`;
    case 'BLOCKQUOTE':
      return `${wrap(inner.trim(), '[quote]', '[/quote]')}\n`;
    case 'PRE':
      return `[code]${plainText(el).replace(/\n+$/, '')}[/code]\n`;
    case 'DIV':
    case 'P':
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      if (el.style.display === 'inline-block') {
        return `${wrap(inner.replace(/\n+$/, ''), '[block]', '[/block]')}\n`;
      }
      const align = el.style.textAlign;
      let body = inner;
      if (align === 'center') body = wrap(inner, '[center]', '[/center]');
      else if (align === 'right') body = wrap(inner, '[right]', '[/right]');
      else if (align === 'left' && hasAlignedAncestor(el)) body = wrap(inner, '[left]', '[/left]');
      return body.endsWith('\n') ? body : `${body}\n`;
    }
    default:
      return inner;
  }
}

export function htmlToBbcode(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  return serializeChildren(container)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}
