import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import { CATEGORY_STYLE } from './Layout';
import { TorrentHover } from './TorrentLink';
import { HealthDot } from './TorrentBits';
import CategoryTag from './CategoryTag';
import PosterTags from './PosterTags';

/** Une carte d'affiche (pochette + titre + infos) avec l'infobulle riche au survol ; `reason` = pourquoi on te la propose. */
export function PosterCard({ t }: { t: any }) {
  const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
  return (
    <TorrentHover id={t.id} inline={false}>
      <Link to={`/torrents/${t.id}`} className="poster-card rail-card">
        <div className="poster-art">
          {t.coverImage
            ? <img className="poster" src={t.coverImage} alt="" loading="lazy" />
            : <div className="poster-fallback">{catStyle?.icon ?? '📦'}</div>}
          <PosterTags t={t} />
        </div>
        <div className="poster-badges">
          <CategoryTag category={t.category} />
          {t.freeleech && <span className="badge freeleech">FL</span>}
          {t.doubleUpload && <span className="badge double">2x</span>}
        </div>
        <div className="poster-body">
          <div className="poster-title">{t.name}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center' }}>
            <HealthDot seeders={t.seeders} />
            <span style={{ color: 'var(--success)' }}>{t.seeders}</span>&nbsp;/&nbsp;<span style={{ color: 'var(--danger)' }}>{t.leechers}</span>
            <span style={{ marginLeft: 'auto' }}>{formatBytes(t.size)}</span>
          </div>
          {t.reason && <div className="tv-reason">✨ {t.reason}</div>}
        </div>
      </Link>
    </TorrentHover>
  );
}

/** Rangée d'affiches défilante, façon plateforme de streaming. */
export function Rail({ title, to, items, loading, icon = '🎞️' }: { title: string; to: string; items: any[]; loading?: boolean; icon?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  if (items.length === 0 && !loading) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="panel ornate rail-section rail-plex">
      <div className="panel-title">
        <span className="title-icon">{icon}</span>{title}
        <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          <Link to={to} className="rail-all">Tout voir →</Link>
          <button type="button" className="secondary rail-btn" onClick={() => scroll(-1)} aria-label="Précédent">‹</button>
          <button type="button" className="secondary rail-btn" onClick={() => scroll(1)} aria-label="Suivant">›</button>
        </div>
      </div>
      <div className="rail" ref={ref}>
        {loading && items.length === 0 && Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton-card"><span className="skeleton-poster" /><span className="skeleton-line" /></span>)}
        {items.map((t) => <PosterCard key={t.id} t={t} />)}
      </div>
    </section>
  );
}
