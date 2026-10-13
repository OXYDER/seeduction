import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { TopicTable } from './ForumView';

/** Derniers messages du forum, tous forums confondus. */
export function ForumLatest() {
  const [params, setParams] = useSearchParams();
  const unread = params.get('unread') === '1';
  const [topics, setTopics] = useState<any[] | null>(null);
  useEffect(() => { setTopics(null); api.get('/forum/latest', { params: { unread: unread ? 1 : undefined } }).then((r) => setTopics(r.data)).catch(() => setTopics([])); }, [unread]);
  return (
    <div className="grid" style={{ width: '100%', gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1>{unread ? '🟡 Sujets non lus' : '🕒 Derniers messages'}</h1>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={unread ? 'secondary' : undefined} style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setParams({})}>Tous</button>
          <button type="button" className={unread ? undefined : 'secondary'} style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setParams({ unread: '1' })}>Non lus</button>
        </div>
      </div>
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
      <h1>🔍 Résultats pour « {q} »</h1>
      {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="forum-table panel ornate">
        {topics ? <TopicTable topics={topics} showForum /> : <p className="muted" style={{ padding: 14 }}>Recherche...</p>}
      </div>
      <Link to="/forum">← Retour au forum</Link>
    </div>
  );
}
