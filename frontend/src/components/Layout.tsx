import { useEffect, useState, FormEvent } from 'react';
import { Outlet, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';
import NotificationsBell from './NotificationsBell';
import InstallPrompt from './InstallPrompt';
import ThemeSwitcher from './ThemeSwitcher';
import SearchBox from './SearchBox';
import FreeleechBanner from './FreeleechBanner';
import Avatar from './Avatar';
import ChatDock from './ChatDock';
import StatusSwitcher from './StatusSwitcher';
import { useDmStore } from '../store/dm';
import { usePublicChatStore } from '../store/publicChat';
import { useTheme } from '../lib/theme';
import { PRESENCE_OPTIONS } from '../lib/presence';

export interface Profile {
  id: string;
  username: string;
  role: string;
  uploaded: string;
  downloaded: string;
  bonusPoints: number;
  ratio: number | null;
  createdAt: string;
  avatarUrl?: string | null;
  presenceStatus?: 'ONLINE' | 'AWAY' | 'BUSY' | 'INVISIBLE';
  statusText?: string | null;
  _count: { torrentsUploaded: number; invitees: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  _count?: { torrents: number };
  children?: { id: string; _count?: { torrents: number } }[];
}

export interface LayoutContext {
  profile: Profile | null;
  categories: Category[];
}

export const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  films: { icon: '🎬', color: '#7aa0ff' },
  'series-tv': { icon: '📺', color: '#c084fc' },
  musique: { icon: '🎵', color: '#f472b6' },
  jeux: { icon: '🎮', color: '#4caf50' },
  applications: { icon: '💻', color: '#e0b84a' },
  animes: { icon: '🌸', color: '#ef6c4a' },
  livres: { icon: '📚', color: '#2dd4bf' },
  xxx: { icon: '🔞', color: '#9fb8a0' },
  jeunesse: { icon: '🧸', color: '#facc15' },
  'spectacles-et-humour': { icon: '🎭', color: '#fb923c' },
  sports: { icon: '🏆', color: '#38bdf8' },
  'formations-et-cours': { icon: '🎓', color: '#a3e635' },
  autres: { icon: '📁', color: '#94a3b8' },
  'films-videos': { icon: '🎬', color: '#7aa0ff' },
  ebook: { icon: '📚', color: '#2dd4bf' },
  audio: { icon: '🎵', color: '#f472b6' },
  'jeux-video': { icon: '🎮', color: '#4caf50' },
  emulation: { icon: '🕹️', color: '#f59e0b' },
  gps: { icon: '🧭', color: '#22d3ee' },
  nulled: { icon: '🧩', color: '#a78bfa' },
  'imprimante-3d': { icon: '🧊', color: '#fb7185' },
};

interface NavItem { to: string; icon: string; cls: string; label: string; match: (path: string) => boolean; staffOnly?: boolean }

const starts = (prefix: string) => (p: string) => p === prefix || p.startsWith(`${prefix}/`);

/** Le lien de la section en cours est surligné (les pages de détail comptent dans leur section : un torrent → Parcourir). */
const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '🏠', cls: 'c-home', label: 'Accueil', match: (p) => p === '/' },
  { to: '/browse', icon: '🔍', cls: 'c-search', label: 'Parcourir', match: (p) => starts('/browse')(p) || starts('/torrents')(p) || starts('/entities')(p) },
  { to: '/news', icon: '📰', cls: 'c-rules', label: 'Nouvelles', match: starts('/news') },
  { to: '/upload', icon: '⬆️', cls: 'c-upload', label: 'Envoyer', match: starts('/upload') },
  { to: '/requests', icon: '💬', cls: 'c-chat', label: 'Demandes', match: starts('/requests') },
  { to: '/favorites', icon: '⭐', cls: 'c-collections', label: 'Favoris', match: starts('/favorites') },
  { to: '/collections', icon: '📚', cls: 'c-collections', label: 'Collections', match: starts('/collections') },
  { to: '/friends', icon: '👫', cls: 'c-collections', label: 'Amis', match: starts('/friends') },
  { to: '/chat', icon: '🗨️', cls: 'c-livechat', label: 'Chat', match: starts('/chat') },
  { to: '/forum', icon: '👥', cls: 'c-forum', label: 'Forums', match: starts('/forum') },
  { to: '/stats', icon: '📊', cls: 'c-search', label: 'Stats', match: (p) => starts('/stats')(p) || starts('/leaderboard')(p) || starts('/hall-of-fame')(p) },
  { to: '/rules', icon: '🛡️', cls: 'c-rules', label: 'Règles', match: starts('/rules') },
  { to: '/admin', icon: '👑', cls: 'c-staff', label: 'Staff', match: starts('/admin'), staffOnly: true },
];

