import { useEffect, useMemo, useRef, useState } from 'react';
import { useMessenger, type Msg, type MsgUser } from '../../store/messenger';
import { EMOJI_GRID, STICKERS } from '../../lib/emoji';
import { canRecordVoice, pickRecorderMime, uploadAttachment, uploadVoice } from '../../lib/messengerUpload';
import Avatar from '../Avatar';
import ShareTorrentModal from './ShareTorrentModal';
import GifPicker from './GifPicker';
import ChatEditor, { type ChatEditorHandle, type ChatFormat } from './ChatEditor';
import PollModal from './PollModal';
import { useAuthStore } from '../../store/auth';
import { plainMarkup } from '../../lib/chatFormat';

// Brouillons : ce qu'on a commencé à écrire dans une conversation est gardé quand on passe à une autre, et même après un rechargement de la page (sur cet appareil).
const DRAFTS_KEY = 'msgr-drafts';
const readDrafts = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}') || {}; } catch { return {}; } };
const mem = new Map<string, string>(Object.entries(readDrafts()));
const drafts = {
  get: (id: string) => mem.get(id),
  set(id: string, v: string) {
    if (v) mem.set(id, v); else mem.delete(id);
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(Object.fromEntries([...mem].slice(-40)))); } catch { /* brouillon valable pour cette visite seulement */ }
  },
  delete(id: string) { this.set(id, ''); },
};
/** Mise en forme proposée sous le bouton « Aa » : marqueur ouvrant / fermant, exemple affiché. */
const FORMATS: { label: string; title: string; fmt: ChatFormat; keys?: string; style?: React.CSSProperties }[] = [
  { label: 'B', title: 'Gras', fmt: 'bold', keys: 'Ctrl+B', style: { fontWeight: 900 } },
  { label: 'I', title: 'Italique', fmt: 'italic', keys: 'Ctrl+I', style: { fontStyle: 'italic' } },
  { label: 'S', title: 'Barré', fmt: 'strike', keys: 'Ctrl+Maj+X', style: { textDecoration: 'line-through' } },
  { label: '</>', title: 'Code', fmt: 'code', keys: 'Ctrl+E' },
  { label: '▮▮', title: 'Spoiler (un clic le révèle)', fmt: 'spoiler' },
  { label: '❝', title: 'Citation', fmt: 'quote' },
];
const TYPING_EVERY_MS = 1500;
const MAX_VOICE_MS = 5 * 60 * 1000;

interface Props {
  conversationId: string;
  writable: boolean;
  /** Bannissement du chat en cours : le champ de saisie est remplacé par la raison et la date de fin. */
  ban?: { reason: string; expiresAt: string | null } | null;
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

export default function Composer({ conversationId, writable, ban, people, replyTo, onCancelReply, editing, onCancelEdit, compact, droppedFiles, onFilesHandled }: Props) {
  const send = useMessenger((s) => s.send);
  const edit = useMessenger((s) => s.edit);
  const typingPing = useMessenger((s) => s.typingPing);
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '');
  const [emoji, setEmoji] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'sticker' | 'gif'>('emoji');
  const [rec, setRec] = useState<{ startedAt: number } | null>(null);
  const [recMs, setRecMs] = useState(0);
  const [share, setShare] = useState(false);
  const [fmt, setFmt] = useState(false);
  const [poll, setPoll] = useState(false);
  // Fenêtre flottante (étroite) : les outils rares (photo, torrent, sondage, mise en forme) se rangent derrière un « + » pour laisser la place au texte.
  const [tools, setTools] = useState(false);
  const conv = useMessenger((s) => s.conversations.find((c) => c.id === conversationId));
  const myRole = useAuthStore((s) => s.user?.role);
  // Sondage : conversations privées et groupes ; dans un canal public, la modération seulement.
  const canPoll = !!conv && (conv.type !== 'CHANNEL' || ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(myRole ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mention, setMention] = useState<{ query: string; index: number } | null>(null);
  const area = useRef<ChatEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; send: boolean } | null>(null);
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

  async function startRecording() {
    if (recorder.current || busy) return;
    setError('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Impossible d'accéder au micro : autorise-le dans les réglages du navigateur.");
      return;
    }
    const mime = pickRecorderMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const state = { mr, stream, chunks: [] as Blob[], startedAt: Date.now(), send: false };
    recorder.current = state;
    mr.ondataavailable = (e) => { if (e.data.size) state.chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRec(null);
      const durationMs = Date.now() - state.startedAt;
      if (!state.send || durationMs < 600 || !state.chunks.length) return;
      setBusy(true);
      try {
        const part = await uploadVoice(new Blob(state.chunks, { type: mr.mimeType || mime || 'audio/webm' }), durationMs);
        send(conversationId, { ...part, replyToId: replyTo?.id });
        onCancelReply();
      } catch (err: any) {
        setError(err.response?.data?.message ?? "Impossible d'envoyer le message vocal");
      } finally { setBusy(false); }
    };
    mr.start(250);
    setRec({ startedAt: state.startedAt });
    setRecMs(0);
  }

