import { htmlToBbcode, looksLikeHtml } from './html-to-bbcode';
import { looksLikeBbcode, looksLikeMarkdown, markdownToBbcode } from './markdown-to-bbcode';

export type DescriptionFormat = 'bbcode' | 'html' | 'markdown' | 'text';

const ALIASES: Record<string, DescriptionFormat> = { bbcode: 'bbcode', bb: 'bbcode', html: 'html', markdown: 'markdown', md: 'markdown', text: 'text', txt: 'text', plain: 'text' };

/**
 * Une description envoyée par l'API, dans le format que l'envoyeur a sous la main, ramenée au BBCode du site.
 * `format` (descriptionFormat) force le choix : bbcode, html, markdown (md) ou text ; sans lui, le format est reconnu tout seul
 * (BBCode d'abord, puis HTML, puis Markdown ; sinon le texte reste tel quel).
 */
export function descriptionToBbcode(text: string | undefined | null, format?: string | null): string | undefined {
  if (text === undefined || text === null) return undefined;
  const wanted = ALIASES[String(format ?? '').trim().toLowerCase()];
  const kind: DescriptionFormat = wanted ?? (looksLikeBbcode(text) ? 'bbcode' : looksLikeHtml(text) ? 'html' : looksLikeMarkdown(text) ? 'markdown' : 'text');
  if (kind === 'html') return htmlToBbcode(text);
  if (kind === 'markdown') return markdownToBbcode(text);
  return text;
}
