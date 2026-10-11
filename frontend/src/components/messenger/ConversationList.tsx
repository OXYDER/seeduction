import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { useMessenger, type ConvSummary } from '../../store/messenger';
import { listTime } from '../../lib/chatFormat';
import ConvAvatar from './ConvAvatar';
import MessengerSettings from './MessengerSettings';

/** Les conversations publiques (canaux) et privées (1 à 1 et groupes) sont séparées en deux onglets. */
type Kind = 'private' | 'public';
const KIND_KEY = 'msgr-list-kind';
const readKind = (): Kind => { try { return localStorage.getItem(KIND_KEY) === 'public' ? 'public' : 'private'; } catch { return 'private'; } };
const kindOf = (c: ConvSummary): Kind => (c.type === 'CHANNEL' ? 'public' : 'private');

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
  const [kind, setKindState] = useState<Kind>(readKind);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const setKind = (k: Kind) => { setKindState(k); try { localStorage.setItem(KIND_KEY, k); } catch { /* préférence facultative */ } };
  const [archived, setArchived] = useState<ConvSummary[] | null>(null);

  useEffect(() => {
    if (archived === null) return;
    api.get('/messenger/conversations', { params: { archived: 1 } }).then((r) => setArchived(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  // Ouvrir une conversation (lien, notification, bulle) bascule sur l'onglet qui la contient.
  useEffect(() => {
    const open = conversations.find((c) => c.id === activeId);
    if (open && kindOf(open) !== kind) setKind(kindOf(open));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const matches = (c: ConvSummary) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (c.name ?? '').toLowerCase().includes(term) || (c.last?.preview ?? '').toLowerCase().includes(term);
  };
  const list = useMemo(() => conversations.filter((c) => kindOf(c) === kind && matches(c) && (!unreadOnly || (c.unread > 0 && !isMuted(c)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations, q, kind, unreadOnly]);
  const otherMatches = q.trim() ? conversations.filter((c) => kindOf(c) !== kind && matches(c)).length : 0;
  const unreadOf = (k: Kind) => conversations.filter((c) => kindOf(c) === k && c.unread > 0 && !isMuted(c)).length;
  const tabs: { id: Kind; label: string }[] = [
    { id: 'private', label: '💬 Privées' },
    { id: 'public', label: '# Publiques' },
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
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={kind === t.id} className={kind === t.id ? 'on' : ''} onClick={() => setKind(t.id)}>
            {t.label}{unreadOf(t.id) > 0 && <span className="msgr-unread" style={{ marginLeft: 6 }}>{unreadOf(t.id)}</span>}
          </button>
        ))}
        <label className="msgr-check" style={{ marginLeft: 'auto', fontSize: 12, whiteSpace: 'nowrap' }} title="N'afficher que les conversations avec des messages non lus">
          <input type="checkbox" style={{ width: 'auto' }} checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Non lus
        </label>
      </div>
      <div className="msgr-list-body">
        {!loaded && <p className="muted msgr-center">Chargement…</p>}
        {loaded && list.length === 0 && (
          <div className="msgr-center muted">
            {q || unreadOnly ? 'Aucune conversation ne correspond.' : kind === 'public' ? 'Aucun canal public.' : <>Aucune conversation privée pour l'instant.<br /><button type="button" style={{ marginTop: 10 }} onClick={onNew}>✏️ Écrire à quelqu'un</button></>}
          </div>
        )}
        {otherMatches > 0 && <button type="button" className="msgr-archived-toggle" onClick={() => setKind(kind === 'private' ? 'public' : 'private')}>{otherMatches} résultat{otherMatches > 1 ? 's' : ''} dans les conversations {kind === 'private' ? 'publiques' : 'privées'} →</button>}
        {list.map((c) => <Row key={c.id} c={c} active={c.id === activeId} onSelect={() => onSelect(c.id)} />)}
        <button type="button" className="msgr-archived-toggle" onClick={() => setArchived((a) => (a === null ? [] : null))}>
          🗄️ Archivées {archived ? `(${archived.length})` : ''} {archived === null ? '▸' : '▾'}
        </button>
        {archived?.filter((c) => kindOf(c) === kind).map((c) => <Row key={c.id} c={c} active={c.id === activeId} onSelect={() => onSelect(c.id)} />)}
      </div>
    </aside>
  );
}
