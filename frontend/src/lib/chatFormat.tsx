import { useState, type ReactNode } from 'react';
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

/** Mise en forme légère : **gras**, *italique* ou _italique_, ~~barré~~, `code`, ||spoiler|| (rendue en éléments React : jamais de HTML brut). */
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\|\|[^|\n]+?\|\|)|(\*[^*\s][^*\n]*?\*)|((?<![\p{L}\p{N}])_[^_\s][^_\n]*?_(?![\p{L}\p{N}]))/gu;

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return <span className={`msgr-spoiler${shown ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); setShown((v) => !v); }} title={shown ? 'Cacher' : 'Afficher le spoiler'}>{children}</span>;
}

function formatInline(text: string, key: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const k = `${key}.${n++}`;
    const inner = (len: number) => (depth < 2 ? formatInline(m[0].slice(len, m[0].length - len), k, depth + 1) : m[0].slice(len, m[0].length - len));
    if (m[1]) out.push(<code key={k} className="msgr-code">{m[0].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inner(2)}</strong>);
    else if (m[3]) out.push(<s key={k}>{inner(2)}</s>);
    else if (m[4]) out.push(<Spoiler key={k}>{inner(2)}</Spoiler>);
    else out.push(<em key={k}>{inner(1)}</em>);
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Liens cliquables, @mentions et mise en forme pour une ligne. */
function renderLine(text: string, key: string, myUsername?: string | null): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const plain = (t: string) => { if (t) nodes.push(...formatInline(t, `${key}p${i++}`)); };
  for (const m of text.matchAll(URL_OR_MENTION)) {
    const start = m.index ?? 0;
    if (start > last) plain(text.slice(last, start));
    if (m[1]) {
      let url = m[1];
      const trail = url.match(TRAILING)?.[0] ?? '';
      if (trail) url = url.slice(0, url.length - trail.length);
      const inner = internalPath(url);
      nodes.push(inner
        ? <Link key={`${key}l${i++}`} to={inner}>{url.replace(/^https?:\/\//, '')}</Link>
        : <a key={`${key}l${i++}`} href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>);
      if (trail) nodes.push(trail);
    } else if (m[3]) {
      nodes.push(<Link key={`${key}l${i++}`} to={m[3]}>{m[3]}</Link>);
    } else {
      const name = m[2].slice(1);
      nodes.push(<Link key={`${key}m${i++}`} to={`/u/${encodeURIComponent(name)}`} className={`msgr-mention${myUsername && name.toLowerCase() === myUsername.toLowerCase() ? ' me' : ''}`} onClick={(e) => e.stopPropagation()}>{m[2]}</Link>);
    }
    last = start + m[0].length;
  }
  if (last < text.length) plain(text.slice(last));
  return nodes;
}

/**
 * Texte d'un message : liens cliquables (ceux du site naviguent sans recharger), @mentions (qui ouvrent le profil), retours à la ligne conservés (CSS) et mise en
 * forme légère : **gras**, *italique*, ~~barré~~, `code`, ```bloc de code```, ||spoiler|| (un clic le révèle) et « > citation » en début de ligne.
 */
export function ChatText({ text, myUsername }: { text: string; myUsername?: string | null }) {
  const out: ReactNode[] = [];
  const parts = text.split(/```([\s\S]*?)```/g); // les morceaux impairs sont des blocs de code
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) { out.push(<pre key={`c${pi}`} className="msgr-codeblock">{part.replace(/^\n|\n$/g, '')}</pre>); return; }
    const lines = part.split('\n');
    let quote: string[] = [];
    const flush = (at: number) => {
      if (!quote.length) return;
      const q = quote;
      out.push(<blockquote key={`q${pi}.${at}`} className="msgr-quote">{q.map((l, qi) => <span key={qi}>{renderLine(l, `q${pi}.${at}.${qi}`, myUsername)}{qi < q.length - 1 ? '\n' : ''}</span>)}</blockquote>);
      quote = [];
    };
    lines.forEach((line, li) => {
      const q = /^>\s?/.exec(line);
      if (q) { quote.push(line.slice(q[0].length)); return; }
      flush(li);
      out.push(<span key={`t${pi}.${li}`}>{renderLine(line, `t${pi}.${li}`, myUsername)}{li < lines.length - 1 ? '\n' : ''}</span>);
    });
    flush(lines.length);
  });
  return <>{out}</>;
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
