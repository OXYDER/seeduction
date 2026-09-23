/**
 * Le BBCode est le format canonique stocké pour un template. Markdown/HTML/
 * texte brut sont dérivés à la volée à l'export — jamais persistés — pour
 * qu'un seul contenu de template reste la source de vérité.
 */

const VARIABLE_PATTERN = /\{([a-zA-Zà-ÿÀ-ß_]+)\}/g;

/** Liste les noms de variables `{xxx}` présentes dans un template, sans doublons. */
export function extractVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

function normalizeKey(key: string) {
  return key
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Remplace chaque `{variable}` par sa valeur (recherche insensible aux accents/casse). */
export function fillVariables(content: string, values: Record<string, string>): string {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [normalizeKey(k), v]));
  return content.replace(VARIABLE_PATTERN, (_, name) => normalized.get(normalizeKey(name)) ?? '');
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

/** BBCode -> HTML sécurisé (le texte hors balises est échappé avant conversion des balises). */
export function bbcodeToHtml(bbcode: string): string {
  let html = escapeHtml(bbcode);

  // Listes à puces : lignes consécutives "• xxx" regroupées dans un <ul>.
  html = html.replace(/(?:^• .*(?:\n|$))+/gm, (block) =>
    `<ul>${block.replace(/\n$/, '').split('\n').map((l) => `<li>${l.slice(2)}</li>`).join('')}</ul>`,
  );

  for (const align of ['center', 'right', 'left']) {
    html = replacePairs(html, align, (inner) => `<div style="text-align:${align}">${inner}</div>`);
  }
  // Bloc centré dont les lignes restent alignées à gauche entre elles (ex : "Année : 2025" / "Catégorie : Films").
  html = replacePairs(html, 'block', (inner) => `<span style="display:inline-block;width:460px;max-width:100%;text-align:left;vertical-align:top">${inner.replace(/^\n+|\n+$/g, '')}</span>`);
  // Dossier repliable : [spoiler=Titre]...[/spoiler] -> <details> (le + / - est dessiné en CSS).
  html = replacePairs(html, 'spoiler', (inner, title) => `<details><summary>${title}</summary>${inner.replace(/^\n+|\n+$/g, '')}</details>`, '[^\\]\\[]+');
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
    // Un saut de ligne juste après un bloc est déjà rendu par le bloc lui-même.
    .replace(/(<\/div>|<\/blockquote>|<\/pre>|<\/details>|<hr \/>)\n/g, '$1')
    .replace(/\n/g, '<br />');
}

const HEADER_LINE = /^\s*\[b\](?:\[color=[^\]]+\])?[^\[\]{}]+(?:\[\/color\])?\[\/b\]\s*$/i;
const LABEL_THEN_VAR = /:\s*(?:\[\/[a-z]+\])*\s*\{[^{}]+\}\s*(?:\[\/[a-z]+\])*\s*$/i;

/**
 * Retire d'un modèle les lignes dont la valeur est vide ("Source : {source}"
 * sans source, ou une ligne "{description}" sans description) puis les titres de
 * section qui se retrouvent sans contenu — pour qu'une présentation ne montre
 * jamais de champs vides.
 */
export function pruneEmptyLines(content: string, values: Record<string, string>): string {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [normalizeKey(k), v]));
  const isEmpty = (name: string) => !(normalized.get(normalizeKey(name)) ?? '').trim();

  const kept = content.split('\n').filter((line) => {
    const vars = [...line.matchAll(VARIABLE_PATTERN)].map((m) => m[1]);
    if (vars.length === 0 || !vars.every(isEmpty)) return true;
    const onlyPlaceholders = line.replace(VARIABLE_PATTERN, '').replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, '').replace(/[\s•]/g, '') === '';
    return !(onlyPlaceholders || LABEL_THEN_VAR.test(line));
  });

  const lines = kept.join('\n').replace(/\[block\]\s*\[\/block\]\n?/gi, '').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_LINE.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length || HEADER_LINE.test(lines[j])) continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** BBCode -> Markdown (best-effort ; les balises sans équivalent direct sont simplement retirées). */
export function bbcodeToMarkdown(bbcode: string): string {
  return bbcode
    .replace(/\[\/?(?:center|right|left|block|u)\]/gi, '')
    .replace(/\[color=[^\]]*\]|\[\/color\]/gi, '')
    .replace(/\[size=\d+\]|\[\/size\]/gi, '**')
    .replace(/\[\/?b\]/gi, '**')
    .replace(/\[\/?i\]/gi, '_')
    .replace(/\[\/?s\]/gi, '~~')
    .replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (_, inner: string) => inner.trim().split('\n').map((l) => `> ${l}`).join('\n'))
    .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '```\n$1\n```')
    .replace(/\[spoiler=([^\]]*)\]/gi, '**$1**\n')
    .replace(/\[\/spoiler\]/gi, '')
    .replace(/\[hr\]/gi, '\n---\n')
    .replace(/\[url=(.*?)\]([\s\S]*?)\[\/url\]/gi, '[$2]($1)')
    .replace(/\[img\](.*?)\[\/img\]/gi, '![]($1)')
    .replace(/^• (.*)$/gm, '- $1');
}

/** BBCode -> texte brut (toutes les balises retirées). */
export function bbcodeToText(bbcode: string): string {
  return bbcode.replace(/\[\/?[a-z]+(=[^\]]*)?\]/gi, '');
}

export function renderAllFormats(bbcode: string) {
  return {
    bbcode,
    markdown: bbcodeToMarkdown(bbcode),
    html: bbcodeToHtml(bbcode),
    text: bbcodeToText(bbcode),
  };
}
