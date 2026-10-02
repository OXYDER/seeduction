import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';

export interface GifItem {
  id: string;
  title: string;
  /** Aperçu léger (grille de recherche). */
  preview: string;
  /** Fichier envoyé dans le message. */
  url: string;
  width: number;
  height: number;
}

export const KLIPY_MEDIA = /^https:\/\/static\.klipy\.com\/[\w./-]+$/;

/**
 * Recherche de GIF et d'autocollants via Klipy (https://klipy.com). La clé d'API reste sur le serveur (KLIPY_API_KEY dans
 * backend/.env) : les membres passent par nous, et le navigateur ne charge que les images (static.klipy.com).
 * Les réponses sont gardées 5 minutes en mémoire pour ménager le quota.
 */
@Injectable()
export class MessengerGifsService {
  private log = new Logger('MessengerGifs');
  private cache = new Map<string, { at: number; value: { items: GifItem[]; hasNext: boolean } }>();
  private readonly ttlMs = 5 * 60 * 1000;

  enabled() { return !!process.env.KLIPY_API_KEY; }

  async search(userId: string, kind: 'gifs' | 'stickers', q: string, page: number, perPage = 24) {
    const key = process.env.KLIPY_API_KEY;
    if (!key) throw new ServiceUnavailableException("La recherche de GIF n'est pas activée sur ce site");
    q = q.trim().slice(0, 60);
    const cacheKey = `${kind}|${q.toLowerCase()}|${page}|${perPage}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;

    const params = new URLSearchParams({
      page: String(page), per_page: String(perPage), locale: 'fr',
      // Identifiant anonyme et stable du membre (Klipy le demande pour ses recommandations) : jamais son vrai id.
      customer_id: createHash('sha256').update(`seeduction:${userId}`).digest('hex').slice(0, 24),
    });
    if (q) params.set('q', q);
    let res: Response;
    try {
      res = await fetch(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${kind}/${q ? 'search' : 'trending'}?${params}`, { signal: AbortSignal.timeout(8000) });
    } catch (err: any) {
      this.log.warn(`Klipy injoignable : ${err?.message}`);
      throw new BadGatewayException('Le service de GIF ne répond pas');
    }
    if (!res.ok) {
      this.log.warn(`Klipy a répondu ${res.status}`);
      throw new BadGatewayException('Le service de GIF a refusé la requête');
    }
    const json: any = await res.json().catch(() => null);
    const rows: any[] = json?.data?.data ?? [];
    const items: GifItem[] = [];
    for (const r of rows) {
      const md = r?.file?.md ?? r?.file?.hd;
      const sm = r?.file?.sm ?? md;
      const url = md?.gif?.url;
      const preview = sm?.webp?.url ?? sm?.gif?.url ?? url;
      if (!url || !preview || !KLIPY_MEDIA.test(url) || !KLIPY_MEDIA.test(preview)) continue;
      items.push({ id: String(r.id), title: String(r.title ?? ''), preview, url, width: md.gif.width ?? 200, height: md.gif.height ?? 200 });
    }
    const value = { items, hasNext: !!json?.data?.has_next };
    this.cache.set(cacheKey, { at: Date.now(), value });
    if (this.cache.size > 300) for (const k of [...this.cache.keys()].slice(0, 100)) this.cache.delete(k);
    return value;
  }
}
