import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { useMessenger, type ConvSummary } from '../../store/messenger';
import { listTime } from '../../lib/chatFormat';
import ConvAvatar from './ConvAvatar';
import MessengerSettings from './MessengerSettings';

type Filter = 'all' | 'unread' | 'groups' | 'channels';

const MUTE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: '1 heure', hours: 1 },
  { label: '8 heures', hours: 8 },
  { label: '24 heures', hours: 24 },
  { label: 'Jusqu\'à ce que je les réactive', hours: null },
];

const isMuted = (c: ConvSummary) => !!c.mutedUntil && new Date(c.mutedUntil).getTime() > Date.now();

function Row({ c, active, onSelect }: { c: ConvSummary; active: boolean; onSelect: () => void }) {
  const me = useAuthStore((s) => s.user);
  const patch = useMessenger((s) => s.patchConversation);
  const [menu, setMenu] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const muted = isMuted(c);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!holder.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  async function setting(data: { pinned?: boolean; archived?: boolean; mutedUntil?: string | null }) {
    setMenu(false);
    try {
      const { data: updated } = await api.patch(`/messenger/conversations/${c.id}/settings`, data);
      patch(c.id, { pinned: updated.pinned, archived: updated.archived, mutedUntil: updated.mutedUntil });
      if (data.archived !== undefined) useMessenger.getState().loadConversations();
    } catch { /* réglage refusé : rien ne change */ }
  }

  const prefix = c.last ? (c.last.senderId === me?.id ? 'Toi : ' : c.type !== 'DIRECT' ? `${c.last.senderUsername} : ` : '') : '';
  const unreadShown = c.unread > 0 && !muted;

  return (
    <div className={`msgr-row-item${active ? ' active' : ''}${unreadShown ? ' unread' : ''}`} ref={holder}>
      <button type="button" className="msgr-row-main" onClick={onSelect}>
        <ConvAvatar conv={c} size={46} />
        <span className="msgr-row-text">
          <span className="msgr-row-top">
            <strong>{c.type === 'CHANNEL' ? '# ' : ''}{c.name}</strong>
            {c.pinned && <span title="Épinglée">📌</span>}
            {muted && <span title="En sourdine">🔕</span>}
            <span className="msgr-row-time muted">{c.last ? listTime(c.last.createdAt) : ''}</span>
          </span>
          <span className="msgr-row-bottom">
            <span className="msgr-row-preview">{c.last ? `${prefix}${c.last.preview}` : c.type === 'CHANNEL' ? c.description ?? 'Canal public' : 'Aucun message'}</span>
            {unreadShown && <span className="msgr-unread">{c.mentions > 0 ? '@' : c.unread > 99 ? '99+' : c.unread}</span>}
          </span>
        </span>
      </button>
      <button type="button" className="msgr-row-more" title="Options" aria-label="Options de la conversation" onClick={() => setMenu((v) => !v)}>⋯</button>
      {menu && (
        <div className="msgr-menu msgr-row-menu">
          <button type="button" onClick={() => setting({ pinned: !c.pinned })}>{c.pinned ? '📌 Désépingler' : '📌 Épingler'}</button>
          {muted
            ? <button type="button" onClick={() => setting({ mutedUntil: null })}>🔔 Réactiver les notifications</button>
            : MUTE_OPTIONS.map((o) => (
              <button key={o.label} type="button" onClick={() => setting({ mutedUntil: new Date(o.hours ? Date.now() + o.hours * 3_600_000 : Date.UTC(2100, 0, 1)).toISOString() })}>
                🔕 Silence : {o.label}
              </button>
            ))}
          <button type="button" onClick={() => setting({ archived: !c.archived })}>{c.archived ? '📥 Désarchiver' : '🗄️ Archiver'}</button>
        </div>
      )}
    </div>
  );
}

/** Colonne de gauche du Messenger : recherche, filtres, conversations triées par activité (épinglées d'abord). */
export default function ConversationList({ activeId, onSelect, onNew }: { activeId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const conversations = useMessenger((s) => s.conversations);
  const loaded = useMessenger((s) => s.convLoaded);
  const connected = useMessenger((s) => s.connected);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [archived, setArchived] = useState<ConvSummary[] | null>(null);

  useEffect(() => {
    if (archived === null) return;
    api.get('/messenger/conversations', { params: { archived: 1 } }).then((r) => setArchived(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && !(c.unread > 0)) return false;
      if (filter === 'groups' && c.type !== 'GROUP') return false;
      if (filter === 'channels' && c.type !== 'CHANNEL') return false;
      if (!term) return true;
      return (c.name ?? '').toLowerCase().includes(term) || (c.last?.preview ?? '').toLowerCase().includes(term);
    });
  }, [conversations, q, filter]);

  const unreadCount = conversations.filter((c) => c.unread > 0 && !isMuted(c)).length;
  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Tout' },
    { id: 'unread', label: unreadCount ? `Non lus (${unreadCount})` : 'Non lus' },
    { id: 'groups', label: 'Groupes' },
    { id: 'channels', label: 'Canaux' },
  ];

  return (
    <aside className="msgr-list">
      <div className="msgr-list-head">
        <h2>Discussions</h2>
        <span className={`msgr-conn${connected ? ' on' : ''}`} title={connected ? 'Connecté en direct' : 'Reconnexion…'} />
        <MessengerSettings />
        <button type="button" className="msgr-new-btn" title="Nouvelle discussion ou nouveau groupe" onClick={onNew}>✏️</button>
      </div>
      <input className="msgr-list-search" placeholder="Rechercher une conversation…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="msgr-tabs" role="tablist">
        {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={filter === t.id} className={filter === t.id ? 'on' : ''} onClick={() => setFilter(t.id)}>{t.label}</button>)}
      </div>
      <div className="msgr-list-body">
        {!loaded && <p className="muted msgr-center">Chargement…</p>}
        {loaded && list.length === 0 && (
          <div className="msgr-center muted">
            {q || filter !== 'all' ? 'Aucune conversation ne correspond.' : <>Aucune conversation pour l'instant.<br /><button type="button" style={{ marginTop: 10 }} onClick={onNew}>✏️ Écrire à quelqu'un</button></>}
          </div>
        )}
        {list.map((c) => <Row key={c.id} c={c} active={c.id === activeId} onSelect={() => onSelect(c.id)} />)}
        <button type="button" className="msgr-archived-toggle" onClick={() => setArchived((a) => (a === null ? [] : null))}>
          🗄️ Archivées {archived ? `(${archived.length})` : ''} {archived === null ? '▸' : '▾'}
        </button>
        {archived?.map((c) => <Row key={c.id} c={c} active={c.id === activeId} onSelect={() => onSelect(c.id)} />)}
      </div>
    </aside>
  );
}
