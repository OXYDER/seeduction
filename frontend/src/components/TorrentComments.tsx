import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import UserLink from './UserLink';
import ReportButton from './ReportButton';
import WysiwygEditor from './WysiwygEditor';
import { Pagination } from './ForumBits';
import { ROLE_LABEL } from './StaffUserPanel';
import { bbcodeToHtml } from '../lib/bbcode';
import { timeAgo } from '../lib/time';
import { displayRank } from '../lib/memberClass';
import Avatar from './Avatar';

/** Commentaires sous un torrent : écrire, citer, modifier, supprimer, signaler. */
export default function TorrentComments({ torrentId }: { torrentId: string }) {
  const user = useAuthStore((s) => s.user);
  const staff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(user?.role ?? '');
  const [data, setData] = useState<{ items: any[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  function load(p = page) {
    api.get(`/comments/torrent/${torrentId}`, { params: { page: p } }).then((r) => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 }));
  }
  useEffect(() => { load(page); }, [torrentId, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/comments/torrent/${torrentId}`, { content: text });
      setText('');
      setEditorKey((k) => k + 1);
      const last = Math.max(1, Math.ceil(((data?.total ?? 0) + 1) / (data?.pageSize ?? 20)));
      if (last !== page) setPage(last); else load(last);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi impossible');
    } finally {
      setSending(false);
    }
  }

  function quote(c: any) {
    const clean = c.content.replace(/\[\/?quote(=[^\]]*)?\]/gi, '').trim();
    setText((prev) => `${prev ? `${prev}\n` : ''}[quote=${c.author.username}]${clean}[/quote]\n`);
    setEditorKey((k) => k + 1);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveEdit(id: string) {
    try {
      await api.patch(`/comments/${id}`, { content: editText });
      setEditingId(null);
      load();
    } catch (err: any) {
      window.alert(err.response?.data?.message ?? 'Modification impossible');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    try {
      await api.delete(`/comments/${id}`);
      load();
    } catch (err: any) {
      window.alert(err.response?.data?.message ?? 'Suppression impossible');
    }
  }

  return (
    <div className="panel">
      <h3>💬 Commentaires {data && `(${data.total})`}</h3>
      {data && data.items.length === 0 && <p className="muted">Aucun commentaire pour l'instant.</p>}

      <div className="grid" style={{ gap: 10 }}>
        {data?.items.map((c) => (
          <div key={c.id} className="forum-post panel" style={{ background: 'var(--bg-panel)' }}>
            <div className="forum-post-author">
              <Avatar user={c.author} size={44} />
              <div style={{ fontWeight: 700 }}><UserLink user={c.author} /></div>
              <div className="badge double" style={{ marginTop: 4 }}>{displayRank(c.author, ROLE_LABEL)}</div>
            </div>
            <div className="forum-post-body">
              <div className="forum-post-head muted">
                <span>{timeAgo(c.createdAt)}{c.editedAt && ' · modifié'}</span>
              </div>
              {editingId === c.id ? (
                <div className="grid" style={{ gap: 8 }}>
                  <WysiwygEditor value={editText} onChange={setEditText} minHeight={140} />
                  <div className="row">
                    <button type="button" onClick={() => saveEdit(c.id)} disabled={!editText.trim()}>Enregistrer</button>
                    <button type="button" className="secondary" onClick={() => setEditingId(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(c.content) }} />
              )}
              {user && (
                <div className="forum-post-actions">
                  <button type="button" className="secondary" onClick={() => quote(c)}>❝ Citer</button>
                  {(c.author.id === user.id || staff) && editingId !== c.id && (
                    <button type="button" className="secondary" onClick={() => { setEditingId(c.id); setEditText(c.content); }}>✏️ Modifier</button>
                  )}
                  {(c.author.id === user.id || staff) && <button type="button" className="secondary" onClick={() => remove(c.id)}>🗑️ Supprimer</button>}
                  {c.author.id !== user.id && <ReportButton targetType="comment" targetId={c.id} compact label="🚩" />}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {data && <div style={{ marginTop: 10 }}><Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} /></div>}

      {user ? (
        <form ref={formRef} onSubmit={submit} className="grid" style={{ gap: 10, marginTop: 14 }}>
          <WysiwygEditor key={editorKey} value={text} onChange={setText} minHeight={140} placeholder="Ajoute un commentaire..." />
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          <button type="submit" style={{ alignSelf: 'flex-start' }} disabled={sending || !text.trim()}>{sending ? 'Envoi...' : 'Commenter'}</button>
        </form>
      ) : (
        <p className="muted">Connecte-toi pour commenter.</p>
      )}
    </div>
  );
}
