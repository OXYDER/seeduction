/**
 * Notifications push (application installable) : validation des abonnements envoyés par les navigateurs, contenu du message et limitation de fréquence. Logique pure (testée).
 */
export const MAX_SUBSCRIPTIONS = 5;

/** Les services de notification des navigateurs : le serveur n'envoie jamais rien ailleurs (sinon un abonnement piégé servirait à faire des requêtes vers le réseau interne). */
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/i, /(^|\.)push\.services\.mozilla\.com$/i, /(^|\.)push\.apple\.com$/i, /(^|\.)notify\.windows\.com$/i, /(^|\.)push\.mozilla\.org$/i];

export function validEndpoint(endpoint: unknown): string | null {
  if (typeof endpoint !== 'string' || endpoint.length > 1200) return null;
  let u: URL;
  try { u = new URL(endpoint); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  return PUSH_HOSTS.some((re) => re.test(u.hostname)) ? u.toString() : null;
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
export function validKeys(keys: any): { p256dh: string; auth: string } | null {
  const p256dh = String(keys?.p256dh ?? ''), auth = String(keys?.auth ?? '');
  if (!B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 120) return null; // clé publique P-256 non compressée (65 octets)
  if (!B64URL.test(auth) || auth.length < 16 || auth.length > 32) return null; // secret d'authentification (16 octets)
  return { p256dh, auth };
}

export interface PushPayload { title: string; body: string; url: string; tag: string; category?: string }

const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** Seuls les chemins du site sont permis comme destination d'un clic (jamais une adresse extérieure). */
export const safeUrl = (link: unknown): string => (typeof link === 'string' && /^\/(?!\/)[^\s]{0,300}$/.test(link) ? link : '/notifications');

export function buildPayload(n: { title: string; body?: string | null; link?: string | null; groupKey?: string | null; id?: string; category?: string }): PushPayload {
  return { title: clip(n.title, 80), body: clip(n.body, 140), url: safeUrl(n.link), tag: clip(n.groupKey || n.id || 'seeduction', 60), ...(n.category ? { category: n.category } : {}) };
}

/** Un même regroupement (ex. « nouveaux courriels ») ne fait sonner l'appareil qu'une fois par minute. */
export class PushThrottle {
  private last = new Map<string, number>();
  constructor(private windowMs = 60_000, private max = 2000) {}
  allow(key: string, now = Date.now()): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.windowMs) return false;
    if (this.last.size >= this.max) for (const [k, t] of this.last) if (now - t >= this.windowMs) this.last.delete(k);
    this.last.set(key, now);
    return true;
  }
}

/** Statut HTTP d'un abonnement qui n'existe plus : à supprimer. */
export const isGone = (status: number | undefined): boolean => status === 404 || status === 410;
