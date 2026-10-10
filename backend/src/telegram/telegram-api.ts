import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Erreur renvoyée par l'API Telegram (ou réseau) : `code` = code HTTP / Telegram, `retryAfter` en secondes quand Telegram demande de ralentir. */
export class TelegramError extends Error {
  constructor(message: string, public code = 0, public retryAfter = 0) { super(message); }
}

const BASE = () => (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/+$/, '');

/**
 * Client minimal de l'API des robots Telegram. Seul `api.telegram.org` est contacté (adresse fixe, jamais fournie par un membre) ;
 * TELEGRAM_API_BASE ne sert qu'aux tests (faux serveur Telegram).
 */
export class TelegramApi {
  constructor(private token: string) {}

  async call<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE()}/bot${this.token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: ctrl.signal,
      });
      let json: any = null;
      try { json = await res.json(); } catch { /* corps vide ou non JSON */ }
      if (!json?.ok) throw new TelegramError(String(json?.description ?? `HTTP ${res.status}`), Number(json?.error_code ?? res.status), Number(json?.parameters?.retry_after ?? 0));
      return json.result as T;
    } catch (e: any) {
      if (e instanceof TelegramError) throw e;
      throw new TelegramError(e?.name === 'AbortError' ? 'Telegram ne répond pas (délai dépassé)' : `Telegram injoignable : ${e?.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  getMe() { return this.call<{ id: number; username?: string; first_name: string }>('getMe'); }

  /** Attente longue : `timeout` s côté Telegram, avec une marge côté réseau. */
  getUpdates(offset: number | undefined, timeout: number) {
    return this.call<any[]>('getUpdates', { offset, timeout, allowed_updates: ['message', 'edited_message', 'my_chat_member'] }, (timeout + 10) * 1000);
  }

  sendMessage(chatId: string, text: string, extra: Record<string, unknown> = {}) {
    return this.call<{ message_id: number }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  }

  sendPhoto(chatId: string, url: string, caption: string, extra: Record<string, unknown> = {}) {
    return this.call<{ message_id: number }>('sendPhoto', { chat_id: chatId, photo: url, caption, parse_mode: 'HTML', ...extra });
  }

  sendAnimation(chatId: string, url: string, caption: string, extra: Record<string, unknown> = {}) {
    return this.call<{ message_id: number }>('sendAnimation', { chat_id: chatId, animation: url, caption, parse_mode: 'HTML', ...extra });
  }

  editMessageText(chatId: string, messageId: number, text: string) {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  }

  deleteMessage(chatId: string, messageId: number) { return this.call('deleteMessage', { chat_id: chatId, message_id: messageId }); }

  getChat(chatId: string) { return this.call<{ id: number; title?: string; type: string }>('getChat', { chat_id: chatId }); }

  /** Télécharge un fichier envoyé sur Telegram (photo) : 10 Mo maximum. */
  async downloadFile(fileId: string): Promise<Buffer> {
    const info = await this.call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
    if (!info.file_path) throw new TelegramError('Fichier indisponible');
    if ((info.file_size ?? 0) > 10 * 1024 * 1024) throw new TelegramError('Fichier trop volumineux');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(`${BASE()}/file/bot${this.token}/${info.file_path}`, { signal: ctrl.signal });
      if (!res.ok) throw new TelegramError(`Téléchargement refusé (HTTP ${res.status})`, res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 10 * 1024 * 1024) throw new TelegramError('Fichier trop volumineux');
      return buf;
    } catch (e: any) {
      if (e instanceof TelegramError) throw e;
      throw new TelegramError(`Téléchargement impossible : ${e?.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---- jeton du robot : chiffré en base (AES-256-GCM), comme les mots de passe de l'import ----
const key = () => createHash('sha256').update('seeduction-telegram:' + (process.env.JWT_SECRET ?? 'change-me-in-.env')).digest();

export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function openToken(blob: string): string {
  if (!blob) return '';
  try {
    const raw = Buffer.from(blob, 'base64');
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return ''; // JWT_SECRET changé : le jeton est à ressaisir
  }
}

/** Forme d'un jeton de robot : « 123456789:AA… » (validé avant tout appel réseau). */
export const TOKEN_FORMAT = /^\d{5,15}:[\w-]{30,60}$/;
