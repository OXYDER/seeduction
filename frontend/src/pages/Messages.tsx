import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useMessenger, statusOf } from '../store/messenger';
import { STATUS_COLOR } from '../lib/presence';
import UserLink from '../components/UserLink';
import Avatar from '../components/Avatar';
import SearchBox from '../components/SearchBox';
import WysiwygEditor from '../components/WysiwygEditor';
import { bbcodeToHtml } from '../lib/bbcode';
import { dayLabel, isSameDay } from '../lib/chatFormat';
import { timeAgo } from '../lib/time';

type Filter = 'all' | 'unread' | 'sent';
interface Person { id?: string; username: string; avatarUrl?: string | null }

const draftKey = (k: string) => `pm-draft:${k}`;
const readDraft = (k: string) => { try { return JSON.parse(localStorage.getItem(draftKey(k)) ?? 'null'); } catch { return null; } };
const writeDraft = (k: string, v: unknown) => { try { if (v) localStorage.setItem(draftKey(k), JSON.stringify(v)); else localStorage.removeItem(draftKey(k)); } catch { /* navigation privée */ } };
const plain = (s: string) => s.replace(/\[[^\]]*\]/g, '').trim();
const clock = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Pastille de présence au coin d'un avatar. */
function PresenceAvatar({ user, size }: { user?: Person | null; size: number }) {
  const online = useMessenger((s) => s.online);
  const status = statusOf(online, user?.id);
  return (
    <span className="pm-avatar" style={{ width: size, height: size }}>
      <Avatar user={user} size={size} />
      {status !== 'OFFLINE' && <i className="pm-dot" style={{ background: STATUS_COLOR[status] }} />}
    </span>
  );
}

