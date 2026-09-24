import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import { usePageBackdrop } from '../lib/backdrop';
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
function Rail({ title, to, items, loading }: { title: string; to: string; items: any[]; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  if (items.length === 0 && !loading) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="rail-section rail-plex">
      <div className="rail-head">
        <h2>{title}</h2>
        <div className="row" style={{ gap: 6 }}>
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

/** « Continuer » : un torrent en cours de téléchargement ou de seed, avec sa barre de progression. */
function ContinueCard({ t }: { t: any }) {
  const percent = Math.round(t.progress * 100);
  return (
    <Link to={`/torrents/${t.id}`} className="poster-card rail-card continue-card">
      {t.coverImage ? <img className="poster" src={t.coverImage} alt="" loading="lazy" /> : <div className="poster-fallback">{CATEGORY_STYLE[t.category?.slug]?.icon ?? '📦'}</div>}
      <div className="progress-bar"><div style={{ width: `${percent}%` }} className={t.isSeeder ? 'seeding' : ''} /></div>
      <div className="poster-body">
        <div className="poster-title">{t.name}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{t.isSeeder ? '🌱 En seed' : `⬇ ${percent} %`}</div>
      </div>
    </Link>
  );
}

const TABS = [
  { id: 'trending', label: 'Tendances' },
  { id: 'news', label: 'Nouvelles' },
  { id: 'community', label: 'Activité' },
  { id: 'me', label: 'Mon compte' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Accueil du thème Prestige, façon Plex : fond cinématographique (l'image du torrent à la une), onglets en haut,
 * grand titre avec ses infos, puis rangées d'affiches par catégorie.
 */
export default function HomeStreaming() {
  const { profile, categories } = useOutletContext<LayoutContext>();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<TabId>('trending');
  const [popular, setPopular] = useState<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<{ id: string; name: string; slug: string; items: any[] }[]>([]);
  const [topUploaders, setTopUploaders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [followed, setFollowed] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loadedLatest, setLoadedLatest] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  useEffect(() => {
    api.get('/torrents', { params: { pageSize: 18, sort: 'seeders' } }).then((r) => setPopular(r.data.items)).catch(() => {});
    api.get('/torrents', { params: { pageSize: 18, sort: 'date' } }).then((r) => setLatest(r.data.items)).catch(() => {}).finally(() => setLoadedLatest(true));
    api.get('/torrents/mine/active').then((r) => setActive(r.data)).catch(() => {});
    api.get('/torrents/mine/followed').then((r) => setFollowed(r.data)).catch(() => {});
    api.get('/torrents/mine/recommended').then((r) => setRecommended(r.data)).catch(() => {});
    api.get('/users/leaderboard', { params: { limit: 5 } }).then((r) => setTopUploaders(r.data)).catch(() => {});
    api.get('/stats/global').then((r) => setStats(r.data)).catch(() => {});
    api.get('/forum/latest').then((r) => setTopics(r.data.slice(0, 8))).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      categories.slice(0, 6).map((c) =>
        api.get('/torrents', { params: { categoryId: c.id, pageSize: 16, sort: 'date' } })
          .then((r) => ({ id: c.id, name: c.name, slug: c.slug, items: r.data.items as any[] }))
          .catch(() => ({ id: c.id, name: c.name, slug: c.slug, items: [] as any[] })),
      ),
    ).then((rows) => { if (!cancelled) setByCategory(rows.filter((r) => r.items.length > 0)); });
    return () => { cancelled = true; };
  }, [categories]);

  // À la une : le torrent populaire qui a une grande image de fond (TMDB) ou au moins une pochette, de préférence avec un synopsis.
  const withArt = (t: any) => t.backdrop || t.coverImage;
  const candidates = [...popular, ...latest].filter((t, i, all) => withArt(t) && all.findIndex((x) => x.id === t.id) === i);
  const featuredList = [
    ...candidates.filter((t) => t.backdrop && t.synopsis),
    ...candidates.filter((t) => !(t.backdrop && t.synopsis) && t.synopsis),
    ...candidates.filter((t) => !t.synopsis),
  ].slice(0, 5);
  const featured = featuredList[heroIndex % Math.max(1, featuredList.length)] ?? null;
  usePageBackdrop(featured ? (featured.backdrop ?? featured.coverImage) : null);

  // Défilement automatique de la vedette (en pause quand la souris est dessus).
  useEffect(() => {
    if (featuredList.length < 2 || heroPaused || tab !== 'trending') return;
    const timer = window.setInterval(() => setHeroIndex((i) => (i + 1) % featuredList.length), 9000);
    return () => window.clearInterval(timer);
  }, [featuredList.length, heroPaused, tab]);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <div className="home-plex">
      <nav className="tabs" aria-label="Sections de l'accueil">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'trending' && (
        <>
          {featured ? (
            <section key={featured.id} className="hero-plex hero-fade" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}>
              <div className="hero-kicker">{greeting} {user?.username} · À la une</div>
              <h1>{featured.name}</h1>
              <div className="hero-meta">
                {[featured.year, featured.category?.name, featured.resolution, featured.language, formatBytes(featured.size)].filter(Boolean).join('  ·  ')}
                <span className="hero-health"><HealthDot seeders={featured.seeders} />{featured.seeders} seeders</span>
              </div>
              {featured.synopsis && <p className="hero-synopsis">{featured.synopsis}</p>}
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Link to={`/torrents/${featured.id}`}><button type="button" className="hero-cta">Voir la fiche</button></Link>
                <Link to="/browse"><button type="button" className="secondary hero-cta-2">Parcourir le catalogue</button></Link>
              </div>
              {featuredList.length > 1 && (
                <div className="hero-dots" role="tablist" aria-label="Torrents à la une">
                  {featuredList.map((f, i) => (
                    <button key={f.id} type="button" role="tab" aria-selected={i === heroIndex % featuredList.length} className={i === heroIndex % featuredList.length ? 'on' : ''} onClick={() => setHeroIndex(i)} aria-label={f.name} />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="hero-plex">
              <div className="hero-kicker">{greeting} {user?.username}</div>
              <h1>Bienvenue sur Seeduction</h1>
              <p className="hero-synopsis">Le tracker privé d'exception. Les premiers torrents envoyés apparaîtront ici, en grand.</p>
              <Link to="/upload"><button type="button" className="hero-cta">Envoyer un torrent</button></Link>
            </section>
          )}

          {active.length > 0 && (
            <section className="rail-section rail-plex">
              <div className="rail-head"><h2>Continuer</h2><span className="muted">Tes téléchargements et seeds en cours</span></div>
              <div className="rail">{active.map((t) => <span key={t.id}><ContinueCard t={t} /></span>)}</div>
            </section>
          )}
          <Rail title="De tes abonnements" to="/favorites" items={followed} />
          <Rail title="Recommandé pour toi" to="/browse" items={recommended} />
          <Rail title="Nouveautés" to="/browse?sort=date" items={latest} loading={!loadedLatest} />
          <Rail title="Les plus seedés cette semaine" to="/browse?sort=seeders" items={popular} />
          {byCategory.map((row) => (
            <Rail key={row.id} title={row.name} to={`/browse?categoryId=${row.id}`} items={row.items} />
          ))}
        </>
      )}

      {tab === 'news' && <NewsPanel limit={6} />}

      {tab === 'community' && (
        <div className="home-bottom">
          <div className="panel">
            <div className="panel-title"><span className="title-icon">💬</span>Derniers sujets du forum</div>
            {topics.map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: 'space-between', padding: '7px 0', gap: 12 }}>
                <Link to={`/forum/topics/${t.id}`} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.unread ? '🟣 ' : ''}{t.title}</Link>
                <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{t.replies} rép. · {timeAgo(t.lastPostAt)}</span>
              </div>
            ))}
            {topics.length === 0 && <p className="muted">Aucun sujet pour l'instant.</p>}
            <Link to="/forum" className="muted">Aller au forum →</Link>
          </div>
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
            </div>
          )}
        </div>
      )}

      {tab === 'me' && profile && (
        <div className="grid" style={{ gap: 18 }}>
          <div className="stat-cards">
            <Link to="/profile" className="stat-card"><span className="muted">Ratio</span><strong>{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</strong></Link>
            <Link to="/profile" className="stat-card"><span className="muted">Upload</span><strong style={{ color: 'var(--success)' }}>{formatBytes(profile.uploaded)}</strong></Link>
            <Link to="/profile" className="stat-card"><span className="muted">Téléchargé</span><strong style={{ color: 'var(--danger)' }}>{formatBytes(profile.downloaded)}</strong></Link>
            <Link to="/bonus" className="stat-card"><span className="muted">Points bonus</span><strong style={{ color: '#fbbf24' }}>{formatNumber(Math.round(profile.bonusPoints))}</strong></Link>
          </div>
          <div className="panel">
            <div className="panel-title"><span className="title-icon">⚡</span>Raccourcis</div>
            <div className="shortcuts">
              <Link to="/profile">👤 Mon profil</Link>
              <Link to={`/browse?uploaderId=${user?.id}`}>⬆️ Mes uploads</Link>
              <Link to="/favorites">⭐ Favoris</Link>
              <Link to="/bonus">🎁 Boutique bonus</Link>
              <Link to="/messages">✉️ Messages</Link>
              <Link to="/requests">💬 Demandes</Link>
              <Link to="/collections">📚 Collections</Link>
              <Link to="/rules">🛡️ Règles</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
