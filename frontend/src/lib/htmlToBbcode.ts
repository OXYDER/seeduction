/**
 * Sens inverse de bbcodeToHtml (voir lib/bbcode.ts) — traduit le HTML produit
 * par l'éditeur WYSIWYG (contentEditable + document.execCommand) en BBCode.
 * Ne gère que les balises que la barre d'outils de l'éditeur peut produire ;
 * tout le reste est simplement déplié en texte (pas de round-trip HTML
 * arbitraire à supporter, seulement ce que l'éditeur génère lui-même).
 */
function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(serializeNode).join('');

  switch (el.tagName) {
    case 'B':
    case 'STRONG':
      return `[b]${inner}[/b]`;
    case 'I':
    case 'EM':
      return `[i]${inner}[/i]`;
    case 'U':
      return `[u]${inner}[/u]`;
    case 'A':
      return `[url=${el.getAttribute('href') ?? ''}]${inner}[/url]`;
    case 'IMG':
      return `[img]${el.getAttribute('src') ?? ''}[/img]`;
    case 'BR':
      return '\n';
    case 'DIV':
    case 'P': {
      const body = el.style.textAlign === 'center' ? `[center]${inner}[/center]` : inner;
      return `${body}\n`;
    }
    default:
      return inner;
  }
}

export function htmlToBbcode(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.childNodes)
    .map(serializeNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}
