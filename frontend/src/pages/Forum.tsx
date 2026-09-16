import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function Forum() {
  const [categories, setCategories] = useState<any[]>([]);
  const [topicsByCategory, setTopicsByCategory] = useState<Record<string, any[]>>({});

  useEffect(() => {
    api.get('/forum/categories').then((r) => {
      setCategories(r.data);
      r.data.forEach((c: any) => {
        api.get(`/forum/categories/${c.id}/topics`).then((res) =>
          setTopicsByCategory((prev) => ({ ...prev, [c.id]: res.data })),
        );
      });
    });
  }, []);

  return (
    <div className="grid">
      <h1>Forum</h1>
      {categories.map((c) => (
        <div key={c.id} className="panel">
          <h3>{c.name}</h3>
          <table>
            <tbody>
              {(topicsByCategory[c.id] ?? []).map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/forum/topics/${t.id}`}>{t.title}</Link></td>
                  <td className="muted">{t.author?.username}</td>
                  <td className="muted">{t._count?.posts} réponses</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
