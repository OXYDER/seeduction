// Mise en forme et lecture des messages Telegram : fonctions pures (aucun accès réseau ni base), testées à part.

export const MAX_TEXT = 4000;

export const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
/** Texte brut d'un contenu BBCode (nouvelles, freeleech) : balises retirées, espaces réduits. */
export const plainText = (t: string) => (t ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
export const siteBase = () => (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const link = (url: string, label: string) => `<a href="${escapeHtml(url).replace(/"/g, '&quot;')}">${escapeHtml(label)}</a>`;

const when = (d: Date | string) => new Date(d).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: process.env.TELEGRAM_TZ ?? 'America/Toronto' });

// ------------------------------------------------------------------ Seeduction → Telegram

export interface OutMessage { kind: 'text' | 'photo' | 'animation'; text: string; mediaUrl?: string }

interface MsgLike {
  type: string;
  content: string;
  sender: { username: string };
  imageUrl?: string | null;
  fileName?: string | null;
  torrent?: { id: string; adult: boolean; name?: string } | null;
}

/**
 * Message de Seeduction tel qu'il apparaît sur Telegram : « Pseudo : texte ». Un torrent adulte n'est jamais détaillé (ni son nom ni son lien),
 * les fichiers et vocaux ne sont pas copiés (ils restent sur Seeduction), les images et GIF le sont quand l'adresse du site est publique (https).
 */
export function outboundMessage(m: MsgLike, site = siteBase()): OutMessage {
  const head = `<b>${escapeHtml(m.sender.username)}</b>`;
  let body = m.content ?? '';
  const t = m.torrent;
  if (t?.adult) body = body.replace(new RegExp(`\\S*${t.id}\\S*`, 'gi'), '').trim();
  let extra = '';
  if (t) extra = t.adult ? '\n🔞 Contenu adulte, à voir sur Seeduction' : `\n🎬 ${escapeHtml(t.name ?? 'Torrent')}${site ? ` — ${escapeHtml(`${site}/torrents/${t.id}`)}` : ''}`;
  const text = body ? `${head} : ${escapeHtml(body)}` : head;

  if ((m.type === 'IMAGE' || m.type === 'GIF') && m.imageUrl) {
    const local = m.imageUrl.startsWith('/');
    const url = local ? (site.startsWith('https://') ? site + m.imageUrl : '') : m.imageUrl;
    if (url) return { kind: m.type === 'GIF' ? 'animation' : 'photo', mediaUrl: url, text: cut(text + extra, 1000) };
    return { kind: 'text', text: cut(`${text}\n📷 Image à voir sur Seeduction${extra}`, MAX_TEXT) };
  }
  if (m.type === 'FILE') return { kind: 'text', text: cut(`${text}\n📎 ${escapeHtml(m.fileName ?? 'Fichier')} (à ouvrir sur Seeduction)${extra}`, MAX_TEXT) };
  if (m.type === 'VOICE') return { kind: 'text', text: `${head}\n🎤 Message vocal (à écouter sur Seeduction)` };
  return { kind: 'text', text: cut(text + extra, MAX_TEXT) };
}

// ------------------------------------------------------------------ annonces automatiques

const KIND_ICON: Record<string, string> = { NEWS: '📰', UPDATE: '🛠️', EVENT: '🎉', MAINTENANCE: '🚧', IMPORTANT: '❗' };

export function newsHtml(a: { id: string; title: string; kind?: string | null; summary?: string | null; content?: string | null }, site = siteBase()): string {
  const lead = cut(plainText(a.summary || a.content || ''), 300);
  const url = site ? `${site}/news/${a.id}` : '';
  return [`${KIND_ICON[a.kind ?? 'NEWS'] ?? '📰'} <b>${escapeHtml(a.title)}</b>`, lead && escapeHtml(lead), url && link(url, 'Lire la nouvelle')].filter(Boolean).join('\n');
}

export function freeleechHtml(e: { title: string; message?: string | null; endsAt: Date | string }, site = siteBase()): string {
  const lead = cut(plainText(e.message ?? ''), 300);
  return [`🎉 <b>${escapeHtml(e.title)}</b>`, lead && escapeHtml(lead), `Freeleech global jusqu'au ${escapeHtml(when(e.endsAt))} : les téléchargements ne comptent pas dans ton ratio !`, site && link(site, 'Ouvrir Seeduction')].filter(Boolean).join('\n');
}

