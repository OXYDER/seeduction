import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import { CATEGORY_STYLE, type LayoutContext } from './Layout';
import HoverCard from './HoverCard';
import { TorrentPreview } from './TorrentLink';
import NewsPanel from './NewsPanel';
import UserLink from './UserLink';
import { HealthDot } from './TorrentBits';

/** Une carte d'affiche (pochette + titre + infos) avec l'infobulle riche au survol. */
function PosterCard({ t }: { t: any }) {
  const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
  return (
    <HoverCard cacheKey={`torrent:${t.id}`} inline={false} load={() => api.get(`/torrents/${t.id}/preview`).then((r) => r.data)} render={(d: any) => <TorrentPreview t={d} />}>
      <Link to={`/torrents/${t.id}`} className="poster-card rail-card">
        {t.coverImage
          ? <img className="poster" src={t.coverImage} alt="" loading="lazy" />
          : <div className="poster-fallback">{catStyle?.icon ?? '📦'}</div>}
        <div className="poster-badges">
          {t.freeleech && <span className="badge freeleech">FL</span>}
          {t.doubleUpload && <span className="badge double">2x</span>}
          {t.resolution && <span className="badge new">{t.resolution}</span>}
        </div>
        <div className="poster-body">
          <div className="poster-title">{t.name}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center' }}>
            <HealthDot seeders={t.seeders} />
            <span style={{ color: 'var(--success)' }}>{t.seeders}</span>&nbsp;/&nbsp;<span style={{ color: 'var(--danger)' }}>{t.leechers}</span>
            <span style={{ marginLeft: 'auto' }}>{formatBytes(t.size)}</span>
          </div>
        </div>
      </Link>
    </HoverCard>
  );
}

/** Rangée d'affiches défilante, façon plateforme de streaming. */
function Rail({ title, icon, to, items }: { title: string; icon: string; to: string; items: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (items.length === 0) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="rail-section">
      <div className="rail-head">
        <h2>{icon} {title}</h2>
        <div className="row" style={{ gap: 6 }}>
          <Link to={to} className="rail-all">Tout voir →</Link>
          <button type="button" className="secondary rail-btn" onClick={() => scroll(-1)} aria-label="Précédent">‹</button>
          <button type="button" className="secondary rail-btn" onClick={() => scroll(1)} aria-label="Suivant">›</button>
        </div>
      </div>
      <div className="rail" ref={ref}>
        {items.map((t) => <PosterCard key={t.id} t={t} />)}
      </div>
    </section>
  );
}