  function stopRecording(sendIt: boolean) {
    const r = recorder.current;
    if (!r) return;
    r.send = sendIt;
    if (r.mr.state !== 'inactive') r.mr.stop();
  }

  // Compteur du vocal en cours ; l'enregistrement s'arrête et part tout seul au bout de 5 minutes.
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const ms = Date.now() - rec.startedAt;
      setRecMs(ms);
      if (ms >= MAX_VOICE_MS) stopRecording(true);
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  // Changer de conversation ou quitter : on abandonne un enregistrement en cours (le micro doit être libéré).
  useEffect(() => () => { const r = recorder.current; if (r) { r.send = false; if (r.mr.state !== 'inactive') r.mr.stop(); } }, [conversationId]);

  // Fichiers déposés sur la conversation.
  useEffect(() => {
    if (!droppedFiles?.length) return;
    onFilesHandled?.();
    droppedFiles.slice(0, 5).forEach((f, i) => sendFile(f, i === 0 ? text.trim() : undefined));
    if (text.trim()) setText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFiles]);

  function sendSticker(emoji: string) {
    send(conversationId, { content: emoji, replyToId: replyTo?.id });
    setEmoji(false); onCancelReply();
  }

  function onChange(v: string) {
    setText(v);
    const q = area.current?.mentionQuery() ?? null;
    setMention(q !== null ? { query: q, index: 0 } : null);
    const now = Date.now();
    if (!editing && v.trim() && now - lastTyping.current > TYPING_EVERY_MS) { typingPing(conversationId); lastTyping.current = now; }
  }

