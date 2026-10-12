import { BadRequestException, Injectable } from '@nestjs/common';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';

export interface LinkPreview { url: string; title: string | null; description: string | null; siteName: string | null }

const MAX_BYTES = 400_000;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const TTL_MS = 6 * 3_600_000;
const NEGATIVE_TTL_MS = 10 * 60_000;

/** Adresse IPv4 / IPv6 publique ? (jamais une adresse privée, locale, de bouclage ou réservée : on ne laisse pas le serveur être utilisé pour atteindre le réseau interne). */
export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && ip.split('.')[2] === '0'))) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicIp(mapped[1]);
    if (v === '::' || v === '::1' || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('ff')) return false;
    return true;
  }
  return false;
}

/** Entités HTML nommées les plus courantes dans les titres français. */
const NAMED: Record<string, string> = {
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yuml: 'ÿ',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', Icirc: 'Î', Ocirc: 'Ô', Ugrave: 'Ù', oelig: 'œ', OElig: 'Œ',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€', times: '×', deg: '°',
};
const decode = (s: string) => s
  .replace(/&([A-Za-z]+);/g, (m, n) => NAMED[n] ?? m)
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_m, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ''; })
  .replace(/\s+/g, ' ').trim();

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${key}["']`, 'i');
    const m = re1.exec(html) ?? re2.exec(html);
    if (m && decode(m[1])) return decode(m[1]);
  }
  return null;
}

/** Titre, description et nom du site d'une page web, lus dans sa balise <title> et ses balises Open Graph. */
export function parsePreview(html: string, url: string): LinkPreview {
  const head = html.slice(0, MAX_BYTES);
  const title = metaContent(head, ['og:title', 'twitter:title']) ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)![1]) : null);
  const description = metaContent(head, ['og:description', 'twitter:description', 'description']);
  const siteName = metaContent(head, ['og:site_name']);
  return { url, title: title ? title.slice(0, 140) : null, description: description ? description.slice(0, 240) : null, siteName: siteName ? siteName.slice(0, 60) : null };
}

/**
 * Aperçu d'un lien collé dans le chat (titre, description, nom du site ; jamais d'image, pour ne pas faire charger de contenu externe aux lecteurs).
 * Le serveur va chercher la page lui-même, avec des garde-fous : http(s) seulement, ports 80 et 443, adresse résolue vérifiée publique ET utilisée telle quelle pour
 * la connexion (pas de redirection vers le réseau interne, pas de « DNS rebinding »), 5 s, 400 Ko, pages HTML seulement, 3 redirections au plus.
 */
@Injectable()
export class LinkPreviewService {
  private cache = new Map<string, { at: number; value: LinkPreview | null }>();
  private hits = new Map<string, number[]>();

  /** 30 aperçus par minute et par membre. */
  private allow(userId: string) {
    const now = Date.now();
    const list = (this.hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= 30) return false;
    list.push(now);
    this.hits.set(userId, list);
    return true;
  }

  async preview(userId: string, raw: string, ownHost?: string): Promise<LinkPreview | null> {
    let url: URL;
    try { url = new URL(String(raw ?? '').slice(0, 800)); } catch { throw new BadRequestException('Adresse invalide'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BadRequestException('Adresse invalide');
    if (ownHost && url.host === ownHost) return null; // les liens du site ont déjà leur propre affichage
    url.hash = '';
    const key = url.toString();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < (hit.value ? TTL_MS : NEGATIVE_TTL_MS)) return hit.value;
    if (!this.allow(userId)) throw new BadRequestException('Trop d\'aperçus demandés : patiente un instant');
    let value: LinkPreview | null = null;
    try {
      const html = await this.fetchHtml(url, 0);
      value = html ? parsePreview(html, key) : null;
      if (value && !value.title && !value.description) value = null;
    } catch { value = null; }
    if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async fetchHtml(url: URL, depth: number): Promise<string | null> {
    // LINK_PREVIEW_ALLOW_PRIVATE=1 : réservé aux tests automatiques (serveur local) ; jamais en production.
    const testing = process.env.LINK_PREVIEW_ALLOW_PRIVATE === '1';
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (!testing && port !== 80 && port !== 443) return null;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.promises.lookup(host, { all: true });
    if (addrs.length === 0 || (!testing && !addrs.every((a) => isPublicIp(a.address)))) return null;
    const chosen = addrs[0];
    const lib = url.protocol === 'https:' ? https : http;

    return new Promise<string | null>((resolve) => {
      const req = lib.request(
        {
          host, port, path: `${url.pathname}${url.search}`, method: 'GET', timeout: TIMEOUT_MS, servername: host,
          headers: { 'User-Agent': 'SeeductionLinkPreview/1.0 (+aperçu de lien)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fr,en;q=0.7', Host: url.host },
          // La connexion se fait vers l'adresse déjà vérifiée : elle ne peut pas changer entre la vérification et la connexion.
          lookup: ((_h: string, opts: any, cb: any) => (opts?.all ? cb(null, [{ address: chosen.address, family: chosen.family }]) : cb(null, chosen.address, chosen.family))) as any,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (depth >= MAX_REDIRECTS) return resolve(null);
            let next: URL;
            try { next = new URL(res.headers.location, url); } catch { return resolve(null); }
            if (next.protocol !== 'http:' && next.protocol !== 'https:') return resolve(null);
            this.fetchHtml(next, depth + 1).then(resolve).catch(() => resolve(null));
            return;
          }
          const type = String(res.headers['content-type'] ?? '');
          if (status < 200 || status >= 300 || !/text\/html|application\/xhtml/i.test(type)) { res.resume(); return resolve(null); }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            chunks.push(c);
            if (size >= MAX_BYTES) { res.destroy(); resolve(Buffer.concat(chunks).toString('utf8')); }
          });
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', () => resolve(chunks.length ? Buffer.concat(chunks).toString('utf8') : null));
        },
      );
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });
  }
}
