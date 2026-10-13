import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import UserLink from '../components/UserLink';
import WysiwygEditor from '../components/WysiwygEditor';
import { Pagination, LastPostCell } from '../components/ForumBits';
import { timeAgo } from '../lib/time';
import { useCrumbTitle } from '../store/crumbs';

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
            <td className="forum-icon">{t.sticky ? '📌' : t.locked ? '🔒' : t.solved ? '✅' : t.unread ? '🟡' : '💬'}</td>
            <td>
              <Link to={`/forum/topics/${t.id}`} className="forum-name">{t.title}</Link>
              {t.solved && <span className="badge freeleech" style={{ marginLeft: 6 }} title="Une réponse a réglé le problème">Résolu</span>}
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
  const filter = params.get('filter') ?? '';
  useCrumbTitle(data?.forum?.name, (data?.breadcrumb ?? []).slice(0, -1).map((c: any) => ({ label: c.name, to: c.isCategory ? '/forum' : `/forum/f/${c.id}` })));

  function load(keep = false) {
    if (!keep) setData(null);
    setError('');
    api.get(`/forum/forums/${id}`, { params: { page, filter: filter || undefined } }).then((r) => setData(r.data)).catch((err) => setError(err.response?.data?.message ?? 'Forum introuvable'));
  }
  useEffect(() => { load(); }, [id, page, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markRead() {
    await api.post(`/forum/forums/${id}/mark-read`).catch(() => undefined);
    load(true);
  }

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/forum">← Retour au forum</Link></div>;
  if (!data) return <p className="muted">Chargement...</p>;

  const { forum } = data;

  return (
    <div className="grid" style={{ width: '100%', gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h1>{forum.icon} {forum.name} {forum.locked && <span title="Lecture seule">🔒</span>} {forum.archived && <span title="Archive">📦</span>}</h1>
          {forum.description && <div className="muted">{forum.description}</div>}
          {(forum.readLabel || forum.writeLabel || forum.qa) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {forum.readLabel && <span className="badge double" title="Qui peut lire">👁️ Réservé à {forum.readLabel}</span>}
              {forum.writeLabel && <span className="badge double" title="Qui peut écrire">✍️ Écriture : {forum.writeLabel}</span>}
              {forum.qa && <span className="badge freeleech" title="Marque la réponse qui règle ton problème">✅ Entraide</span>}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {user && forum.unreadCount > 0 && <button type="button" className="secondary" onClick={markRead}>✓ Marquer comme lu ({forum.unreadCount})</button>}
          {user && !forum.isCategory && data.canPost && <button type="button" onClick={() => setComposing(true)}>＋ Nouveau sujet</button>}
        </div>
      </div>

      {user && !forum.isCategory && !data.canPost && data.postBlockedReason && <div className="panel muted">🔒 {data.postBlockedReason}</div>}
      {!user && !forum.isCategory && <div className="panel muted">Connecte-toi pour participer.</div>}

      {data.rules && (
        <details className="panel" open style={{ borderLeft: '3px solid var(--gold, #e0b84a)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>📋 Règles de ce forum</summary>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 14 }}>{data.rules}</div>
        </details>
      )}

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
                    {s.unreadCount > 0 && <span className="badge new" style={{ marginLeft: 6 }} title="Sujets non lus">{s.unreadCount}</span>}
                    {s.qa && <span className="badge freeleech" style={{ marginLeft: 6 }}>✅</span>}
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

      {!forum.isCategory && (user || forum.qa) && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {([['', 'Tous les sujets'], ...(user ? [['unread', 'Non lus']] : []), ...(forum.qa ? [['unsolved', 'Sans solution']] : [])] as [string, string][]).map(([k, label]) => (
            <button key={k || 'all'} type="button" className={filter === k ? undefined : 'secondary'} style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setParams(k ? { filter: k } : {})}>{label}</button>
          ))}
        </div>
      )}

      {!forum.isCategory && (
        <div className="forum-table panel ornate">
          <div style={{ padding: '8px 12px' }}><Pagination page={data.page} total={data.total} pageSize={data.pageSize} unit="sujet" onPage={(p) => setParams({ page: String(p) })} /></div>
          <TopicTable topics={data.topics} />
          <div style={{ padding: '8px 12px' }}>
            <Pagination page={data.page} total={data.total} pageSize={data.pageSize} unit="sujet" onPage={(p) => setParams({ page: String(p) })} scrollTop />
          </div>
        </div>
      )}
    </div>
  );
}
