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

export interface Profile {
  id: string;
  username: string;
  role: string;
  uploaded: string;
  downloaded: string;
  bonusPoints: number;
  ratio: number | null;
  createdAt: string;
  _count: { torrentsUploaded: number; invitees: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  children?: { id: string }[];
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
    </div>
  );
}
