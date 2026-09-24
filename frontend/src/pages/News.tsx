import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import { Pagination } from '../components/ForumBits';
import UserLink from '../components/UserLink';
import Avatar from '../components/Avatar';

function Post({ n, full }: { n: any; full?: boolean }) {
  return (
    <article className="panel ornate" id={`news-${n.id}`}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{n.pinned && '📌 '}{full ? n.title : <Link to={`/news/${n.id}`}>{n.title}</Link>}</h2>
        <div className="row muted" style={{ gap: 8 }}>
          {n.author && <Avatar user={n.author} size={26} />}
          <span>{n.author && <UserLink user={n.author} />} · {new Date(n.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</span>
        </div>
      </div>
      <div className="ornate-divider" />
      <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(n.content) }} />
    </article>
  );
}

/** Toutes les nouvelles (paginées), ou une seule nouvelle quand un identifiant est dans l'adresse. */
export default function News() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') ?? '1', 10);
  const [feed, setFeed] = useState<any>(null);
  const [single, setSingle] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    if (id) {
      setSingle(null);
      api.get(`/announcements/${id}`).then((r) => setSingle(r.data)).catch(() => setError('Nouvelle introuvable'));
    } else {
      api.get('/announcements/feed', { params: { page, pageSize: 10 } }).then((r) => setFeed(r.data)).catch(() => setError('Nouvelles indisponibles'));
    }
  }, [id, page]);

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/news">← Toutes les nouvelles</Link></div>;

  if (id) {
    if (!single) return <p className="muted">Chargement...</p>;
    return (
      <div className="grid page-narrow" style={{ gap: 14 }}>
        <div className="forum-crumbs"><Link to="/">Accueil</Link> › <Link to="/news">Nouvelles</Link> › <strong>{single.title}</strong></div>
        <Post n={single} full />
        <Link to="/news">← Toutes les nouvelles</Link>
      </div>
    );
  }

  if (!feed) return <p className="muted">Chargement...</p>;
  return (
    <div className="grid page-narrow" style={{ gap: 16 }}>
      <h1>📰 Nouvelles</h1>
      {feed.items.length === 0 && <p className="muted">Aucune nouvelle pour l'instant.</p>}
      {feed.items.map((n: any) => <Post key={n.id} n={n} />)}
      <Pagination page={feed.page} total={feed.total} pageSize={feed.pageSize} onPage={(p) => setParams({ page: String(p) })} />
    </div>
  );
}
