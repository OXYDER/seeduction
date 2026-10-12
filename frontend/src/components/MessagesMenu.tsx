import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useMessenger, statusOf } from '../store/messenger';
import { STATUS_COLOR } from '../lib/presence';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import HeaderPopover from './HeaderPopover';

interface Thread { threadId: string; subject: string; other: { id?: string; username: string; avatarUrl?: string | null } | null; count: number; unread: number; last: { snippet: string; createdAt: string; fromMe: boolean } }

/** Prévient le reste de l'en-tête (pastille de l'icône) qu'un message privé a été lu. */
export const notifyMessagesChanged = () => window.dispatchEvent(new Event('pm:changed'));

function Row({ t, onOpen }: { t: Thread; onOpen: () => void }) {
  const online = useMessenger((s) => s.online);
  const status = statusOf(online, t.other?.id);
  return (
    <Link to={`/messages?thread=${encodeURIComponent(t.threadId)}`} className={`hp-pm${t.unread ? ' unread' : ''}`} onClick={onOpen}>
      <span className="hp-av"><Avatar user={t.other ?? undefined} size={36} />{status !== 'OFFLINE' && <i style={{ background: STATUS_COLOR[status] }} />}</span>
      <span className="hp-pm-text">
        <span className="hp-pm-top"><strong>{t.other?.username ?? 'Membre'}</strong><span className="muted">{timeAgo(t.last.createdAt)}</span></span>
        <span className="hp-pm-subject">{t.subject}</span>
        <span className="hp-pm-snippet muted">{t.last.fromMe ? 'Toi : ' : ''}{t.last.snippet}</span>
      </span>
      {t.unread > 0 && <span className="badge new">{t.unread}</span>}
    </Link>
  );
}

/**
 * Icône ✉️ du haut : un clic ouvre la liste de tes derniers messages privés (non lus en premier plan, avec la présence de l'interlocuteur), un bouton pour tout marquer
 * comme lu, « Nouveau message » et le lien « Voir tous mes messages ».
 */
export default function MessagesMenu({ unread, active }: { unread: number; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const load = useCallback(() => { api.get('/messages/threads').then((r) => setThreads(r.data)).catch(() => setThreads([])); }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function readAll() {
    await api.post('/messages/threads/read-all').catch(() => undefined);
    setThreads((l) => (l ?? []).map((t) => ({ ...t, unread: 0 })));
    notifyMessagesChanged();
  }

  const unreadTotal = (threads ?? []).reduce((n, t) => n + t.unread, 0);
  const list = (threads ?? []).filter((t) => !unreadOnly || t.unread > 0).slice(0, 12);

  return (
    <>
      <button ref={btnRef} type="button" className={`icon-pill${active ? ' active' : ''}`} title="Messages privés" aria-label="Messages privés" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        ✉️{unread > 0 && <span className="dot-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <HeaderPopover open={open} anchorRef={btnRef} onClose={close} width={380} label="Messages privés">
        <div className="hp-head">
          <strong>Messages privés{threads && unreadTotal > 0 ? ` — ${unreadTotal} non lu${unreadTotal > 1 ? 's' : ''}` : ''}</strong>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className="secondary" onClick={() => setUnreadOnly((v) => !v)} style={{ fontSize: 11, padding: '4px 8px', opacity: unreadOnly ? 1 : 0.7 }} aria-pressed={unreadOnly}>Non lus</button>
            {unreadTotal > 0 && <button type="button" className="secondary" onClick={readAll} style={{ fontSize: 11, padding: '4px 8px' }}>Tout marquer lu</button>}
          </span>
        </div>
        <div className="hp-list">
          {!threads && <p className="muted hp-empty">Chargement…</p>}
          {threads && list.length === 0 && <p className="muted hp-empty">{unreadOnly ? 'Aucun message non lu.' : 'Aucun message privé pour le moment.'}</p>}
          {list.map((t) => <Row key={t.threadId} t={t} onOpen={close} />)}
        </div>
        <div className="hp-twin">
          <Link to="/messages" className="hp-foot" onClick={close}>Voir tous mes messages →</Link>
          <Link to="/messages?compose=1" className="hp-foot" onClick={close}>✏️ Nouveau message</Link>
        </div>
      </HeaderPopover>
    </>
  );
}