export function torrentHtml(t: { id: string; name: string; category?: string | null; size: bigint | number }, site = siteBase()): string {
  const gb = Number(t.size) / 1024 ** 3;
  const size = gb >= 1 ? `${gb.toFixed(2)} Go` : `${(Number(t.size) / 1024 ** 2).toFixed(0)} Mo`;
  const url = site ? `${site}/torrents/${t.id}` : '';
  return [`🆕 <b>${escapeHtml(t.name)}</b>`, escapeHtml([t.category, size].filter(Boolean).join(' · ')), url && link(url, 'Voir la fiche')].filter(Boolean).join('\n');
}

// ------------------------------------------------------------------ Telegram → Seeduction

export interface InEvent {
  kind: 'message' | 'edited' | 'member';
  chat: { id: string; type: string; title: string };
  from: { id: string; username: string | null; name: string; isBot: boolean } | null;
  text: string;
  messageId: number;
  replyToMessageId: number | null;
  photoFileId: string | null;
  /** Autre média (vocal, vidéo, sticker, fichier...) : jamais copié, seulement signalé. */
  otherMedia: string | null;
  date: number;
}

/** Lit un « update » Telegram ; renvoie null pour tout ce qui ne nous intéresse pas (messages de service, etc.). */
export function parseUpdate(u: any): InEvent | null {
  const mc = u?.my_chat_member;
  if (mc?.chat) return { kind: 'member', chat: chatOf(mc.chat), from: null, text: '', messageId: 0, replyToMessageId: null, photoFileId: null, otherMedia: null, date: mc.date ?? 0 };
  const m = u?.message ?? u?.edited_message;
  if (!m?.chat || typeof m.message_id !== 'number') return null;
  const photo = Array.isArray(m.photo) && m.photo.length ? m.photo[m.photo.length - 1] : null;
  let otherMedia: string | null = null;
  if (!photo) {
    if (m.voice || m.audio) otherMedia = '🎤 message vocal';
    else if (m.video || m.video_note) otherMedia = '🎞️ vidéo';
    else if (m.animation) otherMedia = 'GIF';
    else if (m.sticker) otherMedia = 'autocollant';
    else if (m.document) otherMedia = `📎 ${String(m.document.file_name ?? 'fichier')}`;
  }
  const text = String(m.text || m.caption || '');
  if (!text && !photo && !otherMedia) return null;
  return {
    kind: u.edited_message && !u.message ? 'edited' : 'message',
    chat: chatOf(m.chat),
    from: m.from ? { id: String(m.from.id), username: m.from.username ?? null, name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' '), isBot: !!m.from.is_bot } : null,
    text, messageId: m.message_id, replyToMessageId: typeof m.reply_to_message?.message_id === 'number' ? m.reply_to_message.message_id : null,
    photoFileId: photo?.file_id ?? null, otherMedia, date: Number(m.date ?? 0),
  };
}

const chatOf = (c: any) => ({ id: String(c.id), type: String(c.type ?? ''), title: String(c.title ?? c.username ?? c.first_name ?? '') });

/** « /lier CODE », « /link CODE » ou le lien profond « /start CODE » (bouton « Ouvrir Telegram » de la page Telegram) : renvoie le code, en majuscules. */
export function parseLinkCode(text: string): string | null {
  const m = /^\/(?:lier|link|start)(?:@\w+)?\s+([A-Za-z0-9]{6,12})\s*$/.exec((text ?? '').trim());
  return m ? m[1].toUpperCase() : null;
}

export const isStartCommand = (text: string) => /^\/(?:start|aide|help)(?:@\w+)?\s*$/i.test((text ?? '').trim());

/** Code de liaison : 8 caractères sans ambiguïté (ni 0/O ni 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Adresse d'invitation Telegram acceptée dans les réglages. */
export const INVITE_URL = /^https:\/\/(?:t\.me|telegram\.me)\/[\w+\-/.]{2,100}$/i;
