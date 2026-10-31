import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import { usePageBackdrop } from '../lib/backdrop';
import { CATEGORY_STYLE, type LayoutContext } from './Layout';
import { PosterCard, Rail } from './TorrentRail';
import MetaChips from './MetaChips';
import { Board } from './stats/StatsParts';
import NewsPanel from './NewsPanel';
import TelegramLogo from './TelegramLogo';
import ModerationRail from './ModerationRail';
import HomeRail from './HomeRail';
import { ForYouGrid, HomeActions, HomeCustomize, HomeStrip, LatestRail, Top5, useHomePrefs } from './HomeBits';
import HomeSection, { HomeSectionsControls } from './HomeSection';
import HomeTabs, { type HomeTab } from './HomeTabs';
import ContinueWatching from './ContinueWatching';
import UserLink from './UserLink';
import { HomeComposer } from './Wall';
import { HealthDot } from './TorrentBits';
import CategoryTag from './CategoryTag';

const PERIODS: { value: 'day' | 'week' | 'month'; label: string }[] = [
  { value: 'day', label: '24 heures' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
];
const COUNT_OPTIONS = [10, 18, 25, 50, 100];

/**
 * Rangée avec ses propres onglets 24h/semaine/mois (et, si `allowCount`, un choix du nombre affiché) — sa propre
 * requête à chaque changement, indépendante des rangées "populaire"/"nouveautés" fixes du reste de la page.
 */
function TimeRangeRail({ title, sort, allowCount, icon }: { title: string; sort: 'date' | 'seeders'; allowCount?: boolean; icon: string }) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [count, setCount] = useState(18);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/torrents', { params: { pageSize: count, sort, period } })
      .then((r) => { if (!cancelled) { setItems(r.data.items); setTotal(r.data.total); } })
      .catch(() => { if (!cancelled) { setItems([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sort, period, count]);

  const periodLabel = ({ day: 'dernières 24 h', week: 'cette semaine', month: 'ce mois' } as const)[period];
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <section className="panel ornate rail-section rail-plex">
      <div className="panel-title" style={{ flexWrap: 'wrap' }}>
        <span className="title-icon">{icon}</span>{title}{total > 0 && <span className="muted" style={{ fontSize: 13, fontWeight: 400 }} title="Nombre de torrents ajoutés sur la période choisie (pas le total du site)">({total} · {periodLabel})</span>}
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <div className="row" style={{ gap: 4 }}>
            {PERIODS.map((p) => (
              <button key={p.value} type="button" className={`secondary${period === p.value ? ' on' : ''}`} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setPeriod(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          {allowCount && (
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} title="Nombre à afficher dans cette rangée">
              {COUNT_OPTIONS.map((n) => <option key={n} value={n}>{n} affichés</option>)}
            </select>
          )}
          <Link to={`/browse?sort=${sort}&period=${period}`} className="rail-all">
            {total > count ? `Voir les ${total} (${periodLabel}) →` : 'Tout voir →'}
          </Link>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="secondary rail-btn" onClick={() => scroll(-1)} aria-label="Précédent">‹</button>
            <button type="button" className="secondary rail-btn" onClick={() => scroll(1)} aria-label="Suivant">›</button>
          </div>
        </div>
      </div>
      <div className="rail" ref={ref}>
        {loading && Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton-card"><span className="skeleton-poster" /><span className="skeleton-line" /></span>)}
        {!loading && items.length === 0 && <p className="muted" style={{ padding: '20px 4px' }}>Rien à afficher pour cette période.</p>}
        {!loading && items.map((t) => <PosterCard key={t.id} t={t} />)}
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
      <div className="poster-badges"><CategoryTag category={t.category} /></div>
      <div className="progress-bar"><div style={{ width: `${percent}%` }} className={t.isSeeder ? 'seeding' : ''} /></div>
      <div className="poster-body">
        <div className="poster-title">{t.name}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{t.isSeeder ? '🌱 En seed' : `⬇ ${percent} %`}</div>
      </div>
    </Link>
  );
}

/** « Par catégorie » : une pastille par catégorie, une seule rangée d'affiches à la fois (au lieu de six rangées empilées). */
function CategoryRails({ rows }: { rows: { id: string; name: string; slug: string; items: any[] }[] }) {
  const [sel, setSel] = useState(rows[0]?.id);
  const row = rows.find((r) => r.id === sel) ?? rows[0];
  if (!row) return null;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="home-catpills">
        {rows.map((r) => (
          <button key={r.id} type="button" className={`home-catpill${r.id === row.id ? ' on' : ''}`} onClick={() => setSel(r.id)}>
            <span aria-hidden="true">{CATEGORY_STYLE[r.slug]?.icon ?? '📁'}</span> {r.name}
          </button>
        ))}
      </div>
      <Rail icon={CATEGORY_STYLE[row.slug]?.icon ?? '📁'} title={row.name} to={`/browse?categoryId=${row.id}`} items={row.items} />
    </div>
  );
}

/**
 * Accueil du thème Prestige, façon Plex : fond cinématographique (l'image du torrent à la une), les nouvelles, l'activité de la
 * communauté (forum, top, chiffres), puis le grand titre à la une et les rangées d'affiches par catégorie.
 */
export default function HomeStreaming() {
  const { categories } = useOutletContext<LayoutContext>();
  const user = useAuthStore((s) => s.user);
  const [popular, setPopular] = useState<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<{ id: string; name: string; slug: string; items: any[] }[]>([]);
  const [topUploaders, setTopUploaders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const isStaffUser = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(user?.role ?? '');
  const [tg, setTg] = useState<{ enabled?: boolean; inviteUrl?: string | null } | null>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [followed, setFollowed] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [atRisk, setAtRisk] = useState<any[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  // Le nombre de membres en ligne se rafraîchit tout seul.
  useEffect(() => {
    const t = setInterval(() => { api.get('/stats/global').then((r) => setStats(r.data)).catch(() => {}); }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    api.get('/torrents', { params: { pageSize: 18, sort: 'seeders' } }).then((r) => setPopular(r.data.items)).catch(() => {});
    api.get('/torrents', { params: { pageSize: 18, sort: 'date' } }).then((r) => setLatest(r.data.items)).catch(() => {});
    // Torrents encore vivants mais fragiles (1-2 seeders) : les surfacer ici pour qu'on les reseede
    // avant qu'ils tombent à 0 et passent DEAD (voir ECONOMY.deadAfterHours côté backend).
    api.get('/torrents', { params: { pageSize: 18, minSeeders: 1, maxSeeders: 2, sort: 'seeders', order: 'asc' } }).then((r) => setAtRisk(r.data.items)).catch(() => {});
    api.get('/torrents/mine/active').then((r) => setActive(r.data)).catch(() => {});
    api.get('/torrents/mine/followed').then((r) => setFollowed(r.data)).catch(() => {});
    api.get('/torrents/mine/recommended').then((r) => setRecommended(r.data)).catch(() => {});
    api.get('/users/leaderboard', { params: { limit: 5 } }).then((r) => setTopUploaders(r.data)).catch(() => {});
    api.get('/stats/global').then((r) => setStats(r.data)).catch(() => {});
    api.get('/telegram/info').then((r) => setTg(r.data)).catch(() => {});
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
    if (featuredList.length < 2 || heroPaused) return;
    const timer = window.setInterval(() => setHeroIndex((i) => (i + 1) % featuredList.length), 9000);
    return () => window.clearInterval(timer);
  }, [featuredList.length, heroPaused]);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';

  // L'onglet « Pour toi » : reprendre la lecture, puis quatre cartes côte à côte (téléchargements, seeds à terminer, épisode suivant, abonnements) et les recommandations.
  const forYouNode = (
    <>
      <ContinueWatching hideNext />
      <ForYouGrid active={active} followed={followed} />
      {recommended.length > 0 && <Rail icon="✨" title="Recommandé pour toi" to="/browse" items={recommended} />}
    </>
  );

  const heroNode = (
    <>
          {featured ? (
            <section key={featured.id} className="panel ornate hero-frame hero-fade" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}>
              {/* La même image que le fond de la page, bien visible à droite du texte. */}
              <span className="hero-frame-bg" aria-hidden="true" style={{ backgroundImage: `url("${String(featured.backdrop ?? featured.coverImage).replace(/"/g, '%22')}")` }} />
              <div className="panel-title"><span className="title-icon">⭐</span>À la une</div>
              <div className="hero-plex">
              <div className="hero-kicker">{greeting} {user?.profile?.name ?? user?.username} · À la une</div>
              <h1 title={featured.name}>{featured.name}</h1>
              <MetaChips t={featured} className="hero-chips" explicitEpisode />
              <div className="hero-meta">
                {[featured.category?.name, formatBytes(featured.size)].filter(Boolean).join('  ·  ')}
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
                    <button key={f.id} type="button" role="tab" aria-selected={i === heroIndex % featuredList.length} className={i === heroIndex % featuredList.length ? 'on' : ''} onClick={() => setHeroIndex(i)} aria-label={`${i + 1} : ${f.name}`} title={f.name}>{i + 1}</button>
                  ))}
                </div>
              )}
              </div>
            </section>
          ) : (
            <section className="panel ornate hero-frame">
              <div className="panel-title"><span className="title-icon">⭐</span>À la une</div>
              <div className="hero-plex">
              <div className="hero-kicker">{greeting} {user?.profile?.name ?? user?.username}</div>
              <h1>Bienvenue sur Seeduction</h1>
              <p className="hero-synopsis">Le tracker privé d'exception. Les premiers torrents envoyés apparaîtront ici, en grand.</p>
              <Link to="/upload"><button type="button" className="hero-cta">Envoyer un torrent</button></Link>
              </div>
            </section>
          )}
    </>
  );

  const statsNode = (
    <>
        <div className="home-bottom">
          <HomeSection id="forum" label="Derniers sujets du forum" icon="💬">
          <Board
            icon="💬" title="Derniers sujets du forum"
            rows={topics.map((t) => ({ key: t.id, who: <Link to={`/forum/topics/${t.id}`} title={t.title}>{t.title}</Link>, value: t.replies + 1, text: `${t.replies} rép. · ${timeAgo(t.lastPostAt)}` }))}
            rankIcon={(r, i) => (topics[i]?.unread ? '🟣' : '💬')}
            empty="Aucun sujet pour l'instant."
            footer={<Link to="/forum" className="muted">Aller au forum →</Link>}
          />
          </HomeSection>
          <HomeSection id="uploaders" label="Top uploaders" icon="👑">
          <Board
            icon="👑" title="Top uploaders"
            rows={topUploaders.map((u) => ({ key: u.id, who: <UserLink user={u} />, value: Number(u.uploaded), text: formatBytes(u.uploaded) }))}
            empty="Pas encore de classement."
            footer={<Link to="/leaderboard" className="muted">Voir le Top 100 →</Link>}
          />
          </HomeSection>
          <HomeSection id="community" label="La communauté" icon="📊">
          {stats && (
            <div className="panel st-board">
              <h3>📊 La communauté</h3>
              <div className="community-tiles">
                {([
                  ['👥', 'membres', formatNumber(stats.totalUsers), '/members'],
                  ['🟢', 'en ligne', formatNumber(stats.online ?? 0), '/members?view=online'],
                  ['🎞️', 'torrents', formatNumber(stats.totalTorrents), '/browse', true],
                  ['🌱', 'seeders', formatNumber(stats.totalSeeders), '/members?view=seeders'],
                  ['🔁', 'échangés', formatBytes(stats.totalTraffic), '/stats'],
                ] as [string, string, string, string, boolean?][]).map(([icon, label, value, to, everyone]) => {
                  const inner = <><span className="community-tile-icon" aria-hidden="true">{icon}</span><strong>{value}</strong><span className="muted">{label}</span></>;
                  // Réservé à l'équipe, sauf les torrents (accessibles à tous) et Telegram.
                  return everyone || isStaffUser
                    ? <Link key={label} to={to} className="community-tile" title={`Voir : ${label}`}>{inner}</Link>
                    : <div key={label} className="community-tile">{inner}</div>;
                })}
                {tg?.enabled && tg.inviteUrl && (
                  <a className="community-tile" href={tg.inviteUrl} target="_blank" rel="noopener noreferrer" title="Rejoindre le groupe Telegram"><span className="community-tile-icon" aria-hidden="true" style={{ opacity: 1 }}><TelegramLogo size={26} /></span><strong>Telegram</strong><span className="muted">rejoindre le groupe</span></a>
                )}
              </div>
              <div className="st-board-footer"><Link to="/stats" className="muted">Toutes les statistiques →</Link></div>
            </div>
          )}
          </HomeSection>
        </div>
    </>
  );

  // Les sections de l'accueil sous la dernière nouvelle, réunies en onglets (un onglet sans contenu n'apparaît pas).
  const tabs: HomeTab[] = [
    { id: 'pour-toi', label: 'Pour toi', icon: '🎯', color: '#34d399', badge: active.length || null, content: forYouNode },
    { id: 'une', label: 'À la une', icon: '⭐', color: '#a78bfa', content: heroNode },
    { id: 'populaires', label: 'Les plus populaires', icon: '🔥', color: '#fb923c', content: <TimeRangeRail title="Les plus populaires" sort="seeders" allowCount icon="🔥" /> },
    { id: 'nouveautes', label: 'Derniers torrents', icon: '🆕', color: '#38bdf8', content: <TimeRangeRail title="Derniers torrents" sort="date" icon="🆕" /> },
    ...(byCategory.length > 0 ? [{ id: 'categories', label: 'Par catégorie', icon: '📂', color: '#c084fc', badge: byCategory.length, content: <CategoryRails rows={byCategory} /> }] : []),
    ...(atRisk.length > 0 ? [{ id: 'a-risque', label: 'À seeder', icon: '⚠️', color: '#f87171', badge: atRisk.length, content: <Rail icon="⚠️" title="Torrents à risque (1-2 seeders) : un petit seed les sauve" to="/browse?minSeeders=1&maxSeeders=2&sort=seeders&order=asc" items={atRisk} /> }] : []),
    { id: 'stats', label: 'Dernières activités et stats', icon: '📊', color: '#2dd4bf', badge: topics.some((t) => t.unread) ? '●' : null, content: statsNode },
  ];

  const { prefs } = useHomePrefs();
  const canUpload = !user?.profile || user.profile.perms?.upload !== false;

  return (
    <div className="home-plex">
      <HomeSectionsControls />
      <div className={`home-layout${prefs.rail ? ' with-rail' : ''}`}>
        <div className="home-col">
        {/* Un profil famille (non principal) garde la salutation : la publication sur le mur est réservée au compte principal. */}
        <div className="home-greet">{user?.profile && !user.profile.isMaster ? <h1>{greeting} {user?.profile?.name ?? user?.username} 👋</h1> : <HomeComposer />}<HomeCustomize /></div>
        {prefs.actions && <HomeActions canUpload={canUpload} />}
        {prefs.actions && <ForYouGrid active={active} />}
        <HomeSection id="moderation" label="Modération" icon="🛡️"><ModerationRail /></HomeSection>
          {/* La dernière nouvelle reste toujours affichée, en grand ; les précédentes en petites cartes (au choix). */}
          {prefs.strip && <HomeStrip />}
          {/* Forum, top uploaders et chiffres de la communauté : juste sous les barres (niveau, badges, pot, freeleech), en trois cases de même hauteur. */}
          {statsNode}
          <NewsPanel heroOnly={!prefs.prevNews} />
          {/* Les sections se suivent, comme dans l'aperçu validé (plus d'onglets) : reprendre la lecture, recommandations, tendances, derniers ajouts, mon activité, catégories, à seeder, forum et chiffres. */}
          <ContinueWatching hideNext />
          {recommended.length > 0 ? <Rail icon="⭐" title="Recommandé pour toi" to="/browse" items={recommended} /> : <Rail icon="🔥" title="Les plus populaires" to="/browse?sort=seeders" items={popular} />}
          <Top5 items={popular} />
          <LatestRail latest={latest} />
          {atRisk.length > 0 && <Rail icon="⚠️" title="À seeder : torrents à 1-2 seeders, un petit seed les sauve" to="/browse?minSeeders=1&maxSeeders=2&sort=seeders&order=asc" items={atRisk} />}
        </div>
        {prefs.rail && <HomeRail />}
      </div>
    </div>
  );
}
