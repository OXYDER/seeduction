import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Preview { url: string; title: string | null; description: string | null; siteName: string | null }
const cache = new Map<string, Preview | null>();
const TRAILING = /[.,;:!?)\]}»"']+$/;

/** Première adresse externe d'un message (hors images, GIF et liens du site lui-même). */
export function firstExternalUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<]+/gi)) {
    const url = m[0].replace(TRAILING, '');
    try {
      const u = new URL(url);
      if (u.host === window.location.host) continue;
      if (/\.(?:png|jpe?g|gif|webp|bmp|mp4|webm|mp3|ogg|wav|zip|rar|7z|torrent)(?:$|\?)/i.test(u.pathname)) continue;
      return url;
    } catch { /* adresse invalide : on passe à la suivante */ }
  }
  return null;
}

/** Aperçu d'un lien collé dans un message : nom du site, titre et description (sans image ; chargé par le serveur, pas par ton navigateur). */
export default function LinkPreviewCard({ url }: { url: string }) {
  const [p, setP] = useState<Preview | null | undefined>(cache.has(url) ? cache.get(url) : undefined);
  useEffect(() => {
    if (cache.has(url)) { setP(cache.get(url)); return; }
    let cancelled = false;
    api.get('/messenger/link-preview', { params: { url } })
      .then((r) => { const v = r.data?.title || r.data?.description ? (r.data as Preview) : null; cache.set(url, v); if (!cancelled) setP(v); })
      .catch(() => { cache.set(url, null); if (!cancelled) setP(null); });
    return () => { cancelled = true; };
  }, [url]);
  if (!p) return null;
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* adresse déjà validée côté serveur */ }
  return (
    <a className="msgr-link-card" href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
      <span className="msgr-link-site">🔗 {p.siteName ?? host}</span>
      {p.title && <span className="msgr-link-title">{p.title}</span>}
      {p.description && <span className="msgr-link-desc">{p.description}</span>}
    </a>
  );
}
