import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

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

  function CategoryPanel({ category }: { category: any }) {
    return (
      <div className="panel">
        <h3>{category.name}</h3>
        <table>
          <tbody>
            {(topicsByCategory[category.id] ?? []).map((t) => (
              <tr key={t.id}>
                <td><Link to={`/forum/topics/${t.id}`}>{t.title}</Link></td>
                <td className="muted">{t.author?.username}</td>
                <td className="muted">{t._count?.posts} réponses</td>
              </tr>
            ))}
            {(topicsByCategory[category.id] ?? []).length === 0 && (
              <tr><td className="muted">Aucun sujet pour l'instant.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid">
      <h1>Forum</h1>
      {categories.map((c) => (
        <div key={c.id} className="grid" style={{ gap: 10 }}>
          <CategoryPanel category={c} />
          {c.children?.map((sub: any) => (
            <div key={sub.id} style={{ marginLeft: 24 }}>
              <CategoryPanel category={sub} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
