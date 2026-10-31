import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import UserLink from './UserLink';
import { api } from '../api/client';
import Avatar from './Avatar';
import { isUnseenNews, kindOf } from '../lib/news';
import { timeAgo } from '../lib/time';
import Loading from './Loading';

const ambient = (url?: string | null) => (url ? ({ '--ambient': `url("${url.replace(/"/g, '%22')}")` } as React.CSSProperties) : undefined);
const TILE_MIN = 230, TILE_GAP = 12; // doit rester identique à .news-tiles dans index.css
/** Onglets du bloc (accueil) : un type de nouvelle par onglet. */
const NEWS_TABS: { id: string; label: string; kinds: string[] | null }[] = [
  { id: 'all', label: 'Toutes', kinds: null },
  { id: 'event', label: 'Événements', kinds: ['EVENT'] },
  { id: 'news', label: 'Nouveautés', kinds: ['NEWS', 'UPDATE'] },
  { id: 'notice', label: 'Annonces', kinds: ['IMPORTANT', 'MAINTENANCE'] },
];
const plain = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

/** Accueil : la dernière nouvelle en pleine largeur (image, type, extrait, réactions et commentaires), puis les précédentes en petites cartes sur une rangée, selon la largeur de l'écran. */
export default function NewsPanel({ limit = 10, heroOnly = false }: { limit?: number; heroOnly?: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [tab, setTab] = useState('all');
  const rowRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);
  const hasRest = !heroOnly && (items?.length ?? 0) > 1;

  // Une seule rangée de petites cartes : seulement autant que la largeur de la page peut en afficher.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const fit = () => setCols(Math.max(1, Math.floor((el.clientWidth + TILE_GAP) / (TILE_MIN + TILE_GAP))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasRest]);

  useEffect(() => {
    api.get('/announcements/latest', { params: { limit } }).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [limit]);

  const tabDef = NEWS_TABS.find((t) => t.id === tab) ?? NEWS_TABS[0];
  const shownItems = (items ?? []).filter((n) => !tabDef.kinds || tabDef.kinds.includes(n.kind ?? 'NEWS'));
  const [first, ...others] = shownItems;
  const rest = heroOnly ? [] : others;
  const k = first ? kindOf(first.kind) : null;
  const text = first ? first.summary || plain(first.content).slice(0, 240) : '';

  if (heroOnly && items && items.length === 0) return null; // rien à annoncer : on n'affiche pas de cadre vide

  return (
    <div className="panel ornate">
      <div className="panel-title">
        <span className="title-icon">📰</span>{heroOnly ? 'Dernière nouvelle' : 'Actualités & Événements'}
        <Link to="/news" style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 13 }}>Toutes les nouvelles →</Link>
      </div>
      {!heroOnly && items && items.length > 0 && (
        <div className="news-tabs" role="tablist">
          {NEWS_TABS.filter((t) => !t.kinds || items.some((n) => t.kinds!.includes(n.kind ?? 'NEWS'))).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      )}
      {items === null && <Loading />}
      {items?.length === 0 && !heroOnly && <p className="muted">Aucune nouvelle pour l'instant.</p>}

      <div className={`news-split${rest.length > 0 ? ' with-side' : ''}`}>
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
              <span>{first.author ? <UserLink user={first.author} /> : null} · {timeAgo(first.createdAt)}</span>
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
        <div className="news-side">
          {rest.slice(0, 4).map((n) => {
            const nk = kindOf(n.kind);
            return (
              <Link key={n.id} to={`/news/${n.id}`} className="news-side-item">
                <span className={`news-kind k-${(n.kind ?? 'NEWS').toLowerCase()}`}>{nk.icon} {nk.label}</span>
                <strong>{n.title}</strong>
                <span className="muted news-tile-meta">{timeAgo(n.createdAt)} · 💬 {n._count?.comments ?? 0}</span>
              </Link>
            );
          })}
          <Link to="/news" className="news-side-all">Toutes les nouvelles →</Link>
        </div>
      )}
      </div>
    </div>
  );
}
