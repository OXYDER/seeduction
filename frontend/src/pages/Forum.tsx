import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

function TopicRows({ topics }: { topics: any[] | undefined }) {
  if (!topics) return <p className="muted" style={{ margin: '6px 0' }}>Chargement...</p>;
  if (topics.length === 0) return <p className="muted" style={{ margin: '6px 0' }}>Aucun sujet pour l'instant.</p>;
  return (
    <table>
      <tbody>
        {topics.map((t) => (
          <tr key={t.id}>
            <td><Link to={`/forum/topics/${t.id}`}>{t.title}</Link></td>
            <td className="muted">{t.author?.username}</td>
            <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{t._count?.posts} réponses</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Bouton « Nouveau sujet » qui déplie un petit formulaire sous le forum concerné. */
function NewTopic({ categoryId }: { categoryId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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
      const { data } = await api.post(`/forum/categories/${categoryId}/topics`, { title: title.trim(), content });
      navigate(`/forum/topics/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Impossible de créer le sujet');
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="secondary" style={{ marginTop: 8, padding: '4px 12px', fontSize: 13 }} onClick={() => setOpen(true)}>＋ Nouveau sujet</button>;
  }
  return (
    <form onSubmit={submit} className="grid" style={{ gap: 8, marginTop: 8 }}>
      <input placeholder="Titre du sujet" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} style={{ width: '100%' }} autoFocus />
      <textarea placeholder="Ton message..." rows={5} value={content} onChange={(e) => setContent(e.target.value)} style={{ width: '100%' }} />
      {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="row">
        <button type="submit" disabled={busy || !title.trim() || !content.trim()}>{busy ? 'Publication...' : 'Publier'}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </form>
  );
}

export default function Forum() {
  const [categories, setCategories] = useState<any[]>([]);
  const [topicsByCategory, setTopicsByCategory] = useState<Record<string, any[]>>({});

  useEffect(() => {
    api.get('/forum/categories').then((r) => {
      setCategories(r.data);
      const all = r.data.flatMap((c: any) => [c, ...(c.children ?? [])]);
      all.forEach((c: any) => {
        api.get(`/forum/categories/${c.id}/topics`).then((res) =>
          setTopicsByCategory((prev) => ({ ...prev, [c.id]: res.data })),
        );
      });
    });
  }, []);

  const forumPanel = (f: any) => (
    <div key={f.id} className="panel ornate" style={{ width: '100%' }}>
      <div className="panel-title">
        <span className="title-icon">💬</span>{f.name}
        <span className="muted" style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)' }}>
          {(topicsByCategory[f.id] ?? []).length} sujet(s)
        </span>
      </div>
      <TopicRows topics={topicsByCategory[f.id]} />
      <NewTopic categoryId={f.id} />
    </div>
  );

  return (
    <div className="grid" style={{ width: '100%', gap: 22 }}>
      <h1>Forum</h1>
      {categories.map((c) =>
        c.isCategory ? (
          // Catégorie : simple en-tête qui regroupe ses forums.
          <section key={c.id} className="grid" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-gold)', paddingBottom: 6 }}>
              <span className="title-icon">🗂️</span>
              <h2 style={{ margin: 0, color: 'var(--gold-bright)' }}>{c.name}</h2>
            </div>
            {c.children?.length > 0
              ? c.children.map(forumPanel)
              : <p className="muted" style={{ margin: 0 }}>Aucun forum dans cette catégorie pour l'instant.</p>}
          </section>
        ) : (
          forumPanel(c)
        ),
      )}
    </div>
  );
}
