/**
 * Affichage sûr d'un courriel reçu (logique pure). Un courriel est du contenu étranger : il peut contenir des scripts, des formulaires, des images espionnes (pixel de suivi qui dit à
 * l'expéditeur que tu as ouvert le message et d'où) ou des liens trompeurs. On ne garde que la mise en forme ordinaire ; les images venant d'Internet sont bloquées tant que l'utilisateur
 * ne les autorise pas ; les liens ne peuvent mener qu'à http, https ou mailto.
 */
import * as sanitizeHtml from 'sanitize-html';

export interface MailHtmlResult { html: string; remoteImages: number; blockedLinks: number }

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'ol', 'p', 'pre', 'q',
  's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'center',
];

/** Texte brut → HTML simple (échappé, sauts de ligne conservés, liens cliquables) quand le courriel n'a pas de version HTML. */
export function textToHtml(text: string): string {
  const esc = String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\bhttps?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\r?\n/g, '<br>');
}

/**
 * @param html          contenu HTML du courriel
 * @param allowImages   afficher les images venant d'Internet (sinon elles sont remplacées par un cadre)
 * @param inline        images intégrées au courriel (cid:xxx → données), toujours affichées
 */
export function sanitizeMailHtml(html: string, opts: { allowImages?: boolean; inline?: Record<string, string> } = {}): MailHtmlResult {
  let remoteImages = 0, blockedLinks = 0;
  const inline = opts.inline ?? {};
  const out = sanitizeHtml(String(html ?? ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'name', 'target', 'rel'], span: ['class', 'title'], img: ['src', 'alt', 'width', 'height', 'title', 'referrerpolicy'], td: ['colspan', 'rowspan', 'align', 'valign', 'width'], th: ['colspan', 'rowspan', 'align', 'valign', 'width'],
      table: ['width', 'border', 'cellpadding', 'cellspacing', 'align'], font: ['color', 'size'], '*': ['align', 'dir'],
    },
    allowedClasses: { span: ['blocked-image'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tag: string, attribs: any): any => {
        const href = String(attribs.href ?? '');
        if (!/^(https?:|mailto:|#)/i.test(href)) { blockedLinks++; const { href: _h, ...rest } = attribs; return { tagName: 'span', attribs: rest }; }
        return { tagName: 'a', attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } };
      },
      img: (tag: string, attribs: any): any => {
        const src = String(attribs.src ?? '');
        const cid = /^cid:(.+)$/i.exec(src)?.[1];
        if (cid && inline[cid]) return { tagName: 'img', attribs: { ...attribs, src: inline[cid] } };
        if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return { tagName: 'img', attribs: { ...attribs, src } };
        if (/^https?:\/\//i.test(src)) {
          remoteImages++;
          if (opts.allowImages) return { tagName: 'img', attribs: { alt: attribs.alt ?? '', src, width: attribs.width ?? '', height: attribs.height ?? '', referrerpolicy: 'no-referrer' } };
          return { tagName: 'span', attribs: { class: 'blocked-image', title: String(attribs.alt ?? '').slice(0, 120) } }; // le cadre est dessiné par la feuille de style de l'affichage
        }
        return { tagName: 'span', attribs: {} };
      },
    },
  });
  return { html: out, remoteImages, blockedLinks };
}

/** Version texte d'un courriel qui n'a que du HTML (pour citer dans une réponse). */
export function htmlToText(html: string): string {
  const spaced = String(html ?? '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<(br|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const plain = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  return plain.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Adresse de la forme « Nom <a@b.c> » ou « a@b.c » → { name, address } (adresse en minuscules), ou null si invalide. */
export function parseAddress(raw: string): { name: string; address: string } | null {
  const s = String(raw ?? '').trim();
  const m = /^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/.exec(s) ?? /^()([^<>\s,;]+@[^<>\s,;]+)$/.exec(s);
  if (!m) return null;
  const address = m[2].toLowerCase();
  if (!/^[^\s@"<>(),;:\\]+@[^\s@"<>(),;:\\]+\.[^\s@"<>(),;:\\]{2,}$/.test(address) || address.length > 254) return null;
  return { name: (m[1] ?? '').trim().slice(0, 100), address };
}

/** Liste d'adresses séparées par des virgules ou des points-virgules ; renvoie les adresses valides et celles qui ne le sont pas. */
export function parseAddressList(raw: string | string[] | undefined | null): { ok: { name: string; address: string }[]; bad: string[] } {
  const parts = (Array.isArray(raw) ? raw.join(',') : String(raw ?? '')).split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean);
  const ok: { name: string; address: string }[] = [], bad: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) { const a = parseAddress(p); if (!a) bad.push(p.slice(0, 80)); else if (!seen.has(a.address)) { seen.add(a.address); ok.push(a); } }
  return { ok, bad };
}

/** Empêche l'injection d'en-têtes (retours à la ligne dans un sujet ou un nom). */
export const headerSafe = (s: string, max = 300): string => String(s ?? '').replace(/[\r\n\u0000]+/g, ' ').trim().slice(0, max);

/** « Re: » ou « Fwd: » ajoutés une seule fois. */
export function prefixSubject(subject: string, prefix: 'Re' | 'Fwd'): string {
  const s = headerSafe(subject);
  return new RegExp(`^${prefix}\\s*:`, 'i').test(s) ? s : `${prefix}: ${s}`;
}
