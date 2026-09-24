import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import UserLink from '../components/UserLink';
import Avatar from '../components/Avatar';
import SearchBox from '../components/SearchBox';
import WysiwygEditor from '../components/WysiwygEditor';
import { bbcodeToHtml } from '../lib/bbcode';
import { timeAgo } from '../lib/time';

/** Messagerie privée en conversations : liste à gauche, fil et réponse à droite. */
export default function Messages() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('thread');
  const prefilledTo = params.get('to') ?? '';

  const [threads, setThreads] = useState<any[] | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [composing, setComposing] = useState(!!prefilledTo);
  const [reply, setReply] = useState('');
  const [replyKey, setReplyKey] = useState(0);
  const [form, setForm] = useState({ recipientUsername: prefilledTo, subject: '', content: '' });
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => api.get('/messages/threads').then((r) => setThreads(r.data)).catch(() => setThreads([]));
  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    if (!openId) { setThread(null); return; }
    api.get(`/messages/thread/${openId}`).then((r) => { setThread(r.data); loadThreads(); }).catch(() => { setThread(null); setError('Conversation introuvable'); });
  }, [openId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/messages/send', form);
      setForm({ recipientUsername: '', subject: '', content: '' });
      setFormKey((k) => k + 1);
      setComposing(false);
      await loadThreads();
      setParams({ thread: data.threadId });
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi impossible');
    } finally { setBusy(false); }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !openId) return;
    setBusy(true); setError('');
    try {
      await api.post(`/messages/thread/${openId}/reply`, { content: reply });
      setReply(''); setReplyKey((k) => k + 1);
      const { data } = await api.get(`/messages/thread/${openId}`);
      setThread(data);
      loadThreads();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi impossible');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!openId || !window.confirm('Supprimer cette conversation de ta boîte ? (L\'autre personne la garde.)')) return;
    await api.delete(`/messages/thread/${openId}`).catch(() => {});
    setParams({});
    loadThreads();
  }

  const unreadTotal = (threads ?? []).reduce((n, t) => n + t.unread, 0);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>✉️ Messages {unreadTotal > 0 && <span className="badge new">{unreadTotal} non lu(s)</span>}</h1>
        <button type="button" onClick={() => { setComposing(true); setParams({}); }}>＋ Nouveau message</button>
      </div>

      <div className="msg-layout">
        <div className="panel msg-list">
          {threads === null && <p className="muted">Chargement...</p>}
          {threads?.length === 0 && <p className="muted">Aucune conversation pour l'instant.</p>}
          {threads?.map((t) => (
            <div
              key={t.threadId}
              className={`msg-item${openId === t.threadId ? ' active' : ''}${t.unread ? ' unread' : ''}`}
              onClick={() => { setComposing(false); setParams({ thread: t.threadId }); }}
            >
              <Avatar user={t.other} size={38} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.other?.username}</strong>
                  <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{timeAgo(t.last.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.last.fromMe ? 'Toi : ' : ''}{t.last.snippet}
                </div>
              </div>
              {t.unread > 0 && <span className="badge new">{t.unread}</span>}
            </div>
          ))}
        </div>

        <div className="panel msg-view">
          {composing || (!openId && !thread) ? (
            <form onSubmit={send} className="grid" style={{ gap: 10 }}>
              <h3>Nouveau message</h3>
              <SearchBox
                placeholder="Destinataire (commence à taper un nom d'utilisateur)"
                value={form.recipientUsername}
                onChange={(v) => setForm((f) => ({ ...f, recipientUsername: v }))}
                scopes={['users']}
                onPickUser={() => undefined}
                inputStyle={{ width: '100%' }}
              />
              <input placeholder="Sujet" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} required />
              <WysiwygEditor key={formKey} value={form.content} onChange={(v) => setForm((f) => ({ ...f, content: v }))} minHeight={180} placeholder="Ton message..." />
              {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
              <button type="submit" style={{ alignSelf: 'flex-start' }} disabled={busy || !form.content.trim()}>{busy ? 'Envoi...' : 'Envoyer'}</button>
            </form>
          ) : thread ? (
            <div className="grid" style={{ gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{thread.subject.replace(/^Re: /, '')}</h3>
                  <div className="muted">Avec <UserLink user={thread.other} /></div>
                </div>
                <button type="button" className="secondary" onClick={remove}>🗑️ Supprimer</button>
              </div>

              <div className="msg-thread">
                {thread.messages.map((m: any) => (
                  <div key={m.id} className={`msg-bubble${m.fromMe ? ' mine' : ''}`}>
                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                      {m.fromMe ? 'Toi' : m.sender.username} · {new Date(m.createdAt).toLocaleString('fr-FR')}
                    </div>
                    <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(m.content) }} />
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={sendReply} className="grid" style={{ gap: 8 }}>
                <WysiwygEditor key={replyKey} value={reply} onChange={setReply} minHeight={110} placeholder="Ta réponse..." />
                {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
                <button type="submit" style={{ alignSelf: 'flex-start' }} disabled={busy || !reply.trim()}>{busy ? 'Envoi...' : 'Répondre'}</button>
              </form>
            </div>
          ) : (
            <p className="muted">{error || 'Chargement...'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
