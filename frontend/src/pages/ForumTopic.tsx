import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import UserLink from '../components/UserLink';
import WysiwygEditor from '../components/WysiwygEditor';
import { Breadcrumb, Pagination } from '../components/ForumBits';
import ReportButton from '../components/ReportButton';
import { ROLE_LABEL } from '../components/StaffUserPanel';
import { bbcodeToHtml } from '../lib/bbcode';
import { displayRank } from '../lib/memberClass';
import Avatar from '../components/Avatar';

const isStaffRole = (role?: string) => ['MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');

export default function ForumTopic() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') ?? '1', 10);
  const user = useAuthStore((s) => s.user);
  const staff = isStaffRole(user?.role);

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [editorKey, setEditorKey] = useState(0); // change pour recharger l'éditeur quand on insère une citation
  const [replyError, setReplyError] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forums, setForums] = useState<{ id: string; name: string }[]>([]);
  const replyRef = useRef<HTMLDivElement>(null);

  function load() {
    api.get(`/forum/topics/${id}`, { params: { page } })
      .then((r) => setData(r.data))
      .catch((err) => setError(err.response?.data?.message ?? 'Sujet introuvable'));
  }
  useEffect(() => { setData(null); setError(''); load(); }, [id, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (staff) api.get('/forum/movable-forums').then((r) => setForums(r.data)).catch(() => {});
  }, [staff]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setReplyError('');
    try {
      const { data: post } = await api.post(`/forum/topics/${id}/reply`, { content: reply });
      setReply('');
      setEditorKey((k) => k + 1);
      if (post.page !== page) setParams({ page: String(post.page) });
      else load();
    } catch (err: any) {
      setReplyError(err.response?.data?.message ?? 'Envoi impossible');
    } finally {
      setSending(false);
    }
  }

  function quote(post: any) {
    const who = post.author?.username ?? 'Membre';
    setReply((prev) => `${prev ? `${prev}\n` : ''}[quote=${who}]${post.content.replace(/\[\/?quote(=[^\]]*)?\]/gi, '').trim()}[/quote]\n`);
    setEditorKey((k) => k + 1);
    replyRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveEdit(postId: string) {
    try {
      await api.patch(`/forum/posts/${postId}`, { content: editText });
      setEditingId(null);
      load();
    } catch (err: any) {
      window.alert(err.response?.data?.message ?? 'Modification impossible');
    }
  }

  async function removePost(post: any) {
    const first = post.number === 1;
    if (!window.confirm(first ? 'Supprimer ce premier message supprimera TOUT le sujet. Continuer ?' : 'Supprimer ce message ?')) return;
    try {
      const { data: res } = await api.delete(`/forum/posts/${post.id}`);
      if (res.topicDeleted) navigate(`/forum/f/${res.forumId}`);
      else load();
    } catch (err: any) {
      window.alert(err.response?.data?.message ?? 'Suppression impossible');
    }
  }

  async function moderate(action: string, forumId?: string) {
    try {
      await api.post(`/forum/topics/${id}/moderate`, { action, forumId });
      load();
    } catch (err: any) {
      window.alert(err.response?.data?.message ?? 'Action refusée');
    }
  }

  async function deleteTopic() {
    if (!window.confirm('Supprimer définitivement ce sujet et tous ses messages ?')) return;
    const { data: res } = await api.delete(`/forum/topics/${id}`);
    navigate(`/forum/f/${res.forumId}`);
  }

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/forum">← Retour au forum</Link></div>;
  if (!data) return <p className="muted">Chargement...</p>;

  const { topic, breadcrumb, posts } = data;
  const pager = <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={(p) => setParams({ page: String(p) })} />;

  return (
    <div className="grid page-narrow" style={{ width: '100%', gap: 14 }}>
      <Breadcrumb crumbs={breadcrumb} last={topic.title} />
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1>{topic.sticky && '📌 '}{topic.locked && '🔒 '}{topic.title}</h1>
        <div className="muted">{topic.viewCount} vue(s) · {data.total} message(s)</div>
      </div>

      {staff && (
        <div className="panel row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="muted">🛡️ Modération :</span>
          <button type="button" className="secondary" onClick={() => moderate(topic.locked ? 'unlock' : 'lock')}>{topic.locked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button>
          <button type="button" className="secondary" onClick={() => moderate(topic.sticky ? 'unsticky' : 'sticky')}>{topic.sticky ? 'Désépingler' : '📌 Épingler'}</button>
          <select defaultValue="" onChange={(e) => { if (e.target.value) moderate('move', e.target.value); e.target.value = ''; }}>
            <option value="">➜ Déplacer vers…</option>
            {forums.filter((f) => f.id !== topic.forum.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button type="button" className="danger" onClick={deleteTopic}>🗑️ Supprimer le sujet</button>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        {pager}
        {user && data.canReply && <button type="button" onClick={() => replyRef.current?.scrollIntoView({ behavior: 'smooth' })}>↩ Répondre</button>}
      </div>

      {posts.map((p: any) => {
        const canEdit = !!user && (p.authorId === user.id || staff) && (!topic.locked || staff);
        const canDelete = !!user && (staff || (p.authorId === user.id && p.number !== 1));
        return (
          <div key={p.id} id={`post-${p.id}`} className="forum-post panel ornate">
            <div className="forum-post-author">
              <Avatar user={p.author} size={64} />
              <div style={{ fontWeight: 700 }}><UserLink user={p.author} fallback="Membre supprimé" /></div>
              {p.author && <div className="badge double" style={{ marginTop: 4 }}>{displayRank(p.author, ROLE_LABEL)}</div>}
              {p.author && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                  Messages : {p.author.postCount}<br />
                  Inscrit : {new Date(p.author.createdAt).toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>
            <div className="forum-post-body">
              <div className="forum-post-head muted">
                <span>{new Date(p.createdAt).toLocaleString('fr-FR')}</span>
                <a href={`#post-${p.id}`} title="Lien vers ce message">#{p.number}</a>
              </div>
              {editingId === p.id ? (
                <div className="grid" style={{ gap: 8 }}>
                  <WysiwygEditor value={editText} onChange={setEditText} minHeight={180} />
                  <div className="row">
                    <button type="button" onClick={() => saveEdit(p.id)} disabled={!editText.trim()}>Enregistrer</button>
                    <button type="button" className="secondary" onClick={() => setEditingId(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(p.content) }} />
              )}
              {p.editedAt && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Modifié le {new Date(p.editedAt).toLocaleString('fr-FR')}</div>}
              {p.author?.signature && <div className="forum-signature bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(p.author.signature) }} />}
              <div className="forum-post-actions">
                {user && data.canReply && <button type="button" className="secondary" onClick={() => quote(p)}>❝ Citer</button>}
                {canEdit && editingId !== p.id && <button type="button" className="secondary" onClick={() => { setEditingId(p.id); setEditText(p.content); }}>✏️ Modifier</button>}
                {canDelete && <button type="button" className="secondary" onClick={() => removePost(p)}>🗑️ Supprimer</button>}
                {user && p.authorId !== user.id && <ReportButton targetType="forumPost" targetId={p.id} compact label="🚩 Signaler" />}
              </div>
            </div>
          </div>
        );
      })}

      {pager}

      <div ref={replyRef}>
        {!user && <p className="muted">Connecte-toi pour répondre.</p>}
        {user && !data.canReply && <p className="muted">🔒 Ce sujet est verrouillé : plus de nouvelles réponses.</p>}
        {user && data.canReply && (
          <form onSubmit={submitReply} className="panel ornate grid" style={{ gap: 10 }}>
            <div className="panel-title" style={{ margin: 0 }}>Répondre au sujet</div>
            <WysiwygEditor key={editorKey} value={reply} onChange={setReply} minHeight={200} placeholder="Ta réponse..." />
            {replyError && <div className="muted" style={{ color: 'var(--danger)' }}>{replyError}</div>}
            <button type="submit" style={{ alignSelf: 'flex-start' }} disabled={sending || !reply.trim()}>{sending ? 'Envoi...' : 'Publier la réponse'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