  function pickMention(p: MsgUser) {
    area.current?.replaceMention(p.username);
    setMention(null);
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

  // Les raccourcis de mise en forme (Ctrl+B, Ctrl+I, Ctrl+E, Ctrl+Maj+X) sont gérés par l'éditeur lui-même.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (suggestions.length && (e.key === 'Tab' || e.key === 'Enter')) { e.preventDefault(); pickMention(suggestions[mention?.index ?? 0] ?? suggestions[0]); return; }
    if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setMention((m) => (m ? { ...m, index: (m.index + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length } : m));
      return;
    }
    if (e.key === 'Escape') { if (mention) setMention(null); else if (editing) onCancelEdit(); else if (replyTo) onCancelReply(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files = [...e.clipboardData.files];
    if (files.length) { e.preventDefault(); files.slice(0, 3).forEach((f) => sendFile(f)); }
  }

  if (ban) {
    return (
      <div className="msgr-readonly msgr-banned">
        🚫 Tu es banni du chat {ban.expiresAt ? `jusqu'au ${new Date(ban.expiresAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}` : 'définitivement'}.<br />
        <span className="muted">Raison : {ban.reason}</span>
      </div>
    );
  }
  if (!writable) return <div className="msgr-readonly">🔒 Seule la modération peut écrire dans ce canal.</div>;

  return (
    <div className={`msgr-composer${compact ? ' compact' : ''}`}>
      {(replyTo || editing) && (
        <div className="msgr-composer-bar">
          <span>{editing ? '✏️ Modification du message' : <>↩ Réponse à <strong>{replyTo!.sender.username}</strong> : <span className="muted">{plainMarkup(replyTo!.content || 'pièce jointe').slice(0, 70)}</span></>}</span>
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
      {rec ? (
        <div className="msgr-composer-row msgr-recording">
          <button type="button" className="chat-icon-btn lg" title="Annuler" onClick={() => stopRecording(false)}>🗑️</button>
          <span className="msgr-rec-dot" />
          <span className="msgr-rec-time">{Math.floor(recMs / 60000)}:{String(Math.floor(recMs / 1000) % 60).padStart(2, '0')}</span>
          <span className="muted msgr-rec-hint">Enregistrement…</span>
          <button type="button" className="chat-send-btn" title="Envoyer le vocal" aria-label="Envoyer le vocal" onClick={() => stopRecording(true)}>➤</button>
        </div>
      ) : (
      <>
      {!editing && compact && tools && (
        <div className="msgr-tools-row" role="toolbar" aria-label="Plus d'actions">
          <button type="button" className="msgr-tool" disabled={busy} onClick={() => { setTools(false); fileInput.current?.click(); }}>📎 <span>Photo ou fichier</span></button>
          <button type="button" className="msgr-tool" onClick={() => { setTools(false); setShare(true); }}>🎬 <span>Torrent</span></button>
          {canPoll && <button type="button" className="msgr-tool" onClick={() => { setTools(false); setPoll(true); }}>📊 <span>Sondage</span></button>}
          <div className="msgr-emoji-anchor">
            <button type="button" className="msgr-tool" aria-label="Mise en forme" onClick={() => setFmt((v) => !v)}>Aa <span>Mise en forme</span></button>
            {fmt && (
              <div className="msgr-fmt-pop" role="toolbar" aria-label="Mise en forme">
                {FORMATS.map((f) => (
                  <button key={f.title} type="button" style={f.style} title={`${f.title}${f.keys ? ` (${f.keys})` : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { area.current?.format(f.fmt); setFmt(false); setTools(false); }}>{f.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="msgr-composer-row">
        {!editing && <input ref={fileInput} type="file" hidden multiple onChange={(e) => { [...(e.target.files ?? [])].slice(0, 5).forEach((f) => sendFile(f)); e.target.value = ''; }} />}
        {!editing && compact && (
          <button type="button" className={`chat-icon-btn lg msgr-more${tools ? ' on' : ''}`} title="Plus d'actions : photo, torrent, sondage, mise en forme" aria-label="Plus d'actions" aria-expanded={tools} onClick={() => { setTools((v) => !v); setFmt(false); }}>{tools ? '✕' : '＋'}</button>
        )}
        {!editing && !compact && (
          <>
            <button type="button" className="chat-icon-btn lg" title="Photo ou fichier" disabled={busy} onClick={() => fileInput.current?.click()}>📎</button>
            <button type="button" className="chat-icon-btn lg" title="Partager un torrent" onClick={() => setShare(true)}>🎬</button>
            {canPoll && <button type="button" className="chat-icon-btn lg" title="Créer un sondage" onClick={() => setPoll(true)}>📊</button>}
          </>
        )}
        <ChatEditor
          ref={area}
          value={text}
          placeholder={editing ? 'Modifier le message…' : 'Écris un message…'}
          maxLength={4000}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        {!compact && <div className="msgr-emoji-anchor">
          <button type="button" className="chat-icon-btn lg" title="Mise en forme : gras, italique, code, spoiler, citation" aria-label="Mise en forme" onClick={() => setFmt((v) => !v)}>Aa</button>
          {fmt && (
            <div className="msgr-fmt-pop" role="toolbar" aria-label="Mise en forme">
              {FORMATS.map((f) => (
                <button key={f.title} type="button" style={f.style} title={`${f.title}${f.keys ? ` (${f.keys})` : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { area.current?.format(f.fmt); setFmt(false); }}>{f.label}</button>
              ))}
            </div>
          )}
        </div>}
        {!editing && (
          <div className="msgr-emoji-anchor">
            <button type="button" className="chat-icon-btn lg" title="Émojis, autocollants et GIF" onClick={() => setEmoji((v) => !v)}>😀</button>
            {emoji && (
              <div className={`msgr-emoji-pop${tab === 'gif' ? ' wide' : ''}`}>
                <div className="msgr-pop-tabs" role="tablist">
                  {([['emoji', 'Émojis'], ['sticker', 'Autocollants'], ['gif', 'GIF']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
                  ))}
                </div>
                {tab === 'emoji' && (
                  <div className="chat-emoji-grid">
                    {EMOJI_GRID.map((e) => <button key={e} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => area.current?.insertText(e)}>{e}</button>)}
                  </div>
                )}
                {tab === 'sticker' && (
                  <div className="msgr-sticker-grid">
                    {STICKERS.map((e) => <button key={e} type="button" onClick={() => sendSticker(e)}>{e}</button>)}
                  </div>
                )}
                {tab === 'gif' && (
                  <>
                    <input ref={gifInput} type="file" accept="image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setEmoji(false); sendFile(f); } }} />
                    <GifPicker
                      busy={busy}
                      onUploadClick={() => gifInput.current?.click()}
                      onPick={(url) => { send(conversationId, { type: 'GIF', imageUrl: url, replyToId: replyTo?.id }); setEmoji(false); onCancelReply(); }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {!editing && !text.trim() && canRecordVoice() ? (
          <button type="button" className="chat-send-btn mic" disabled={busy} title="Message vocal" aria-label="Enregistrer un message vocal" onClick={startRecording}>🎤</button>
        ) : (
          <button type="button" className="chat-send-btn" disabled={!text.trim() || busy} title={editing ? 'Enregistrer' : 'Envoyer'} aria-label="Envoyer" onClick={submit}>{editing ? '✓' : <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><path d="M2.5 20.5 22 12 2.5 3.5l.01 6.6L15 12 2.5 13.9z" /></svg>}</button>
        )}
      </div>
      </>
      )}
      {poll && <PollModal conversationId={conversationId} onClose={() => setPoll(false)} />}
      {share && <ShareTorrentModal onClose={() => setShare(false)} onPick={(torrentId) => { setShare(false); send(conversationId, { torrentId, content: text.trim() || undefined, replyToId: replyTo?.id }); setText(''); drafts.delete(conversationId); onCancelReply(); }} />}
    </div>
  );
}
