import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import { timeAgo } from '../lib/time';

/** Dernières nouvelles, affichées en haut de la page d'accueil, avec un lien vers toutes les nouvelles. */
export default function NewsPanel({ limit = 3 }: { limit?: number }) {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/announcements/feed', { params: { page: 1, pageSize: limit } }).then((r) => setItems(r.data.items)).catch(() => setItems([]));
  }, [limit]);

  return (
    <div className="panel ornate">
      <div className="panel-title">
        <span className="title-icon">📰</span>Dernières nouvelles
        <Link to="/news" style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 13 }}>Voir plus de nouvelles →</Link>
      </div>
      {items === null && <p className="muted">Chargement...</p>}
      {items?.length === 0 && <p className="muted">Aucune nouvelle pour l'instant.</p>}
      <div className="grid" style={{ gap: 14 }}>
        {items?.map((n) => (
          <article key={n.id} className="news-item">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <Link to={`/news/${n.id}`}><strong style={{ fontSize: 16 }}>{n.pinned ? '📌 ' : ''}{n.title}</strong></Link>
              <span className="muted" style={{ fontSize: 12 }}>{timeAgo(n.createdAt)}{n.author && ` · ${n.author.username}`}</span>
            </div>
            <div className="news-excerpt bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(n.content) }} />
            <Link to={`/news/${n.id}`} className="muted" style={{ fontSize: 12 }}>Lire la suite</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
