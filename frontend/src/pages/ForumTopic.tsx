import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export default function ForumTopic() {
  const { id } = useParams();
  const [topic, setTopic] = useState<any>(null);
  const [reply, setReply] = useState('');
  const user = useAuthStore((s) => s.user);

  function refresh() {
    api.get(`/forum/topics/${id}`).then((r) => setTopic(r.data));
  }
  useEffect(() => { refresh(); }, [id]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    await api.post(`/forum/topics/${id}/reply`, { content: reply });
    setReply('');
    refresh();
  }

  if (!topic) return <p className="muted">Chargement...</p>;

  return (
    <div className="grid">
      <h1>{topic.title}</h1>
      {topic.posts.map((p: any) => (
        <div key={p.id} className="panel">
          <div className="muted">{p.author?.username} — {new Date(p.createdAt).toLocaleString()}</div>
          <p>{p.content}</p>
        </div>
      ))}
      {user && (
        <form onSubmit={submitReply} className="grid">
          <textarea rows={3} placeholder="Répondre..." value={reply} onChange={(e) => setReply(e.target.value)} />
          <button type="submit">Répondre</button>
        </form>
      )}
    </div>
  );
}