export default function Layout() {
  const { user, accessToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const theme = useTheme();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sideCollapsed') === '1'; } catch { return false; }
  });
  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem('sideCollapsed', v ? '0' : '1'); } catch { /* stockage indisponible */ }
      return !v;
    });
  }
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const dmConnect = useDmStore((s) => s.connect);
  const dmDisconnect = useDmStore((s) => s.disconnect);
  const dmTotalUnread = useDmStore((s) => s.totalUnread);
  const dmBump = useDmStore((s) => s.friendRequestBump);
  const chatConnect = usePublicChatStore((s) => s.connect);
  const chatDisconnect = usePublicChatStore((s) => s.disconnect);

  // Compteur de messages non lus (thème Prestige) : rafraîchi à chaque changement de page.
  useEffect(() => {
    setDrawer(false);
    if (!accessToken) return;
    api.get('/messages/unread-count').then((r) => setUnreadMessages(Number(r.data) || 0)).catch(() => {});
  }, [location.pathname, accessToken]);

  // Chat privé (amis) et chat public : connectés tant qu'on est authentifié, indépendamment de la page affichée
  // (façon Messenger — accessibles partout via les bulles, pas seulement sur leurs pages dédiées).
  useEffect(() => {
    if (accessToken && user) { dmConnect(accessToken); chatConnect(accessToken, user.id); }
    else { dmDisconnect(); chatDisconnect(); }
    return () => { if (!accessToken) { dmDisconnect(); chatDisconnect(); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) { setPendingFriendRequests(0); return; }
    api.get('/friends').then((r) => setPendingFriendRequests(r.data.incoming?.length ?? 0)).catch(() => {});
  }, [accessToken, dmBump]);

  useEffect(() => {
    if (!accessToken) return;
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      api.get('/users/me').then((r) => setProfile(r.data)).catch(() => {});
    } else {
      setProfile(null);
    }
  }, [accessToken]);

  const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'OWNER';

  function goSearch() {
    navigate(`/browse?search=${encodeURIComponent(search)}`);
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    goSearch();
  }

  // Le site n'est pas visible aux non-membres : tout ce qui passe par ce
  // Layout (donc tout sauf /login et /register) exige une session valide.
  if (!accessToken) return <Navigate to="/login" replace />;

  // ---- Thème Prestige : barre latérale (ordinateur) / barre d'onglets (mobile) ----
  if (theme === 'prestige') {
    const visibleNav = NAV_ITEMS.filter((item) => !item.staffOnly || isStaff);
    const tabs = ['/', '/browse', '/upload', '/forum'].map((to) => NAV_ITEMS.find((i) => i.to === to)!);

    return (
      <div className={`shell${collapsed ? ' collapsed' : ''}`}>
        {drawer && <div className="shell-overlay" onClick={() => setDrawer(false)} />}
        <aside className={`side-nav${drawer ? ' open' : ''}`}>
          <div className="side-head">
            <Link to="/" className="side-brand" title="Accueil">
              <img src="/logo-icon.png" alt="" width={34} height={34} />
              <span>SEEDUCTION</span>
            </Link>
            <button
              type="button"
              className="secondary side-collapse"
              onClick={toggleCollapsed}
              title={collapsed ? 'Agrandir le menu' : 'Réduire le menu (icônes seules)'}
              aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
              aria-expanded={!collapsed}
            >
              {collapsed ? '❯' : '❮'}
            </button>
          </div>

          <div className="side-user">
            <div
              className="side-user-card"
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => setStatusOpen((v) => !v)}
              title="Changer de statut"
            >
              <span style={{ position: 'relative', display: 'inline-block', width: 38, height: 38, flexShrink: 0 }}>
                <Avatar user={{ username: user?.username, avatarUrl: profile?.avatarUrl }} size={38} />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: '50%',
                    background: (PRESENCE_OPTIONS.find((o) => o.value === profile?.presenceStatus) ?? PRESENCE_OPTIONS[0]).color,
                    border: '2px solid var(--bg-panel, #10162a)',
                  }}
                />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="side-user-name">{user?.username}</div>
                <div className="side-user-sub">
                  {profile?.statusText ? <span style={{ fontStyle: 'italic' }}>{profile.statusText}</span> : <>Ratio {profile?.ratio != null ? profile.ratio.toFixed(2) : '∞'}</>}
                </div>
              </div>
              <StatusSwitcher
                value={profile?.presenceStatus}
                statusText={profile?.statusText}
                open={statusOpen}
                onOpenChange={setStatusOpen}
                onChange={(v, t) => setProfile((p) => (p ? { ...p, presenceStatus: v, statusText: t } : p))}
              />
            </div>
            <button className="secondary side-logout" onClick={() => { logout(); navigate('/login'); }} title="Se déconnecter">⎋</button>
          </div>
          <nav className="side-links">
            {visibleNav.map((item) => {
              const active = item.match(location.pathname);
              return (
                <Link key={item.to} to={item.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} title={item.label}>
                  <span className="side-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

        </aside>

        <div className="shell-main">
          <header className="side-topbar">
            <button type="button" className="secondary side-burger" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">☰</button>
            <form className="side-search" onSubmit={submitSearch}>
              <SearchBox
                placeholder="Rechercher un torrent, un membre, une catégorie..."
                value={search}
                onChange={setSearch}
                onSubmit={goSearch}
                scopes={['torrents', 'users', 'categories', 'entities']}
              />
            </form>
            {profile && (
              <div className="stat-pills">
                <span className="pill up" title="Upload">▲ {formatBytes(profile.uploaded)}</span>
                <span className="pill down" title="Téléchargé">▼ {formatBytes(profile.downloaded)}</span>
                <Link to="/bonus" className="pill gold" title="Points bonus : boutique et règle du seed">✦ {formatNumber(Math.round(profile.bonusPoints))}</Link>
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <ThemeSwitcher />
              <NotificationsBell />
              <Link to="/messages" className={`icon-pill${starts('/messages')(location.pathname) ? ' active' : ''}`} title="Messages">
                ✉️{unreadMessages > 0 && <span className="dot-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
              </Link>
              <Link to="/friends" className={`icon-pill${starts('/friends')(location.pathname) ? ' active' : ''}`} title="Amis">
                👫{(pendingFriendRequests + dmTotalUnread) > 0 && <span className="dot-badge">{pendingFriendRequests + dmTotalUnread > 99 ? '99+' : pendingFriendRequests + dmTotalUnread}</span>}
              </Link>
            </div>
          </header>

          <FreeleechBanner />

          <main className="container">
            <div key={location.pathname} className="page-enter">
              <Outlet context={{ profile, categories } satisfies LayoutContext} />
            </div>
          </main>
        </div>

        <nav className="tabbar" aria-label="Navigation principale">
          {tabs.map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link key={item.to} to={item.to} className={active ? 'active' : ''}>
                <span>{item.icon}</span>
                <small>{item.label}</small>
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} className="tab-more">
            <span>☰</span>
            <small>Menu</small>
          </button>
        </nav>

        <InstallPrompt />
        <ChatDock />
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/" className="row" style={{ gap: 8 }}>
          <img src="/logo-icon.png" alt="" width={26} height={26} />
          <span className="topbar-brand">Seeduction Tracker</span>
        </Link>
        {profile && (
          <div className="topbar-stats">
            <div className="topbar-stat ratio">
              <span className="label">Ratio :</span>
              <span className="value">{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</span>
            </div>
            <div className="topbar-stat up">
              <span className="label">Upload :</span>
              <span className="value">{formatBytes(profile.uploaded)}</span>
            </div>
            <div className="topbar-stat down">
              <span className="label">Téléchargé :</span>
              <span className="value">{formatBytes(profile.downloaded)}</span>
            </div>
            <Link to="/bonus" className="topbar-stat" title="Boutique bonus et règle du seed">
              <span className="label">Points Seed :</span>
              <span className="value">{formatNumber(Math.round(profile.bonusPoints))}</span>
            </Link>
            <div className="topbar-stat">
              <span className="label">Invitations :</span>
              <span className="value">{profile._count.invitees}</span>
            </div>
          </div>
        )}
        <div className="row">
          <ThemeSwitcher />
          <NotificationsBell />
          <Link to="/messages" className={`top-link${starts('/messages')(location.pathname) ? ' active' : ''}`}>Messages</Link>
          <Link to="/friends" className={`top-link${starts('/friends')(location.pathname) ? ' active' : ''}`}>Amis{(pendingFriendRequests + dmTotalUnread) > 0 ? ` (${pendingFriendRequests + dmTotalUnread})` : ''}</Link>
          <Link to="/profile" className={`top-link${starts('/profile')(location.pathname) || starts('/users')(location.pathname) ? ' active' : ''}`}>{user?.username}</Link>
          <button className="secondary" onClick={() => { logout(); navigate('/login'); }}>
            Déconnexion
          </button>
        </div>
      </div>

      <FreeleechBanner />

      <div className="mainnav">
        <div className="nav-links">
          {NAV_ITEMS.filter((item) => !item.staffOnly || isStaff).map((item) => {
            const active = item.match(location.pathname);
            return (
              <Link key={item.to} to={item.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <span className={`nav-icon ${item.cls}`}>{item.icon}</span>{item.label}
              </Link>
            );
          })}
        </div>

        <form className="search-row" onSubmit={submitSearch}>
          <SearchBox
            placeholder="Rechercher des torrents, des utilisateurs ou des catégories..."
            value={search}
            onChange={setSearch}
            onSubmit={goSearch}
            scopes={['torrents', 'users', 'categories', 'entities']}
          />
          <button type="submit">Rechercher</button>
        </form>

        {categories.length > 0 && (
          <div className="category-chips">
            {categories.map((c) => {
              const style = CATEGORY_STYLE[c.slug];
              const activeCategory = location.pathname === '/browse' ? new URLSearchParams(location.search).get('categoryId') : null;
              const isActive = !!activeCategory && (activeCategory === c.id || !!c.children?.some((sub) => sub.id === activeCategory));
              return (
                <Link key={c.id} to={`/browse?categoryId=${c.id}`} title={c.name} className={[c.imageUrl ? 'has-image' : '', isActive ? 'active' : ''].filter(Boolean).join(' ') || undefined}>
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} className="category-img" />
                  ) : (
                    <>
                      {style ? <span>{style.icon}</span> : <span className="dot" style={{ background: 'var(--gold)' }} />}
                      {c.name}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="container">
        <Outlet context={{ profile, categories } satisfies LayoutContext} />
      </div>

      <InstallPrompt />
      <ChatDock />
    </div>
  );
}
