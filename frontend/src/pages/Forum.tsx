import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

  return (
    <div className="grid" style={{ width: '100%' }}>
      <h1>Forum</h1>
      {categories.map((c) => (
        // Un forum = un seul panneau : ses sujets, puis ses sous-forums juste en dessous.
        <div key={c.id} className="panel ornate" style={{ width: '100%' }}>
          <div className="panel-title">
            <span className="title-icon">💬</span>{c.name}
            <span className="muted" style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)' }}>
              {(topicsByCategory[c.id] ?? []).length} sujet(s)
            </span>
          </div>
          <TopicRows topics={topicsByCategory[c.id]} />

          {c.children?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, marginBottom: 6 }}>
                Sous-forums
              </div>
              <div className="grid" style={{ gap: 10 }}>
                {c.children.map((sub: any) => (
                  <div key={sub.id} style={{ borderLeft: '2px solid var(--border-gold)', paddingLeft: 14, background: 'rgba(0,0,0,0.12)', borderRadius: 4 }}>
                    <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-bright)', padding: '8px 0 2px' }}>
                      ↳ {sub.name}
                      <span className="muted" style={{ marginLeft: 10, fontFamily: 'var(--font-body)' }}>
                        {(topicsByCategory[sub.id] ?? []).length} sujet(s)
                      </span>
                    </div>
                    <TopicRows topics={topicsByCategory[sub.id]} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
