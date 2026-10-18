/**
 * Dons automatiques : lecture des messages envoyés par Ko-fi et Buy Me a Coffee, et reconnaissance du membre dans le message du don (logique pure, sans base de données).
 *
 * La plateforme prévient le site à chaque don. Le membre est reconnu seulement quand son pseudo est écrit de façon claire (« @pseudo », « pseudo : xyz », ou un message qui ne contient que
 * le pseudo) : un pseudo qui ressemble à un mot courant dans une phrase ne suffit pas, le don attend alors la confirmation de l'équipe avec le pseudo probable.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type Provider = 'kofi' | 'bmc';
export interface ParsedDonation {
  provider: Provider;
  externalId: string;
  kind: 'donation' | 'subscription' | 'other';
  amount: number;
  currency: string;
  payerName: string;
  payerEmail: string;
  message: string;
  refunded: boolean;
  at: Date | null;
}

const str = (v: unknown, max = 200): string => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const num = (v: unknown): number => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const date = (v: unknown): Date | null => { const d = new Date(String(v ?? '')); return Number.isNaN(d.getTime()) ? null : d; };

const safeEqual = (a: string, b: string): boolean => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Ko-fi envoie un formulaire dont le champ `data` contient du JSON ; le jeton de vérification est dans ce JSON. */
export function parseKofi(body: any): { payload: any | null; token: string } {
  let data: any = body?.data ?? body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return { payload: null, token: '' }; } }
  if (!data || typeof data !== 'object') return { payload: null, token: '' };
  return { payload: data, token: str(data.verification_token, 200) };
}
export function kofiDonation(data: any): ParsedDonation | null {
  const id = str(data?.kofi_transaction_id || data?.message_id, 80);
  if (!id) return null;
  const type = str(data?.type, 30).toLowerCase();
  const kind: ParsedDonation['kind'] = type === 'donation' ? 'donation' : type === 'subscription' ? 'subscription' : 'other';
  return { provider: 'kofi', externalId: id, kind, amount: num(data?.amount), currency: str(data?.currency, 6).toUpperCase(), payerName: str(data?.from_name, 80), payerEmail: str(data?.email, 120), message: str(data?.message, 400), refunded: false, at: date(data?.timestamp) };
}

/** Buy Me a Coffee signe le corps de la requête (HMAC-SHA256, en hexadécimal) : on le recalcule avec le secret partagé. */
export function verifyBmcSignature(raw: Buffer | string | undefined, signature: string | undefined, secret: string): boolean {
  if (!raw || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const given = String(signature).trim().replace(/^sha256=/i, '').toLowerCase();
  return safeEqual(expected, given);
}
/** Le format exact de Buy Me a Coffee n'est pas figé dans notre documentation : on accepte `data` ou `response`, et plusieurs noms de champs. */
export function bmcDonation(body: any): ParsedDonation | null {
  const type = str(body?.type, 60).toLowerCase();
  const d = body?.data ?? body?.response ?? {};
  const id = str(d.id ?? d.payment_id ?? d.transaction_id ?? body?.event_id ?? body?.id, 80);
  if (!id) return null;
  const refunded = d.refunded === true || String(d.status ?? '').toLowerCase() === 'refunded' || type.includes('refund');
  const kind: ParsedDonation['kind'] = type.startsWith('donation') ? 'donation' : type.startsWith('membership') ? 'subscription' : 'other';
  return {
    provider: 'bmc', externalId: id, kind, amount: num(d.amount ?? d.total_amount ?? d.price), currency: str(d.currency, 6).toUpperCase(),
    payerName: str(d.supporter_name ?? d.payer_name ?? d.name, 80), payerEmail: str(d.supporter_email ?? d.payer_email ?? d.email, 120),
    message: str(d.supporter_message ?? d.support_note ?? d.message ?? d.note, 400), refunded, at: date(d.created_at ?? body?.created ?? d.created),
  };
}

export interface Match { username: string | null; certain: boolean }

/** Le pseudo écrit dans le message : « certain » (assez clair pour créditer tout seul) ou seulement probable. */
export function pseudoInMessage(message: string, exists: (name: string) => boolean): Match {
  const text = String(message ?? '').trim();
  if (!text) return { username: null, certain: false };
  const word = (s: string) => s.replace(/^[@\s"'«»(\[]+|[\s"'«»).,;:!?\]]+$/g, '');
  const labeled = /(?:pseudo|username|utilisateur|nom d['’]utilisateur|compte)\s*(?:seeduction)?\s*[:=\-–]?\s*@?([\p{L}\p{N}_.\-]{2,40})/iu.exec(text);
  if (labeled && exists(word(labeled[1]))) return { username: word(labeled[1]), certain: true };
  const mention = [...text.matchAll(/@([\p{L}\p{N}_.\-]{2,40})/gu)].map((m) => word(m[1])).filter(exists);
  if (new Set(mention.map((m) => m.toLowerCase())).size === 1) return { username: mention[0], certain: true };
  const only = word(text);
  if (/^[\p{L}\p{N}_.\-]{2,40}$/u.test(only) && exists(only)) return { username: only, certain: true };
  const words = [...new Set(text.split(/[^\p{L}\p{N}_.\-]+/u).map((w) => word(w)).filter((w) => w.length >= 3 && exists(w)))];
  if (words.length === 1) return { username: words[0], certain: false };
  return { username: null, certain: false };
}

/** Les mots d'un message qui pourraient être un pseudo (pour ne chercher que ceux-là dans la base). */
export function candidateNames(message: string): string[] {
  const out = new Set<string>();
  for (const w of String(message ?? '').split(/[^\p{L}\p{N}_.\-@]+/u)) { const t = w.replace(/^@+/, '').replace(/^[.\-]+|[.\-]+$/g, ''); if (t.length >= 2 && t.length <= 40) out.add(t.toLowerCase()); }
  return [...out].slice(0, 60);
}

/** Courriel partiellement masqué pour l'affichage à l'équipe (« ma***@gmail.com »). */
export function maskEmail(email: string): string {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) return '';
  return `${local.slice(0, 2)}***@${domain}`;
}
