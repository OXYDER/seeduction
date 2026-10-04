import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import { formatBytes } from '../lib/format';
import { TICKET_PRIORITY, TICKET_STATUS, type TicketAttachment } from '../store/support';

export function StatusChip({ status }: { status: string }) {
  const s = TICKET_STATUS[status] ?? { label: status, cls: '' };
  return <span className={`tk-status ${s.cls}`}>{s.label}</span>;
}

export function PriorityChip({ priority }: { priority: string }) {
  if (priority === 'NORMAL') return null;
  return <span className={`tk-prio ${priority.toLowerCase()}`}>{TICKET_PRIORITY[priority] ?? priority}</span>;
}

/** Texte d'un billet (BBCode, échappé par bbcodeToHtml). */
export function TicketText({ text }: { text: string }) {
  return <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(text) }} />;
}

export function Attachments({ items }: { items: TicketAttachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="tk-attachments">
      {items.map((a) => a.kind === 'image'
        ? <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer"><img src={a.url} alt={a.name} loading="lazy" /></a>
        : <a key={a.url} href={a.url} download className="tk-file">📎 {a.name}{a.size ? <span className="muted"> · {formatBytes(a.size)}</span> : null}</a>)}
    </div>
  );
}

/** Choix et envoi de pièces jointes (captures d'écran, fichiers) : quatre au maximum. */
export function AttachmentPicker({ value, onChange, disabled }: { value: TicketAttachment[]; onChange: (v: TicketAttachment[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    const next = [...value];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= 4) { setError('4 pièces jointes au maximum'); break; }
        const form = new FormData();
        form.append('file', file);
        const { data } = await api.post('/messenger/upload', form);
        next.push({ url: data.url, name: data.name ?? file.name, kind: data.kind === 'image' ? 'image' : 'file', size: data.size });
      }
      onChange(next);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi du fichier impossible');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="tk-attach-picker">
      <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      <button type="button" className="secondary" disabled={disabled || busy || value.length >= 4} onClick={() => input.current?.click()}>
        {busy ? 'Envoi…' : '📎 Joindre une capture ou un fichier'}
      </button>
      {value.map((a) => (
        <span key={a.url} className="tk-chip">
          {a.kind === 'image' ? '🖼️' : '📎'} {a.name}
          <button type="button" title="Retirer" onClick={() => onChange(value.filter((x) => x.url !== a.url))}>✕</button>
        </span>
      ))}
      {error && <span className="muted" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

export interface WikiSuggestion { slug: string; title: string; category: string; excerpt: string; score: number }

/** Articles du wiki qui répondent probablement à ce texte (recherche par pertinence, avec un petit délai pendant la frappe). */
export function useWikiSuggestions(query: string, minLength = 6): WikiSuggestion[] {
  const [items, setItems] = useState<WikiSuggestion[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < minLength) { setItems([]); return; }
    let cancelled = false;
    const h = window.setTimeout(() => {
      api.get('/support/suggest', { params: { q } }).then((r) => { if (!cancelled) setItems(r.data); }).catch(() => {});
    }, 450);
    return () => { cancelled = true; window.clearTimeout(h); };
  }, [query, minLength]);
  return items;
}

export function WikiSuggestions({ items, title = '📖 Ces articles du wiki répondent peut-être à ta question', compact }: { items: WikiSuggestion[]; title?: string; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className={`tk-suggest${compact ? ' compact' : ''}`}>
      <strong>{title}</strong>
      <ul>
        {items.slice(0, compact ? 3 : 4).map((a) => (
          <li key={a.slug}>
            <Link to={`/wiki/${a.slug}`} target="_blank" rel="noopener">{a.title}</Link>
            <span className="muted"> · {a.category}</span>
            {!compact && <div className="muted tk-suggest-excerpt">{a.excerpt}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
