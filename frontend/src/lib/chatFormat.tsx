import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Adresses complètes, @mentions, et chemins internes (/wiki/..., /support/...) que l'assistant du canal Support écrit.
const URL_OR_MENTION = /(https?:\/\/[^\s<]+)|(@[\p{L}\p{N}_.·-]{2,50})|(?<![\w/])(\/(?:wiki|support|torrents|forum|news)(?:\/[\w\-.%~]+)*)/gu;
const TRAILING = /[.,;:!?)\]}»"']+$/;
// Un message fait uniquement d'émojis (3 au plus) s'affiche en grand, comme dans Messenger.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*){1,3}$/u;

export const isBigEmoji = (text: string) => EMOJI_ONLY.test(text.trim());

/** Chemin interne d'un lien vers ce site (fiche torrent, forum, wiki...) ou null pour un lien externe. */
function internalPath(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.host !== window.location.host) return null;
    return u.pathname + u.search + u.hash;
  } catch { return null; }
}

/** Texte d'un message : liens cliquables (les liens du site naviguent sans recharger), @mentions, retours à la ligne conservés (CSS). */
export function ChatText({ text, myUsername }: { text: string; myUsername?: string | null }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(URL_OR_MENTION)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    if (m[1]) {
      let url = m[1];
      const trail = url.match(TRAILING)?.[0] ?? '';
      if (trail) url = url.slice(0, url.length - trail.length);
      const inner = internalPath(url);
      nodes.push(inner
        ? <Link key={i++} to={inner}>{url.replace(/^https?:\/\//, '')}</Link>
        : <a key={i++} href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>);
      if (trail) nodes.push(trail);
    } else if (m[3]) {
      nodes.push(<Link key={i++} to={m[3]}>{m[3]}</Link>);
    } else {
      const name = m[2].slice(1);
      nodes.push(<span key={i++} className={`msgr-mention${myUsername && name.toLowerCase() === myUsername.toLowerCase() ? ' me' : ''}`}>{m[2]}</span>);
    }
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export const clock = (iso: string | Date) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Aujourd'hui », « Hier » ou la date complète : séparateurs de jour dans une conversation. */
export function dayLabel(iso: string | Date) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Aujourd'hui";
  if (same(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** Heure courte pour la liste des conversations : l'heure aujourd'hui, « Hier », sinon la date. */
export function listTime(iso: string | Date) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(d);
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Hier';
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const isSameDay = (a: string | Date, b: string | Date) => new Date(a).toDateString() === new Date(b).toDateString();
