import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Breadcrumb } from '../components/ForumBits';
import { TopicTable } from './ForumView';

/** Derniers messages du forum, tous forums confondus. */
export function ForumLatest() {
  const [topics, setTopics] = useState<any[] | null>(null);
  useEffect(() => { api.get('/forum/latest').then((r) => setTopics(r.data)).catch(() => setTopics([])); }, []);
  return (
    <div className="grid" style={{ width: '100%', gap: 14 }}>
      <Breadcrumb crumbs={[]} last="Derniers messages" />
      <h1>🕒 Derniers messages</h1>
      <div className="forum-table panel ornate">
        {topics ? <TopicTable topics={topics} showForum /> : <p className="muted" style={{ padding: 14 }}>Chargement...</p>}
      </div>
    </div>
  );
}

/** Recherche dans les titres et le contenu des messages. */
export function ForumSearch() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [topics, setTopics] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setTopics(null);
    setError('');
    api.get('/forum/search', { params: { q } }).then((r) => setTopics(r.data)).catch((err) => { setError(err.response?.data?.message ?? 'Recherche impossible'); setTopics([]); });
  }, [q]);

  return (
    <div className="grid" style={{ width: '100%', gap: 14 }}>
      <Breadcrumb crumbs={[]} last="Recherche" />
      <h1>🔍 Résultats pour « {q} »</h1>
      {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="forum-table panel ornate">
        {topics ? <TopicTable topics={topics} showForum /> : <p className="muted" style={{ padding: 14 }}>Recherche...</p>}
      </div>
      <Link to="/forum">← Retour au forum</Link>
    </div>
  );
}