/** Accueil du thème Prestige : grande vedette, statistiques, nouvelles, puis rangées d'affiches par catégorie. */
export default function HomeStreaming() {
  const { profile, categories } = useOutletContext<LayoutContext>();
  const user = useAuthStore((s) => s.user);
  const [popular, setPopular] = useState<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<{ id: string; name: string; slug: string; items: any[] }[]>([]);
  const [topUploaders, setTopUploaders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/torrents', { params: { pageSize: 16, sort: 'seeders' } }).then((r) => setPopular(r.data.items)).catch(() => {});
    api.get('/torrents', { params: { pageSize: 16, sort: 'date' } }).then((r) => setLatest(r.data.items)).catch(() => {});
    api.get('/users/leaderboard', { params: { limit: 5 } }).then((r) => setTopUploaders(r.data)).catch(() => {});
    api.get('/stats/global').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      categories.slice(0, 6).map((c) =>
        api.get('/torrents', { params: { categoryId: c.id, pageSize: 14, sort: 'date' })
          .then((r) => ({ id: c.id, name: c.name, slug: c.slug, items: r.data.items as any[] }))
          .catch(() => ({ id: c.id, name: c.name, slug: c.slug, items: [] as any[] })),
      ),
    ).then((rows) => { if (!cancelled) setByCategory(rows.filter((r) => r.items.length > 0)); });
    return () => { cancelled = true; };
  }, [categories]);

  // Vedette : le torrent populaire le plus récent qui a une pochette (avec un synopsis de préférence).
  const featured = popular.find((t) => t.coverImage && t.synopsis) ?? popular.find((t) => t.coverImage) ?? latest.find((t) => t.coverImage) ?? null;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <div className="home-streaming">
      {featured ? (
        <section className="hero-feature" style={{ ['--hero-img' as any]: `url(${featured.coverImage})` }}>
          <div className="hero-feature-bg" />
          <div className="hero-feature-body">
            <div className="hero-feature-text">
              <div className="hero-kicker">✨ À la une · {greeting} {user?.username}</div>
              <h1>{featured.name}</h1>
              <div className="hero-chips">
                {[featured.category?.name, featured.year, featured.resolution, featured.language, formatBytes(featured.size)].filter(Boolean).map((c, i) => <span key={i} className="chip">{c}</span>)}
                <span className="chip"><HealthDot seeders={featured.seeders} />{featured.seeders} seeders</span>
              </div>
              {featured.synopsis && <p className="hero-synopsis">{featured.synopsis}</p>}
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Link to={`/torrents/${featured.id}`}><button type="button" className="hero-cta">Voir la fiche</button></Link>
                <Link to="/browse"><button type="button" className="secondary">Parcourir tout le catalogue</button></Link>
              </div>
            </div>
            <Link to={`/torrents/${featured.id}`} className="hero-feature-poster"><img src={featured.coverImage} alt="" /></Link>
          </div>
        </section>
      ) : (
        <section className="hero-feature hero-plain">
          <div className="hero-feature-bg" />
          <div className="hero-feature-body">
            <div className="hero-feature-text">
              <div className="hero-kicker">{greeting} {user?.username}</div>
              <h1>Bienvenue sur Seeduction</h1>
              <p className="hero-synopsis">Le tracker privé d'exception. Les premiers torrents envoyés apparaîtront ici, en grand.</p>
              <Link to="/upload"><button type="button" className="hero-cta">Envoyer un torrent</button></Link>
            </div>
          </div>
        </section>
      )}

      {profile && (
        <div className="stat-cards">
          <Link to="/profile" className="stat-card"><span className="muted">Ratio</span><strong>{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</strong></Link>
          <Link to="/profile" className="stat-card"><span className="muted">Upload</span><strong style={{ color: 'var(--success)' }}>{formatBytes(profile.uploaded)}</strong></Link>
          <Link to="/profile" className="stat-card"><span className="muted">Téléchargé</span><strong style={{ color: 'var(--danger)' }}>{formatBytes(profile.downloaded)}</strong></Link>
          <Link to="/bonus" className="stat-card"><span className="muted">Points bonus</span><strong style={{ color: 'var(--gold-bright)' }}>{formatNumber(Math.round(profile.bonusPoints))}</strong></Link>
        </div>
      )}

      <NewsPanel limit={3} />

      <Rail title="Nouveautés" icon="🆕" to="/browse?sort=date" items={latest} />
      <Rail title="Les plus seedés" icon="🔥" to="/browse?sort=seeders" items={popular} />
      {byCategory.map((row) => (
        <Rail key={row.id} title={row.name} icon={CATEGORY_STYLE[row.slug]?.icon ?? '📁'} to={`/browse?categoryId=${row.id}`} items={row.items} />
      ))}

      <div className="home-bottom">
        <div className="panel">
          <div className="panel-title"><span className="title-icon">👑</span>Top uploaders</div>
          {topUploaders.map((u, i) => (
            <div key={u.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
              <span><span className="muted">{i + 1}.</span> <UserLink user={u} /></span>
              <span className="muted">{formatBytes(u.uploaded)}</span>
            </div>
          ))}
          {topUploaders.length === 0 && <p className="muted">Pas encore de classement.</p>}
          <Link to="/leaderboard" className="muted">Voir le Top 100 →</Link>
        </div>
        {stats && (
          <div className="panel">
            <div className="panel-title"><span className="title-icon">📊</span>La communauté</div>
            <div className="mini-stats">
              <div><strong>{formatNumber(stats.totalUsers)}</strong><span className="muted">membres</span></div>
              <div><strong>{formatNumber(stats.totalTorrents)}</strong><span className="muted">torrents</span></div>
              <div><strong>{formatNumber(stats.totalSeeders)}</strong><span className="muted">seeders</span></div>
              <div><strong>{formatBytes(stats.totalTraffic)}</strong><span className="muted">échangés</span></div>
            </div>
            <Link to="/stats" className="muted">Toutes les statistiques →</Link>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Dernier torrent : {latest[0] ? timeAgo(latest[0].createdAt) : '—'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
