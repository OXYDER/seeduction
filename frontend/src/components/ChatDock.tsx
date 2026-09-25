import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDmStore, DmUser } from '../store/dm';
import { usePublicChatStore } from '../store/publicChat';
import PublicChatPanel from './PublicChatPanel';
import Avatar from './Avatar';
import { STATUS_COLOR, PublicStatus } from '../lib/presence';
import { timeAgo } from '../lib/time';

const TYPING_TTL_MS = 4000;

function StatusDot({ status }: { status: PublicStatus | undefined }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLOR[status ?? 'OFFLINE'], border: '2px solid var(--bg-panel)', position: 'absolute', right: -1, bottom: -1 }} />;
}

function ChatWindow({ friend, onClose, onMinimize }: { friend: DmUser; onClose: () => void; onMinimize: () => void }) {
  const messages = useDmStore((s) => s.messages[friend.id] ?? []);
  const status = useDmStore((s) => s.statusById[friend.id]);
  const typingFrom = useDmStore((s) => s.typingFrom[friend.id]);
  const send = useDmStore((s) => s.send);
  const typing = useDmStore((s) => s.typing);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  useEffect(() => {
    if (!typingFrom) return;
    setIsTyping(true);
    const t = window.setTimeout(() => setIsTyping(false), TYPING_TTL_MS);
    return () => window.clearTimeout(t);
  }, [typingFrom]);

  function onInput(v: string) {
    setInput(v);
    const now = Date.now();
    if (now - lastTypingSent.current > 1500) { typing(friend.id); lastTypingSent.current = now; }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    send(friend.id, input);
    setInput('');
  }

  // Regroupe les messages consécutifs du même auteur pour n'afficher son avatar/heure qu'une fois.
  const grouped = messages.map((m, i) => ({ ...m, showMeta: i === messages.length - 1 || messages[i + 1].fromMe !== m.fromMe }));

  return (
    <div className="dm-window">
      <div className="dm-window-head" onClick={onMinimize}>
        <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Avatar user={friend} size={28} />
            <StatusDot status={status} />
          </span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{friend.username}</strong>
            <span className="muted" style={{ fontSize: 11 }}>{status === 'ONLINE' ? 'Actif maintenant' : status === 'AWAY' ? 'Absent' : status === 'BUSY' ? 'Occupé' : ''}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 2 }}>
          <button type="button" className="dm-icon-btn" title="Réduire" onClick={(e) => { e.stopPropagation(); onMinimize(); }}>—</button>
          <button type="button" className="dm-icon-btn" title="Fermer" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
        </div>
      </div>
      <div className="dm-window-body">
        {grouped.length === 0 && <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>Dites bonjour à {friend.username} 👋</p>}
        {grouped.map((m) => (
          <div key={m.id} className={`dm-bubble-row ${m.fromMe ? 'me' : 'them'}`}>
            {!m.fromMe && <span style={{ width: 22 }}>{m.showMeta && <Avatar user={friend} size={22} />}</span>}
            <div>
              <div className={`dm-bubble ${m.fromMe ? 'me' : 'them'}`} style={m.pending ? { opacity: 0.6 } : undefined}>{m.content}</div>
              {m.showMeta && <div className="muted" style={{ fontSize: 10, margin: '2px 4px', textAlign: m.fromMe ? 'right' : 'left' }}>{timeAgo(m.createdAt)}</div>}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="dm-bubble-row them">
            <span style={{ width: 22 }}><Avatar user={friend} size={22} /></span>
            <div className="dm-bubble them dm-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="dm-window-input" onSubmit={submit}>
        <input placeholder="Écrire un message..." value={input} onChange={(e) => onInput(e.target.value)} maxLength={4000} />
        <button type="submit" disabled={!input.trim()} aria-label="Envoyer">➤</button>
      </form>
    </div>
  );
}

function PublicChatBubble() {
  const minimized = usePublicChatStore((s) => s.minimized);
  const unread = usePublicChatStore((s) => s.unread);
  const setMinimized = usePublicChatStore((s) => s.setMinimized);
  const connected = usePublicChatStore((s) => s.connected);
  // Sur la page /chat, le panneau est déjà affiché en pleine page : la bulle flottante resterait redondante.
  const onChatPage = useLocation().pathname.startsWith('/chat');

  if (!connected || onChatPage) return null;

  if (minimized) {
    return (
      <button type="button" className="dm-bubble-avatar" title="Chat public" onClick={() => setMinimized(false)}>
        <span style={{ fontSize: 22 }}>🗨️</span>
        {unread > 0 && <span className="dot-badge" style={{ top: -4, right: -4 }}>{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }
  return (
    <div className="public-chat-window">
      <div className="dm-window-head" onClick={() => setMinimized(true)}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>🗨️</span>
          <strong style={{ fontSize: 13 }}>Chat public</strong>
        </div>
        <div className="row" style={{ gap: 2 }}>
          <button type="button" className="dm-icon-btn" title="Réduire" onClick={(e) => { e.stopPropagation(); setMinimized(true); }}>—</button>
        </div>
      </div>
      <PublicChatPanel compact />
    </div>
  );
}

/** Bulles de discussion façon Messenger (chat public + conversations privées), ancrées en bas à droite ; persistent au fil de la navigation (montées dans Layout). */
export default function ChatDock() {
  const windows = useDmStore((s) => s.windows);
  const statusById = useDmStore((s) => s.statusById);
  const unread = useDmStore((s) => s.unread);
  const closeChat = useDmStore((s) => s.closeChat);
  const toggleMinimize = useDmStore((s) => s.toggleMinimize);

  return (
    <div className="dm-dock">
      <PublicChatBubble />
      {windows.map((w) =>
        w.minimized ? (
          <button key={w.friend.id} type="button" className="dm-bubble-avatar" title={w.friend.username} onClick={() => toggleMinimize(w.friend.id)}>
            <Avatar user={w.friend} size={48} />
            <StatusDot status={statusById[w.friend.id]} />
            {!!unread[w.friend.id] && <span className="dot-badge" style={{ top: -4, right: -4 }}>{unread[w.friend.id]}</span>}
          </button>
        ) : (
          <ChatWindow key={w.friend.id} friend={w.friend} onClose={() => closeChat(w.friend.id)} onMinimize={() => toggleMinimize(w.friend.id)} />
        ),
      )}
    </div>
  );
}
