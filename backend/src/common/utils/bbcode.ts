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

/** BBCode -> HTML sécurisé (le texte hors balises est échappé avant conversion des balises). */
export function bbcodeToHtml(bbcode: string): string {
  const escaped = escapeHtml(bbcode);
  return escaped
    .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, '<div style="text-align:center">$1</div>')
    .replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi, (_, n, inner) => `<span style="font-size:${Math.min(Number(n), 7) * 4 + 8}px">${inner}</span>`)
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
    .replace(/\[url=(.*?)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" rel="noopener noreferrer">$2</a>')
    .replace(/\[img\](.*?)\[\/img\]/gi, '<img src="$1" alt="" />')
    .replace(/^• (.*)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br />');
}

/** BBCode -> Markdown (best-effort ; les balises sans équivalent direct sont simplement retirées). */
export function bbcodeToMarkdown(bbcode: string): string {
  return bbcode
    .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, '$1')
    .replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi, '**$1**')
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '_$1_')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '$1')
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
