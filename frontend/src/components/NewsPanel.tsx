import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { isUnseenNews, kindOf } from '../lib/news';
import { bbcodeToHtml } from '../lib/bbcode';
import { timeAgo } from '../lib/time';

const ambient = (url?: string | null) => (url ? ({ '--ambient': `url("${url.replace(/"/g, '%22')}")` } as React.CSSProperties) : undefined);
const plain = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

/** Accueil : la dernière nouvelle en grand (image, type, extrait, réactions et commentaires), puis les suivantes en liste. */
export default function NewsPanel({ limit = 3, heroOnly = false }: { limit?: number; heroOnly?: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/announcements/latest', { params: { limit } }).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [limit]);

  const [first, ...others] = items ?? [];
  const rest = heroOnly ? [] : others;
  const k = first ? kindOf(first.kind) : null;
  const text = first ? first.summary || plain(first.content).slice(0, 240) : '';

  if (heroOnly && items && items.length === 0) return null; // rien à annoncer : on n'affiche pas de cadre vide

  return (
    <div className="panel ornate">
      <div className="panel-title">
        <span className="title-icon">📰</span>Dernière nouvelle
        <Link to="/news" style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 13 }}>Toutes les nouvelles →</Link>
      </div>
      {items === null && <p className="muted">Chargement...</p>}
      {items?.length === 0 && !heroOnly && <p className="muted">Aucune nouvelle pour l'instant.</p>}

      {first && k && (
        <Link to={`/news/${first.id}`} className="news-hero">
          <span className={`news-hero-img${first.imageUrl ? ' ambient' : ''}`} style={ambient(first.imageUrl)}>{first.imageUrl ? <img src={first.imageUrl} alt="" /> : k.icon}</span>
          <span className="news-hero-body">
            <span className="row" style={{ gap: 8 }}>
              <span className={`news-kind k-${(first.kind ?? 'NEWS').toLowerCase()}`}>{k.icon} {k.label}</span>
              {isUnseenNews(first.createdAt) && <span className="news-new">NOUVEAU</span>}
              {first.pinned && <span className="news-kind">📌</span>}
            </span>
            <h2>{first.title}</h2>
            <p>{text}{text.length >= 240 && '…'}</p>
            <span className="news-hero-meta">
              {first.author && <Avatar user={first.author} size={22} />}
              <span>{first.author?.username} · {timeAgo(first.createdAt)}</span>
              <span className="news-readmore">Lire la nouvelle →</span>
              <span className="news-counts">
                {first._count?.reactions > 0 && <span>❤️ {first._count.reactions}</span>}
                <span>💬 {first._count?.comments ?? 0}</span>
              </span>
            </span>
          </span>
        </Link>
      )}

      {rest.length > 0 && (
        <div className="grid" style={{ gap: 10, marginTop: 14 }}>
          {rest.map((n) => (
            <article key={n.id} className="news-item with-thumb">
              {n.imageUrl && <Link to={`/news/${n.id}`} className="news-thumb"><img src={n.imageUrl} alt="" loading="lazy" /></Link>}
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <Link to={`/news/${n.id}`}><strong style={{ fontSize: 15 }}>{kindOf(n.kind).icon} {n.title}</strong></Link>
                  <span className="muted" style={{ fontSize: 12 }}>{timeAgo(n.createdAt)} · 💬 {n._count?.comments ?? 0}</span>
                </div>
                {n.summary ? <p className="muted" style={{ margin: '4px 0' }}>{n.summary}</p> : <div className="news-excerpt bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(n.content) }} />}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
