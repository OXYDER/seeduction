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
 * Même conversion que le backend (voir backend/src/common/utils/bbcode.ts) —
 * utilisée pour afficher une description générée (fiches torrent, forum)
 * sans jamais faire confiance au texte source : tout est échappé avant la
 * conversion des balises BBCode elles-mêmes.
 */
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
