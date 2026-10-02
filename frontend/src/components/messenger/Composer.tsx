import { useEffect, useMemo, useRef, useState } from 'react';
import { useMessenger, type Msg, type MsgUser } from '../../store/messenger';
import { EMOJI_GRID } from '../../lib/emoji';
import { uploadAttachment } from '../../lib/messengerUpload';
import Avatar from '../Avatar';
import ShareTorrentModal from './ShareTorrentModal';

// Brouillons : ce qu'on a commencé à écrire dans une conversation est gardé quand on passe à une autre.
const drafts = new Map<string, string>();
const TYPING_EVERY_MS = 1500;
const MENTION_AT_CARET = /(^|\s)@([\p{L}\p{N}_.-]{0,32})$/u;

interface Props {
  conversationId: string;
  writable: boolean;
  /** Personnes qu'on peut @mentionner dans cette conversation. */
  people: MsgUser[];
  replyTo: Msg | null;
  onCancelReply: () => void;
  editing: Msg | null;
  onCancelEdit: () => void;
  compact?: boolean;
  /** Fichiers déposés / collés (la vue les gère aussi par glisser-déposer). */
  droppedFiles?: File[];
  onFilesHandled?: () => void;
}

export default function Composer({ conversationId, writable, people, replyTo, onCancelReply, editing, onCancelEdit, compact, droppedFiles, onFilesHandled }: Props) {
  const send = useMessenger((s) => s.send);
  const edit = useMessenger((s) => s.edit);
  const typingPing = useMessenger((s) => s.typingPing);
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '');
  const [emoji, setEmoji] = useState(false);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mention, setMention] = useState<{ query: string; index: number } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  // Changement de conversation : on reprend son brouillon.
  useEffect(() => { setText(drafts.get(conversationId) ?? ''); setMention(null); setError(''); }, [conversationId]);
  useEffect(() => { drafts.set(conversationId, editing ? drafts.get(conversationId) ?? '' : text); }, [text, conversationId, editing]);

  // Modifier un message : le texte d'origine remplace le champ, et le brouillon revient à la fin.
  const savedDraft = useRef('');
  useEffect(() => {
    if (editing) { savedDraft.current = text; setText(editing.content); area.current?.focus(); }
    else if (savedDraft.current) { setText(savedDraft.current); savedDraft.current = ''; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);
  useEffect(() => { if (replyTo) area.current?.focus(); }, [replyTo?.id]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return people.filter((p) => p.username.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, people]);

  async function sendFile(file: File, caption?: string) {
    setBusy(true); setError('');
    try {
      const part = await uploadAttachment(file);
      send(conversationId, { ...part, content: caption || undefined, replyToId: replyTo?.id });
      onCancelReply();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Impossible d'envoyer ce fichier");
    } finally { setBusy(false); }
  }

  // Fichiers déposés sur la conversation.
  useEffect(() => {
    if (!droppedFiles?.length) return;
    onFilesHandled?.();
    droppedFiles.slice(0, 5).forEach((f, i) => sendFile(f, i === 0 ? text.trim() : undefined));
    if (text.trim()) setText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFiles]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(MENTION_AT_CARET);
    setMention(m ? { query: m[2], index: 0 } : null);
    const now = Date.now();
    if (!editing && v.trim() && now - lastTyping.current > TYPING_EVERY_MS) { typingPing(conversationId); lastTyping.current = now; }
  }

  function pickMention(p: MsgUser) {
    const el = area.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(MENTION_AT_CARET, (_m, lead) => `${lead}@${p.username} `);
    const next = before + text.slice(caret);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }

  async function submit() {
    const v = text.trim();
    if (!v || busy) return;
    if (editing) {
      const err = await edit(editing.id, v);
      if (err) { setError(err); return; }
      setText(''); onCancelEdit();
      return;
    }
    send(conversationId, { content: v, replyToId: replyTo?.id });
    drafts.delete(conversationId);
    setText(''); setEmoji(false); setMention(null); onCancelReply();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length && (e.key === 'Tab' || e.key === 'Enter')) { e.preventDefault(); pickMention(suggestions[mention?.index ?? 0] ?? suggestions[0]); return; }
    if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setMention((m) => (m ? { ...m, index: (m.index + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length } : m));
      return;
    }
    if (e.key === 'Escape') { if (mention) setMention(null); else if (editing) onCancelEdit(); else if (replyTo) onCancelReply(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.files];
    if (files.length) { e.preventDefault(); files.slice(0, 3).forEach((f) => sendFile(f)); }
  }

  if (!writable) return <div className="msgr-readonly">🔒 Seule la modération peut écrire dans ce canal.</div>;

  return (
    <div className={`msgr-composer${compact ? ' compact' : ''}`}>
      {(replyTo || editing) && (
        <div className="msgr-composer-bar">
          <span>{editing ? '✏️ Modification du message' : <>↩ Réponse à <strong>{replyTo!.sender.username}</strong> : <span className="muted">{(replyTo!.content || 'pièce jointe').slice(0, 70)}</span></>}</span>
          <button type="button" className="dm-icon-btn" onClick={editing ? onCancelEdit : onCancelReply} aria-label="Annuler">✕</button>
        </div>
      )}
      {error && <div className="msgr-composer-error" onClick={() => setError('')}>{error}</div>}
      {suggestions.length > 0 && (
        <div className="msgr-mention-list" role="listbox">
          {suggestions.map((p, i) => (
            <button key={p.id} type="button" role="option" aria-selected={i === (mention?.index ?? 0)} className={i === (mention?.index ?? 0) ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}>
              <Avatar user={p} size={20} /> {p.username}
            </button>
          ))}
        </div>
      )}
      <div className="msgr-composer-row">
        {!editing && (
          <>
            <input ref={fileInput} type="file" hidden multiple onChange={(e) => { [...(e.target.files ?? [])].slice(0, 5).forEach((f) => sendFile(f)); e.target.value = ''; }} />
            <button type="button" className="chat-icon-btn lg" title="Photo ou fichier" disabled={busy} onClick={() => fileInput.current?.click()}>📎</button>
            <button type="button" className="chat-icon-btn lg" title="Partager un torrent" onClick={() => setShare(true)}>🎬</button>
          </>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={editing ? 'Modifier le message…' : 'Écris un message…'}
          maxLength={4000}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-label="Message"
        />
        <div style={{ position: 'relative' }}>
          <button type="button" className="chat-icon-btn lg" title="Emoji" onClick={() => setEmoji((v) => !v)}>😀</button>
          {emoji && (
            <div className="chat-emoji-grid msgr-emoji-pop">
              {EMOJI_GRID.map((e) => <button key={e} type="button" onClick={() => { setText((v) => v + e); area.current?.focus(); }}>{e}</button>)}
            </div>
          )}
        </div>
        <button type="button" className="chat-send-btn" disabled={!text.trim() || busy} title={editing ? 'Enregistrer' : 'Envoyer'} aria-label="Envoyer" onClick={submit}>{editing ? '✓' : '➤'}</button>
      </div>
      {share && <ShareTorrentModal onClose={() => setShare(false)} onPick={(torrentId) => { setShare(false); send(conversationId, { torrentId, content: text.trim() || undefined, replyToId: replyTo?.id }); setText(''); drafts.delete(conversationId); onCancelReply(); }} />}
    </div>
  );
}
