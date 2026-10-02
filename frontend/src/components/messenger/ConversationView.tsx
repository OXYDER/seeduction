import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { statusOf, useMessenger, type Msg, type MsgUser } from '../../store/messenger';
import { useCalls } from '../../store/calls';
import { STATUS_LABEL } from '../../lib/presence';
import { clock, dayLabel, isSameDay } from '../../lib/chatFormat';
import ConvAvatar from './ConvAvatar';
import MessageItem, { type Reader } from './MessageItem';
import Composer from './Composer';

const TYPING_TTL_MS = 4500;
const CLUSTER_GAP_MS = 5 * 60_000;
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

interface Props {
  conversationId: string;
  variant: 'page' | 'dock';
  onClose?: () => void;
  onMinimize?: () => void;
  onOpenInfo?: () => void;
  infoOpen?: boolean;
  onBack?: () => void;
}

/** Une conversation complète : en-tête, fil de messages (défilement infini vers le haut), « en train d'écrire », composeur. Sert à la page Messenger et aux fenêtres flottantes. */
export default function ConversationView({ conversationId, variant, onClose, onMinimize, onOpenInfo, infoOpen, onBack }: Props) {
  const me = useAuthStore((s) => s.user);
  const conv = useMessenger((s) => s.conversations.find((c) => c.id === conversationId));
  const thread = useMessenger((s) => s.threads[conversationId]);
  const typingMap = useMessenger((s) => s.typing[conversationId]);
  const online = useMessenger((s) => s.online);
  const callPhase = useCalls((s) => s.phase);
  const onlineList = useMessenger((s) => s.onlineList);
  const { loadThread, loadOlder, setVisible, markRead, ensureConversation } = useMessenger.getState();

  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [now, setNow] = useState(Date.now());
  const [newBelow, setNewBelow] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Msg[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<File[]>([]);
  const [missing, setMissing] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const anchor = useRef<{ height: number } | null>(null);
  const initialRead = useRef<string | null>(null);
  const lastCount = useRef(0);

  // La conversation peut ne pas (encore) être dans la liste (lien direct, nouveau message) : on la charge.
  useEffect(() => {
    let alive = true;
    setMissing(false);
    ensureConversation(conversationId).then((ok) => { if (alive && !ok) setMissing(true); });
    loadThread(conversationId);
    return () => { alive = false; };
  }, [conversationId, ensureConversation, loadThread]);

  // Visible = affichée et la page est au premier plan : les nouveaux messages sont alors lus tout de suite.
  useEffect(() => {
    setVisible(conversationId, true);
    const onFocus = () => markRead(conversationId);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { setVisible(conversationId, false); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [conversationId, setVisible, markRead]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1500);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => { setReplyTo(null); setEditing(null); setSearchOpen(false); setQuery(''); setNewBelow(0); stick.current = true; initialRead.current = null; lastCount.current = 0; }, [conversationId]);
  useEffect(() => { if (thread?.loaded && initialRead.current === null) initialRead.current = thread.myLastReadAt ?? ''; }, [thread?.loaded, thread?.myLastReadAt]);

  const messages = thread?.messages ?? [];
  const firstId = messages[0]?.id;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Une image, une fiche de torrent ou une pochette qui finit de charger agrandit le fil : si on était en bas, on y reste.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (stick.current && !anchor.current) scrollToBottom(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [conversationId, scrollToBottom]);

  // Messages plus anciens ajoutés en haut : on garde la position de lecture au lieu de sauter.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && anchor.current) { el.scrollTop += el.scrollHeight - anchor.current.height; anchor.current = null; }
  }, [firstId]);

  useLayoutEffect(() => {
    const count = messages.length;
    const grew = count > lastCount.current;
    const lastMsg = messages[count - 1];
    const firstLoad = lastCount.current === 0 && count > 0;
    lastCount.current = count;
    if (!grew || !lastMsg || anchor.current) return;
    if (firstLoad || stick.current || lastMsg.sender.id === me?.id) { scrollToBottom(!firstLoad); setNewBelow(0); }
    else setNewBelow((n) => n + 1);
  }, [messages.length, me?.id, scrollToBottom]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (stick.current && newBelow) { setNewBelow(0); markRead(conversationId); }
    if (el.scrollTop < 140 && thread?.hasMore && !thread.loading) {
      anchor.current = { height: el.scrollHeight };
      loadOlder(conversationId);
    }
  }

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1800);
  }, []);

  // Recherche dans la conversation
  useEffect(() => {
    if (!searchOpen || query.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const h = window.setTimeout(() => {
      api.get(`/messenger/conversations/${conversationId}/search`, { params: { q: query.trim() } }).then((r) => { if (!cancelled) setResults(r.data); }).catch(() => {});
    }, 300);
    return () => { cancelled = true; window.clearTimeout(h); };
  }, [query, searchOpen, conversationId]);

  const people = useMemo<MsgUser[]>(() => {
    if (!conv) return [];
    if (conv.type === 'DIRECT') return conv.other ? [conv.other] : [];
    const map = new Map<string, MsgUser>();
    if (conv.type === 'GROUP') (conv.members ?? []).forEach((m) => map.set(m.id, m));
    else {
      onlineList.forEach((u) => map.set(u.id, { id: u.id, username: u.username }));
      messages.forEach((m) => map.set(m.sender.id, m.sender));
    }
    map.delete(me?.id ?? '');
    return [...map.values()];
  }, [conv, onlineList, messages, me?.id]);

  // « Vu par » : sous le dernier de MES messages que chaque personne a lu.
  const readersByMessage = useMemo(() => {
    const map = new Map<string, Reader[]>();
    if (!conv || conv.type === 'CHANNEL' || !thread) return map;
    const mine = messages.filter((m) => m.sender.id === me?.id && !m.pending && !m.failed && !m.deleted);
    const lookup = new Map<string, MsgUser>();
    if (conv.other) lookup.set(conv.other.id, conv.other);
    (conv.members ?? []).forEach((m) => lookup.set(m.id, m));
    for (const r of thread.readBy) {
      const at = new Date(r.lastReadAt).getTime();
      let target: Msg | undefined;
      for (const m of mine) if (new Date(m.createdAt).getTime() <= at) target = m;
      const user = lookup.get(r.userId);
      if (target && user) map.set(target.id, [...(map.get(target.id) ?? []), { userId: user.id, username: user.username, avatarUrl: user.avatarUrl }]);
    }
    return map;
  }, [conv, thread, messages, me?.id]);

  const typingNames = Object.entries(typingMap ?? {}).filter(([, t]) => now - t.at < TYPING_TTL_MS).map(([, t]) => t.username);

  const items = useMemo(() => {
    const out: { kind: 'day' | 'new' | 'msg'; key: string; label?: string; msg?: Msg; first?: boolean; last?: boolean }[] = [];
    let dividerPlaced = false;
    const unreadFrom = initialRead.current;
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      if (!prev || !isSameDay(prev.createdAt, m.createdAt)) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.createdAt) });
      if (!dividerPlaced && unreadFrom && m.sender.id !== me?.id && !m.pending && new Date(m.createdAt) > new Date(unreadFrom)) {
        dividerPlaced = true;
        out.push({ kind: 'new', key: `new-${m.id}` });
      }
      const gap = (a: Msg, b: Msg) => Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) > CLUSTER_GAP_MS;
      const first = !prev || prev.sender.id !== m.sender.id || prev.type === 'SYSTEM' || gap(prev, m) || !isSameDay(prev.createdAt, m.createdAt);
      const last = !next || next.sender.id !== m.sender.id || next.type === 'SYSTEM' || gap(m, next) || !isSameDay(next.createdAt, m.createdAt);
      out.push({ kind: 'msg', key: m.id, msg: m, first, last });
    });
    return out;
  }, [messages, me?.id]);

  if (missing) return <div className="msgr-view-empty"><p className="muted">Cette conversation n'est plus disponible.</p>{onClose && <button type="button" onClick={onClose}>Fermer</button>}</div>;
  if (!conv) return <div className="msgr-view-empty"><p className="muted">Chargement…</p></div>;

  const isStaff = STAFF.includes(me?.role ?? '');
  const canModerate = conv.type === 'CHANNEL' ? isStaff : conv.type === 'GROUP' ? conv.myRole !== 'MEMBER' : false;
  const canPin = conv.type === 'DIRECT' || canModerate;
  const pinned = conv.pinnedMessageId ? messages.find((m) => m.id === conv.pinnedMessageId) : null;
  const status = statusOf(online, conv.other?.id);

  async function togglePin(m: Msg) {
    await api.post(`/messenger/conversations/${conversationId}/pin`, { messageId: conv!.pinnedMessageId === m.id ? null : m.id }).catch((err) => window.alert(err.response?.data?.message ?? 'Impossible d\'épingler'));
  }

  const canCall = callPhase === 'idle' && status !== 'OFFLINE';
  const callTitle = (kind: string) => (callPhase !== 'idle' ? 'Tu es déjà en appel' : status === 'OFFLINE' ? `${conv.name} n'est pas en ligne` : `Appel ${kind}`);
  const startCall = (video: boolean) => { if (conv.other) void useCalls.getState().start(conv.id, { id: conv.other.id, username: conv.other.username, avatarUrl: conv.other.avatarUrl }, video); };

  const subtitle = typingNames.length
    ? <span className="msgr-typing-text">{typingNames.join(', ')} {typingNames.length > 1 ? 'écrivent' : 'écrit'}…</span>
    : conv.type === 'DIRECT' ? <span className="muted">{STATUS_LABEL[status]}</span>
    : conv.type === 'GROUP' ? <span className="muted">{conv.memberCount} membres</span>
    : <span className="muted">{conv.description ?? 'Canal public'} · {onlineList.length} en ligne</span>;

  return (
    <div
      className={`msgr-view ${variant}${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files') && conv.writable) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (conv.writable && e.dataTransfer.files.length) setDropped([...e.dataTransfer.files]); }}
    >
      <header className="msgr-view-head" onClick={variant === 'dock' ? onMinimize : undefined}>
        {onBack && <button type="button" className="dm-icon-btn msgr-back" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="Retour aux conversations">←</button>}
        <ConvAvatar conv={conv} size={variant === 'dock' ? 32 : 40} />
        <div className="msgr-view-title">
          {conv.type === 'DIRECT' && conv.other
            ? <Link to={`/users/${conv.other.id}`} onClick={(e) => e.stopPropagation()}><strong>{conv.name}</strong></Link>
            : <strong>{conv.type === 'CHANNEL' ? '# ' : ''}{conv.name}</strong>}
          {subtitle}
        </div>
        <div className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
          {conv.type === 'DIRECT' && conv.other && (
            <>
              <button type="button" className="dm-icon-btn" title={callTitle('audio')} aria-label="Appel audio" disabled={!canCall} onClick={() => startCall(false)}>📞</button>
              <button type="button" className="dm-icon-btn" title={callTitle('vidéo')} aria-label="Appel vidéo" disabled={!canCall} onClick={() => startCall(true)}>🎥</button>
            </>
          )}
          <button type="button" className={`dm-icon-btn${searchOpen ? ' on' : ''}`} title="Rechercher dans la conversation" onClick={() => setSearchOpen((v) => !v)}>🔍</button>
          {onOpenInfo && <button type="button" className={`dm-icon-btn${infoOpen ? ' on' : ''}`} title="Infos et réglages" onClick={onOpenInfo}>ⓘ</button>}
          {variant === 'dock' && onMinimize && <button type="button" className="dm-icon-btn" title="Réduire" onClick={onMinimize}>⌄</button>}
          {variant === 'dock' && onClose && <button type="button" className="dm-icon-btn" title="Fermer" onClick={onClose}>✕</button>}
        </div>
      </header>

      {searchOpen && (
        <div className="msgr-search">
          <input autoFocus placeholder="Rechercher dans cette conversation…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query.trim().length >= 2 && (
            <div className="msgr-search-results">
              {results.length === 0 && <p className="muted" style={{ padding: 8 }}>Aucun message trouvé.</p>}
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => jumpTo(m.id)}>
                  <strong>{m.sender.username}</strong> <span className="muted">{dayLabel(m.createdAt)} {clock(m.createdAt)}</span>
                  <span className="msgr-search-text">{m.content}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pinned && (
        <button type="button" className="msgr-pinned" onClick={() => jumpTo(pinned.id)}>
          📌 <strong>{pinned.sender.username}</strong> {(pinned.content || 'pièce jointe').slice(0, 90)}
        </button>
      )}

      <div className="msgr-scroll" ref={scroller} onScroll={onScroll}>
        <div className="msgr-content" ref={content}>
        {thread?.loading && messages.length > 0 && <div className="msgr-load-more muted">Chargement…</div>}
        {thread && !thread.hasMore && thread.loaded && (
          <div className="msgr-intro">
            <ConvAvatar conv={conv} size={64} showStatus={false} />
            <strong>{conv.type === 'CHANNEL' ? `# ${conv.name}` : conv.name}</strong>
            <span className="muted">{conv.type === 'DIRECT' ? 'Voici le début de votre conversation.' : conv.type === 'GROUP' ? 'Début du groupe.' : conv.description ?? 'Début du canal.'}</span>
          </div>
        )}
        {!thread?.loaded && !thread?.error && <p className="muted msgr-center">Chargement de la conversation…</p>}
        {thread?.error && <p className="msgr-center" style={{ color: 'var(--danger)' }}>{thread.error}</p>}
        {items.map((it) => {
          if (it.kind === 'day') return <div key={it.key} className="msgr-day"><span>{it.label}</span></div>;
          if (it.kind === 'new') return <div key={it.key} className="msgr-new-divider"><span>Nouveaux messages</span></div>;
          const m = it.msg!;
          return (
            <Fragment key={it.key}>
              <MessageItem
                msg={m} conv={conv} first={!!it.first} last={!!it.last} readers={readersByMessage.get(m.id) ?? []}
                highlighted={flash === m.id} canModerate={canModerate} canPin={canPin}
                onReply={(x) => { setEditing(null); setReplyTo(x); }} onEdit={(x) => { setReplyTo(null); setEditing(x); }} onJump={jumpTo} onPin={togglePin}
              />
            </Fragment>
          );
        })}
        </div>
      </div>

      {newBelow > 0 && (
        <button type="button" className="msgr-new-pill" onClick={() => { scrollToBottom(true); setNewBelow(0); markRead(conversationId); }}>
          ↓ {newBelow} nouveau{newBelow > 1 ? 'x' : ''} message{newBelow > 1 ? 's' : ''}
        </button>
      )}

      <div className="msgr-typing-row" aria-live="polite">
        {typingNames.length > 0 && <><span className="msgr-typing-dots"><span /><span /><span /></span> {typingNames.join(', ')} {typingNames.length > 1 ? 'écrivent' : 'écrit'}…</>}
      </div>

      <Composer
        conversationId={conversationId}
        writable={conv.writable}
        people={people}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        compact={variant === 'dock'}
        droppedFiles={dropped}
        onFilesHandled={() => setDropped([])}
      />
      {dragging && <div className="msgr-drop-hint">Dépose tes fichiers pour les envoyer</div>}
    </div>
  );
}
