import { useEffect, useMemo, useRef, useState } from 'react';
import { usePublicChatStore, ChatMsg } from '../store/publicChat';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import Avatar from './Avatar';
import UserLink from './UserLink';
import { timeAgo } from '../lib/time';
import { STATUS_COLOR } from '../lib/presence';
import { QUICK_REACTIONS, EMOJI_GRID } from '../lib/emoji';
import { formatBytes } from '../lib/format';

const TYPING_TTL_MS = 4000;
const STAFF_ROLES = ['MODERATOR', 'ADMIN', 'OWNER'];

function MembersList() {
  const onlineUsers = usePublicChatStore((s) => s.onlineUsers);
  return (
    <div className="chat-members">
      <div className="chat-members-title">En ligne — {onlineUsers.length}</div>
      <div className="chat-members-list">
        {onlineUsers.map((u) => (
          <div key={u.id} className="chat-member-row">
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <Avatar user={{ username: u.username }} size={26} />
              <span style={{ position: 'absolute', right: -1, bottom: -1, width: 8, height: 8, borderRadius: '50%', border: '2px solid var(--bg-panel)', background: STATUS_COLOR[u.status] }} />
            </span>
            <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
          </div>
        ))}
        {onlineUsers.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Personne pour l'instant.</p>}
      </div>
    </div>
  );
}

function ReactionPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [full, setFull] = useState(false);
  return (
    <div className="chat-reaction-picker" onMouseLeave={onClose}>
      {!full ? (
        <>
          {QUICK_REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>
          ))}
          <button type="button" title="Plus d'émojis" onClick={() => setFull(true)}>➕</button>
        </>
      ) : (
        <div className="chat-emoji-grid">
          {EMOJI_GRID.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg, showMeta, seenHere, isStaff }: { msg: ChatMsg; showMeta: boolean; seenHere: { userId: string; username: string }[]; isStaff: boolean }) {
  const me = useAuthStore((s) => s.user);
  const react = usePublicChatStore((s) => s.react);
  const [pickerOpen, setPickerOpen] = useState(false);
  const mine = msg.user.id === me?.id;

  async function removeMessage() {
    if (!window.confirm('Supprimer ce message ?')) return;
    await api.delete(`/chat/messages/${msg.id}`);
  }

  return (
    <div className="chat-msg-row" style={mine ? { flexDirection: 'row-reverse' } : undefined}>
      {showMeta ? <Avatar user={msg.user} size={30} /> : <span style={{ width: 30, flexShrink: 0 }} />}
      <div style={{ minWidth: 0, maxWidth: '78%' }}>
        {showMeta && (
          <div className="row" style={{ gap: 6, fontSize: 11, marginBottom: 2, flexDirection: mine ? 'row-reverse' : 'row' }}>
            <strong style={{ color: 'var(--gold)' }}><UserLink user={msg.user} /></strong>
            <span className="muted">{new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        <div className="chat-msg-content-wrap" onMouseEnter={() => setPickerOpen(false)}>
          {msg.content && <div className={`chat-bubble-msg${mine ? ' mine' : ''}`}>{msg.content}</div>}
          {msg.imageUrl && <img src={msg.imageUrl} alt="" className="chat-msg-image" onClick={() => window.open(msg.imageUrl!, '_blank')} />}
          {msg.fileUrl && (
            <a href={msg.fileUrl} className="chat-file-chip" download>
              📎 {msg.fileName ?? 'Fichier'} {msg.fileSize ? <span className="muted">({formatBytes(msg.fileSize)})</span> : null}
            </a>
          )}
          {msg.reactions.length > 0 && (
            <div className="chat-reactions" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              {msg.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={r.userIds.includes(me?.id ?? '') ? 'on' : ''}
                  onClick={() => react(msg.id, r.emoji)}
                  title={r.userIds.length + ' réaction(s)'}
                >
                  {r.emoji} {r.userIds.length}
                </button>
              ))}
            </div>
          )}
          <div className="chat-msg-tools" style={{ [mine ? 'left' : 'right']: '100%' }}>
            <button type="button" title="Réagir" onClick={() => setPickerOpen((v) => !v)}>😊</button>
            {(mine || isStaff) && <button type="button" title="Supprimer" onClick={removeMessage}>🗑️</button>}
            {pickerOpen && <ReactionPicker onPick={(e) => { react(msg.id, e); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} />}
          </div>
        </div>
        {seenHere.length > 0 && (
          <div className="row" style={{ gap: 2, marginTop: 3, justifyContent: mine ? 'flex-end' : 'flex-start' }} title={seenHere.map((s) => s.username).join(', ') + ' ont vu'}>
            {seenHere.slice(0, 5).map((s) => <Avatar key={s.userId} user={{ username: s.username }} size={14} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Panneau du chat public complet : messages, réactions, indicateur "en train d'écrire", "vu par", membres en ligne, pièces jointes. */
export default function PublicChatPanel({ compact = false }: { compact?: boolean }) {
  const messages = usePublicChatStore((s) => s.messages);
  const typingFrom = usePublicChatStore((s) => s.typingFrom);
  const seenBy = usePublicChatStore((s) => s.seenBy);
  const error = usePublicChatStore((s) => s.error);
  const send = usePublicChatStore((s) => s.send);
  const typing = usePublicChatStore((s) => s.typing);
  const markSeen = usePublicChatStore((s) => s.markSeen);
  const uploadImage = usePublicChatStore((s) => s.uploadImage);
  const uploadFile = usePublicChatStore((s) => s.uploadFile);
  const me = useAuthStore((s) => s.user);
  const isStaff = !!me && STAFF_ROLES.includes(me.role);

  const [input, setInput] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const listEndRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => { listEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last) markSeen(last.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1500);
    return () => window.clearInterval(t);
  }, []);

  const typingNames = useMemo(
    () => Object.values(typingFrom).filter((t) => now - t.at < TYPING_TTL_MS).map((t) => t.username),
    [typingFrom, now],
  );

  const seenByMessage = useMemo(() => {
    const map = new Map<string, { userId: string; username: string }[]>();
    for (const [userId, s] of Object.entries(seenBy)) {
      map.set(s.messageId, [...(map.get(s.messageId) ?? []), { userId, username: s.username }]);
    }
    return map;
  }, [seenBy]);

  function onInput(v: string) {
    setInput(v);
    const nowMs = Date.now();
    if (nowMs - lastTypingSent.current > 1500) { typing(); lastTypingSent.current = nowMs; }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    send({ content: input });
    setInput('');
    setEmojiOpen(false);
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file);
      send({ content: input.trim() || undefined, imageUrl: url });
      setInput('');
    } catch (err: any) {
      usePublicChatStore.setState({ error: err.response?.data?.message ?? "Impossible d'envoyer l'image" });
    } finally { setBusy(false); }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { url, name, size } = await uploadFile(file);
      send({ content: input.trim() || undefined, fileUrl: url, fileName: name, fileSize: size });
      setInput('');
    } catch (err: any) {
      usePublicChatStore.setState({ error: err.response?.data?.message ?? "Impossible d'envoyer le fichier" });
    } finally { setBusy(false); }
  }

  const grouped = messages.map((m, i) => ({ ...m, showMeta: i === 0 || messages[i - 1].user.id !== m.user.id }));

  return (
    <div className={`public-chat${compact ? ' compact' : ''}`}>
      <div className="public-chat-main">
        <div className="public-chat-body">
          {grouped.length === 0 && <p className="muted" style={{ textAlign: 'center' }}>Aucun message pour l'instant — lance la discussion.</p>}
          {grouped.map((m) => (
            <MessageRow key={m.id} msg={m} showMeta={m.showMeta} seenHere={seenByMessage.get(m.id) ?? []} isStaff={isStaff} />
          ))}
          <div ref={listEndRef} />
        </div>
        {typingNames.length > 0 && (
          <div className="chat-typing-bar muted">
            {typingNames.join(', ')} {typingNames.length > 1 ? 'sont en train d\'écrire' : 'est en train d\'écrire'}…
          </div>
        )}
        {error && <div className="chat-typing-bar" style={{ color: 'var(--danger)' }}>{error}</div>}
        <form className="public-chat-composer" onSubmit={submit}>
          <input type="file" accept="image/jpeg,image/png,image/webp" ref={imageInput} hidden onChange={onPickImage} />
          <input type="file" ref={fileInput} hidden onChange={onPickFile} />
          <button type="button" title="Envoyer une photo" disabled={busy} onClick={() => imageInput.current?.click()}>🖼️</button>
          <button type="button" title="Joindre un fichier" disabled={busy} onClick={() => fileInput.current?.click()}>📎</button>
          <div style={{ position: 'relative', flex: 1 }}>
            <input placeholder="Écris un message..." value={input} onChange={(e) => onInput(e.target.value)} maxLength={500} />
            {emojiOpen && (
              <div className="chat-emoji-grid chat-emoji-grid-composer">
                {EMOJI_GRID.map((e) => (
                  <button key={e} type="button" onClick={() => setInput((v) => v + e)}>{e}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" title="Emoji" onClick={() => setEmojiOpen((v) => !v)}>😀</button>
          <button type="submit" disabled={!input.trim()}>Envoyer</button>
        </form>
      </div>
      <MembersList />
    </div>
  );
}
