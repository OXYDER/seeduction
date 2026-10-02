import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { bbcodeToHtml } from '../lib/bbcode';
import { timeAgo } from '../lib/time';
import { Pagination } from '../components/ForumBits';
import UserLink from '../components/UserLink';
import Avatar from '../components/Avatar';
import NewsEditor from '../components/NewsEditor';

const plain = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

function Card({ n, big, canEdit, onEdit }: { n: any; big?: boolean; canEdit: boolean; onEdit: () => void }) {
  const text = n.summary || plain(n.content).slice(0, big ? 280 : 160);
  return (
    <article className={`news-card${big ? ' big' : ''}`} id={`news-${n.id}`}>
      <Link to={`/news/${n.id}`} className={`news-card-img${n.imageUrl ? '' : ' none'}`} aria-label={n.title}>
        {n.imageUrl ? <img src={n.imageUrl} alt="" loading="lazy" /> : <span>📰</span>}
        {n.pinned && <span className="news-pin">📌 Épinglée</span>}
      </Link>
      <div className="news-card-body">
        <h2><Link to={`/news/${n.id}`}>{n.title}</Link></h2>
        <p>{text}{text.length >= (big ? 280 : 160) && '…'}</p>
        <div className="news-card-meta">
          {n.author && <Avatar user={n.author} size={22} />}
          <span>{n.author?.username} · {timeAgo(n.createdAt)}</span>
          {canEdit && <button type="button" className="secondary news-edit-btn" onClick={onEdit} title="Modifier cette nouvelle">✏️ Modifier</button>}
        </div>
      </div>
    </article>
  );
}

/** Toutes les nouvelles (grande carte + grille, avec image principale), ou une seule quand un identifiant est dans l'adresse. */
export default function News() {
  const { id } = useParams();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = ['MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') ?? '1', 10);
  const [feed, setFeed] = useState<any>(null);
  const [single, setSingle] = useState<any>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    setError('');
    if (id) {
      setSingle(null);
      api.get(`/announcements/${id}`).then((r) => setSingle(r.data)).catch(() => setError('Nouvelle introuvable'));
    } else {
      api.get('/announcements/feed', { params: { page, pageSize: 10 } }).then((r) => setFeed(r.data)).catch(() => setError('Nouvelles indisponibles'));
    }
  }, [id, page, rev]);

  const saved = () => { setEditing(null); setRev((r) => r + 1); };

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/news">← Toutes les nouvelles</Link></div>;

  if (id) {
    if (!single) return <p className="muted">Chargement...</p>;
    if (editing === single.id) return <NewsEditor item={single} onSaved={saved} onCancel={() => setEditing(null)} />;
    return (
      <div className="grid" style={{ gap: 14 }}>
        <div className="forum-crumbs"><Link to="/">Accueil</Link> › <Link to="/news">Nouvelles</Link> › <strong>{single.title}</strong></div>
        <article className="panel ornate news-full">
          {single.imageUrl && <img src={single.imageUrl} alt="" className="news-full-img" />}
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0 }}>{single.pinned && '📌 '}{single.title}</h1>
            {canEdit && <button type="button" className="secondary" onClick={() => setEditing(single.id)}>✏️ Modifier</button>}
          </div>
          <div className="row muted" style={{ gap: 8, margin: '8px 0' }}>
            {single.author && <Avatar user={single.author} size={26} />}
            <span>{single.author && <UserLink user={single.author} />} · {new Date(single.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</span>
          </div>
          {single.summary && <p className="news-lead">{single.summary}</p>}
          <div className="ornate-divider" />
          <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(single.content) }} />
        </article>
        <Link to="/news">← Toutes les nouvelles</Link>
      </div>
    );
  }

  if (!feed) return <p className="muted">Chargement...</p>;
  const items: any[] = feed.items;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📰 Nouvelles</h1>
        {canEdit && <button type="button" onClick={() => setEditing('new')}>➕ Nouvelle nouvelle</button>}
      </div>
      {editing === 'new' && <NewsEditor onSaved={saved} onCancel={() => setEditing(null)} />}
      {items.length === 0 && <p className="muted">Aucune nouvelle pour l'instant.</p>}
      <div className="news-grid">
        {items.map((n, i) => editing === n.id
          ? <div key={n.id} style={{ gridColumn: '1 / -1' }}><NewsEditor item={n} onSaved={saved} onCancel={() => setEditing(null)} /></div>
          : <Card key={n.id} n={n} big={i === 0 && page === 1} canEdit={canEdit} onEdit={() => setEditing(n.id)} />)}
      </div>
      <Pagination page={feed.page} total={feed.total} pageSize={feed.pageSize} onPage={(p) => setParams({ page: String(p) })} />
    </div>
  );
}
