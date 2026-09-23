const VARIABLE_PATTERN = /\{([a-zA-Zà-ÿÀ-ß_]+)\}/g;

/** Miroir de l'extraction côté backend, pour réagir en direct aux modifs du mode expert sans aller-retour serveur. */
export function extractVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Applique `render` sur chaque paire [tag]...[/tag] en commençant par les plus
 * internes, pour qu'un même tag imbriqué dans lui-même (ex : [center] dans un
 * [center]) soit converti correctement au lieu de laisser des balises orphelines.
 */
function replacePairs(text: string, tag: string, render: (inner: string, arg?: string) => string, argPattern?: string): string {
  const open = argPattern ? `\\[${tag}=(${argPattern})\\]` : `\\[${tag}\\]`;
  const re = new RegExp(`${open}((?:(?!\\[${tag}[\\]=])[\\s\\S])*?)\\[\\/${tag}\\]`, 'gi');
  let out = text;
  for (let i = 0; i < 20; i++) {
    const next = out.replace(re, (...m: any[]) => (argPattern ? render(m[2], m[1]) : render(m[1])));
    if (next === out) break;
    out = next;
  }
  return out;
}

// Seules les URL http(s) et les chemins du site sont autorisés (pas de javascript:).
const SAFE_URL = '(?:https?:\\/\\/|\\/)[^\\]\\s]*';

/**
 * Même conversion que le backend (voir backend/src/common/utils/bbcode.ts) —
 * utilisée pour afficher une description (fiches torrent) et pour charger le
 * contenu dans l'éditeur WYSIWYG, sans jamais faire confiance au texte source :
 * tout est échappé avant la conversion des balises BBCode elles-mêmes.
 */
export function bbcodeToHtml(bbcode: string): string {
  let html = escapeHtml(bbcode);

  html = html.replace(/(?:^• .*(?:\n|$))+/gm, (block) =>
    `<ul>${block.replace(/\n$/, '').split('\n').map((l) => `<li>${l.slice(2)}</li>`).join('')}</ul>`,
  );

  for (const align of ['center', 'right', 'left']) {
    html = replacePairs(html, align, (inner) => `<div style="text-align:${align}">${inner}</div>`);
  }
  html = replacePairs(html, 'block', (inner) => `<span style="display:inline-block;width:460px;max-width:100%;text-align:left;vertical-align:top">${inner.replace(/^\n+|\n+$/g, '')}</span>`);
  // Dossier repliable : [spoiler=Titre]...[/spoiler] -> <details> (le + / - est dessiné en CSS).
  html = replacePairs(html, 'spoiler', (inner, title) => `<details><summary>${title}</summary><div class="spoiler-body">${inner.replace(/^\n+|\n+$/g, '')}</div></details>`, '[^\\]\\[]+');
  html = replacePairs(html, 'quote', (inner) => `<blockquote>${inner}</blockquote>`);
  html = replacePairs(html, 'code', (inner) => `<pre>${inner}</pre>`);
  html = replacePairs(html, 'size', (inner, n) => `<span style="font-size:${Math.min(Number(n), 7) * 4 + 8}px">${inner}</span>`, '\\d+');
  html = replacePairs(html, 'color', (inner, c) => `<span style="color:${c}">${inner}</span>`, '#[0-9a-fA-F]{3,8}|[a-zA-Z]+');
  html = replacePairs(html, 'b', (inner) => `<strong>${inner}</strong>`);
  html = replacePairs(html, 'i', (inner) => `<em>${inner}</em>`);
  html = replacePairs(html, 'u', (inner) => `<u>${inner}</u>`);
  html = replacePairs(html, 's', (inner) => `<s>${inner}</s>`);
  html = replacePairs(html, 'url', (inner, href) => `<a href="${href}" rel="noopener noreferrer" target="_blank">${inner}</a>`, SAFE_URL);

  return html
    .replace(new RegExp(`\\[img\\](${SAFE_URL})\\[\\/img\\]`, 'gi'), '<img src="$1" alt="" />')
    .replace(/\[hr\]/gi, '<hr />')
    .replace(/(<\/div>|<\/blockquote>|<\/pre>|<\/details>|<hr \/>)\n/g, '$1')
    .replace(/\n/g, '<br />');
}