/** Messagerie privée (avec sujet, mise en forme et historique) : liste des conversations à gauche, fil et réponse à droite. */
export default function Messages() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('thread');
  const prefilledTo = params.get('to') ?? '';
  const openDirect = useMessenger((s) => s.openDirect);

  const [threads, setThreads] = useState<any[] | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(!!prefilledTo);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [friends, setFriends] = useState<Person[]>([]);

  // Nouveau message
  const [to, setTo] = useState<Person | null>(prefilledTo ? { username: prefilledTo } : null);
  const [toText, setToText] = useState('');
  const [subject, setSubject] = useState(() => readDraft('new')?.subject ?? '');
  const [content, setContent] = useState<string>(() => readDraft('new')?.content ?? '');
  const [formKey, setFormKey] = useState(0);

  // Réponse
  const [reply, setReply] = useState('');
  const [replyKey, setReplyKey] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback((term = q) => {
    api.get('/messages/threads', { params: term.trim().length >= 2 ? { q: term.trim() } : {} }).then((r) => setThreads(r.data)).catch(() => setThreads([]));
  }, [q]);
  useEffect(() => { const h = setTimeout(() => loadThreads(q), q ? 300 : 0); return () => clearTimeout(h); }, [q, loadThreads]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) loadThreads(); }, 30_000); return () => clearInterval(t); }, [loadThreads]);
  useEffect(() => { api.get('/friends').then((r) => setFriends((r.data.friends ?? []).map((f: any) => f.user ?? f))).catch(() => {}); }, []);

  const loadThread = useCallback((id: string) => {
    return api.get(`/messages/thread/${id}`).then((r) => { setThread(r.data); loadThreads(); }).catch(() => { setThread(null); setError('Conversation introuvable'); });
  }, [loadThreads]);

  useEffect(() => {
    setError('');
    if (!openId) { setThread(null); return; }
    setComposing(false);
    void loadThread(openId);
    const d = readDraft(`thread:${openId}`);
    setReply(typeof d === 'string' ? d : '');
    setReplyKey((k) => k + 1);
  }, [openId, loadThread]);
  // Nouvelle réponse de l'autre personne pendant qu'on lit : on relit le fil toutes les 20 secondes.
  useEffect(() => {
    if (!openId) return;
    const t = setInterval(() => { if (!document.hidden) api.get(`/messages/thread/${openId}`).then((r) => setThread((cur: any) => (cur && r.data.messages.length === cur.messages.length ? cur : r.data))).catch(() => {}); }, 20_000);
    return () => clearInterval(t);
  }, [openId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages?.length, openId]);

  // Brouillons : conservés si on change de page ou de conversation.
  useEffect(() => { if (openId) writeDraft(`thread:${openId}`, plain(reply) ? reply : null); }, [reply, openId]);
  useEffect(() => { writeDraft('new', subject.trim() || plain(content) ? { subject, content } : null); }, [subject, content]);

  const unreadTotal = (threads ?? []).reduce((n, t) => n + t.unread, 0);
  const shown = useMemo(() => (threads ?? []).filter((t) => filter === 'all' || (filter === 'unread' ? t.unread > 0 : t.last.fromMe)), [threads, filter]);
  const recipient = to?.username ?? toText.trim();

  function startCompose(person?: Person) {
    setComposing(true); setParams({}); setError('');
    if (person) { setTo(person); setToText(''); }
  }

  async function send() {
    if (!recipient) { setError('Choisis un destinataire'); return; }
    if (!subject.trim()) { setError('Ajoute un sujet'); return; }
    if (!plain(content)) { setError('Écris ton message'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/messages/send', { recipientUsername: recipient, subject, content });
      setTo(null); setToText(''); setSubject(''); setContent(''); setFormKey((k) => k + 1); writeDraft('new', null);
      setComposing(false);
      setParams({ thread: data.threadId });
    } catch (err: any) { setError(err.response?.data?.message ?? 'Envoi impossible'); }
    finally { setBusy(false); }
  }

  async function sendReply() {
    if (!plain(reply) || !openId) return;
    setBusy(true); setError('');
    try {
      await api.post(`/messages/thread/${openId}/reply`, { content: reply });
      setReply(''); setReplyKey((k) => k + 1); writeDraft(`thread:${openId}`, null);
      await loadThread(openId);
    } catch (err: any) { setError(err.response?.data?.message ?? 'Envoi impossible'); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!openId || !window.confirm("Supprimer cette conversation de ta boîte ? (L'autre personne la garde.)")) return;
    await api.delete(`/messages/thread/${openId}`).catch(() => {});
    writeDraft(`thread:${openId}`, null);
    setParams({}); loadThreads();
  }
  async function markUnread() {
    if (!openId) return;
    await api.post(`/messages/thread/${openId}/unread`).catch(() => {});
    setParams({}); loadThreads();
  }
  async function readAll() { await api.post('/messages/threads/read-all').catch(() => {}); loadThreads(); }

  function quote(m: any) {
    const who = m.fromMe ? 'Toi' : m.sender.username;
    setReply((r) => `${r}${r.trim() ? '\n' : ''}[quote=${who}]${m.content.replace(/\[quote(=[^\]]*)?\][\s\S]*?\[\/quote\]/gi, '').trim()}[/quote]\n`);
    setReplyKey((k) => k + 1);
  }

  const onCtrlEnter = (fn: () => void) => (e: React.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); fn(); } };
  const hasRight = composing || !!openId;
  const quickFriends = friends.filter((f) => f.username !== recipient).slice(0, 8);

  return (
    <div className="pm-page">
      <div className="pm-head">
        <h1 style={{ margin: 0 }}>✉️ Messages {unreadTotal > 0 && <span className="badge new">{unreadTotal} non lu{unreadTotal > 1 ? 's' : ''}</span>}</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {unreadTotal > 0 && <button type="button" className="secondary" onClick={readAll}>✓ Tout marquer comme lu</button>}
          <button type="button" onClick={() => startCompose()}>＋ Nouveau message</button>
        </div>
      </div>

      <div className={`pm-layout${hasRight ? ' has-right' : ''}`}>
        {/* ------------------------------------------------ liste des conversations */}
        <aside className="panel pm-list">
          <div className="pm-search"><input placeholder="🔎 Chercher (sujet, texte, membre)…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="pm-filters">
            {([['all', 'Toutes'], ['unread', `Non lues${unreadTotal ? ` (${unreadTotal})` : ''}`], ['sent', 'Envoyées']] as [Filter, string][]).map(([k, label]) => (
              <button key={k} type="button" className={filter === k ? 'on' : 'secondary'} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <div className="pm-items">
            {threads === null && <p className="muted" style={{ padding: 12 }}>Chargement…</p>}
            {threads && shown.length === 0 && (
              <div className="pm-empty-list">
                <span style={{ fontSize: 30 }}>{q ? '🔎' : filter === 'unread' ? '🎉' : '📭'}</span>
                <span className="muted">{q ? 'Aucune conversation ne correspond.' : filter === 'unread' ? 'Tout est lu !' : filter === 'sent' ? 'Aucun message envoyé en dernier.' : "Aucune conversation pour l'instant."}</span>
                {!q && filter === 'all' && <button type="button" onClick={() => startCompose()}>Écrire à quelqu'un</button>}
              </div>
            )}
            {shown.map((t) => (
              <button type="button" key={t.threadId} className={`pm-item${openId === t.threadId ? ' active' : ''}${t.unread ? ' unread' : ''}`} onClick={() => { setComposing(false); setParams({ thread: t.threadId }); }}>
                <PresenceAvatar user={t.other} size={42} />
                <span className="pm-item-body">
                  <span className="pm-item-top"><strong>{t.other?.username ?? 'Membre'}</strong><span className="muted">{timeAgo(t.last.createdAt)}</span></span>
                  <span className="pm-item-subject">{t.subject}</span>
                  <span className="muted pm-item-snippet">{t.last.fromMe ? 'Toi : ' : ''}{t.last.snippet}</span>
                </span>
                {t.unread > 0 && <span className="badge new">{t.unread}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* ------------------------------------------------ côté droit */}
        <main className="panel pm-main">
          {composing ? (
            <div className="pm-compose" onKeyDown={onCtrlEnter(send)}>
              <div className="pm-main-head">
                <button type="button" className="secondary pm-back" onClick={() => setComposing(false)}>← Retour</button>
                <h3 style={{ margin: 0 }}>Nouveau message</h3>
              </div>
              <div className="pm-field">
                <span className="pm-label">À</span>
                {to ? (
                  <span className="pm-chip"><PresenceAvatar user={to} size={22} /> {to.username}<button type="button" title="Changer de destinataire" onClick={() => { setTo(null); setToText(''); }}>✕</button></span>
                ) : (
                  <SearchBox placeholder="Nom d'un membre…" value={toText} onChange={setToText} scopes={['users']} onPickUser={(u) => { setTo({ id: u.id, username: u.username }); setToText(''); }} inputStyle={{ width: '100%' }} autoFocus={!prefilledTo} />
                )}
              </div>
              {!to && quickFriends.length > 0 && (
                <div className="pm-quick"><span className="muted">Tes amis :</span>{quickFriends.map((f) => <button key={f.id} type="button" className="pm-chip pick" onClick={() => { setTo(f); setToText(''); }}><PresenceAvatar user={f} size={20} /> {f.username}</button>)}</div>
              )}
              <div className="pm-field"><span className="pm-label">Sujet</span><input placeholder="De quoi s'agit-il ?" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></div>
              <WysiwygEditor key={formKey} value={content} onChange={setContent} minHeight={220} placeholder="Ton message…" />
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
              <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={send} disabled={busy}>{busy ? 'Envoi…' : '✉️ Envoyer'}</button>
                <button type="button" className="secondary" onClick={() => setComposing(false)}>Fermer</button>
                <span className="muted pm-hint">Ctrl + Entrée pour envoyer · brouillon enregistré automatiquement</span>
              </div>
            </div>
          ) : thread ? (
            <div className="pm-thread-view">
              <div className="pm-main-head">
                <button type="button" className="secondary pm-back" onClick={() => setParams({})}>← Retour</button>
                <PresenceAvatar user={thread.other} size={44} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 className="pm-subject">{thread.subject.replace(/^Re: /, '')}</h3>
                  <div className="muted">Avec <UserLink user={thread.other} /> · {thread.messages.length} message{thread.messages.length > 1 ? 's' : ''}</div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="secondary" title="Continuer dans le chat instantané" onClick={() => thread.other && openDirect({ id: thread.other.id, username: thread.other.username, avatarUrl: thread.other.avatarUrl })}>💬 Chat</button>
                  <button type="button" className="secondary" title="Remettre cette conversation en non lue" onClick={markUnread}>● Non lu</button>
                  <button type="button" className="secondary" onClick={remove}>🗑️ Supprimer</button>
                </div>
              </div>

              <div className="pm-messages">
                {thread.messages.map((m: any, i: number) => (
                  <Fragment key={m.id}>
                    {(i === 0 || !isSameDay(thread.messages[i - 1].createdAt, m.createdAt)) && <div className="pm-day"><span>{dayLabel(m.createdAt)}</span></div>}
                    <div className={`pm-msg${m.fromMe ? ' mine' : ''}`}>
                      <PresenceAvatar user={m.sender} size={34} />
                      <div className="pm-bubble">
                        <div className="pm-bubble-head"><strong>{m.fromMe ? 'Toi' : m.sender.username}</strong><span className="muted" title={new Date(m.createdAt).toLocaleString('fr-FR')}>{clock(m.createdAt)}</span></div>
                        <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(m.content) }} />
                        <div className="pm-bubble-tools">
                          <button type="button" onClick={() => quote(m)}>↩ Citer</button>
                          <button type="button" onClick={() => { navigator.clipboard?.writeText(plain(m.content)).catch(() => {}); }}>📋 Copier</button>
                        </div>
                      </div>
                    </div>
                  </Fragment>
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="pm-reply" onKeyDown={onCtrlEnter(sendReply)}>
                <WysiwygEditor key={`${openId}:${replyKey}`} value={reply} onChange={setReply} minHeight={90} placeholder="Ta réponse…" />
                {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <button type="button" onClick={sendReply} disabled={busy || !plain(reply)}>{busy ? 'Envoi…' : '↩ Répondre'}</button>
                  <span className="muted pm-hint">Ctrl + Entrée pour envoyer · brouillon enregistré</span>
                </div>
              </div>
            </div>
          ) : openId ? (
            <p className="muted" style={{ padding: 20 }}>{error || 'Chargement…'}</p>
          ) : (
            <div className="pm-welcome">
              <span style={{ fontSize: 54 }}>✉️</span>
              <h2>Ta boîte de messages</h2>
              <p className="muted">Choisis une conversation à gauche, ou écris à quelqu'un. Pour discuter en direct, utilise plutôt le <a href="/chat">chat</a>.</p>
              <button type="button" onClick={() => startCompose()}>＋ Nouveau message</button>
              {friends.length > 0 && (
                <div className="pm-quick" style={{ justifyContent: 'center' }}>
                  <span className="muted">Écrire à :</span>
                  {friends.slice(0, 8).map((f) => <button key={f.id} type="button" className="pm-chip pick" onClick={() => startCompose(f)}><PresenceAvatar user={f} size={20} /> {f.username}</button>)}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
