import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import UserLink from '../components/UserLink';
import WysiwygEditor from '../components/WysiwygEditor';
import { Breadcrumb, Pagination, LastPostCell } from '../components/ForumBits';
import { timeAgo } from '../lib/time';

/** Lignes de sujets : utilisées par la vue d'un forum, les derniers messages et la recherche. */
export function TopicTable({ topics, showForum }: { topics: any[]; showForum?: boolean }) {
  return (
    <table className="topic-table">
      <thead>
        <tr><th></th><th>Sujet</th><th className="forum-num">Réponses</th><th className="forum-num">Vues</th><th>Dernier message</th></tr>
      </thead>
      <tbody>
        {topics.map((t) => (
          <tr key={t.id} className={t.unread ? 'forum-unread' : undefined}>
            <td className="forum-icon">{t.sticky ? '📌' : t.locked ? '🔒' : t.unread ? '🟡' : '💬'}</td>
            <td>
              <Link to={`/forum/topics/${t.id}`} className="forum-name">{t.title}</Link>
              {t.sticky && t.locked && <span title="Verrouillé"> 🔒</span>}
              <div className="muted" style={{ fontSize: 12 }}>
                par <UserLink user={t.author} /> · {timeAgo(t.createdAt)}
                {showForum && t.category && <> · dans <Link to={`/forum/f/${t.category.id}`}>{t.category.name}</Link></>}
              </div>
            </td>
            <td className="forum-num">{t.replies}</td>
            <td className="forum-num">{t.viewCount ?? '—'}</td>
            <td className="forum-last">
              {t.lastPost
                ? <div className="muted" style={{ fontSize: 12 }}>par <UserLink user={t.lastPost.author} fallback="?" /><br />{timeAgo(t.lastPost.createdAt)}</div>
                : <span className="muted">—</span>}
            </td>
          </tr>
        ))}
        {topics.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>Aucun sujet pour l'instant.</td></tr>}
      </tbody>
    </table>
  );
}

function NewTopic({ forumId, onCancel }: { forumId: string; onCancel: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/forum/categories/${forumId}/topics`, { title: title.trim(), content });
      navigate(`/forum/topics/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Impossible de créer le sujet');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel ornate grid" style={{ gap: 10 }}>
      <div className="panel-title" style={{ margin: 0 }}>Nouveau sujet</div>
      <input placeholder="Titre du sujet" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} style={{ width: '100%' }} autoFocus />
      <WysiwygEditor value={content} onChange={setContent} minHeight={220} placeholder="Ton message..." />
      {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="row">
        <button type="submit" disabled={busy || !title.trim() || !content.trim()}>{busy ? 'Publication...' : 'Publier'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

export default function ForumView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') ?? '1', 10);
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/forum/forums/${id}`, { params: { page } }).then((r) => setData(r.data)).catch((err) => setError(err.response?.data?.message ?? 'Forum introuvable'));
  }, [id, page]);

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/forum">← Retour au forum</Link></div>;
  if (!data) return <p className="muted">Chargement...</p>;

  const { forum, breadcrumb } = data;

  return (
    <div className="grid" style={{ width: '100%', gap: 14 }}>
      <Breadcrumb crumbs={breadcrumb.slice(0, -1)} last={forum.name} />
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h1>{forum.icon} {forum.name} {forum.locked && <span title="Verrouillé">🔒</span>}</h1>
          {forum.description && <div className="muted">{forum.description}</div>}
        </div>
        {user && !forum.isCategory && (
          data.canPost
            ? <button type="button" onClick={() => setComposing(true)}>＋ Nouveau sujet</button>
            : <span className="muted">🔒 Seul le staff peut créer des sujets ici.</span>
        )}
      </div>

      {composing && <NewTopic forumId={forum.id} onCancel={() => setComposing(false)} />}

      {forum.subforums.length > 0 && (
        <div className="forum-table panel ornate">
          <div className="forum-table-head">
            <span>Sous-forums</span>
            <span className="forum-col">Sujets</span>
            <span className="forum-col">Messages</span>
            <span className="forum-col-last">Dernier message</span>
          </div>
          <table>
            <tbody>
              {forum.subforums.map((s: any) => (
                <tr key={s.id} className={s.unread ? 'forum-unread' : undefined}>
                  <td className="forum-icon">{s.icon || (s.unread ? '🟡' : '💬')}</td>
                  <td>
                    <Link to={`/forum/f/${s.id}`} className="forum-name">{s.name}</Link>
                    {s.description && <div className="muted forum-desc">{s.description}</div>}
                  </td>
                  <td className="forum-num">{s.topics}</td>
                  <td className="forum-num">{s.posts}</td>
                  <td className="forum-last"><LastPostCell lastPost={s.lastPost} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!forum.isCategory && (
        <div className="forum-table panel ornate">
          <TopicTable topics={data.topics} />
          <div style={{ padding: '8px 12px' }}>
            <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={(p) => setParams({ page: String(p) })} />
          </div>
        </div>
      )}
    </div>
  );
}
