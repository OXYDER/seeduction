import { useEffect, useState, FormEvent } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';

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
}

export interface LayoutContext {
  profile: Profile | null;
  categories: Category[];
}

export default function Layout() {
  const { user, accessToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (accessToken) {
      api.get('/users/me').then((r) => setProfile(r.data)).catch(() => {});
    } else {
      setProfile(null);
    }
  }, [accessToken]);

  const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'OWNER';

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/browse?search=${encodeURIComponent(search)}`);
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/" className="row" style={{ gap: 8 }}>
          <img src="/logo-icon.png" alt="" width={26} height={26} />
          <span className="topbar-brand">Seeduction Tracker</span>
        </Link>
        {profile ? (
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
            <div className="topbar-stat">
              <span className="label">Points Seed :</span>
              <span className="value">{formatNumber(Math.round(profile.bonusPoints))}</span>
            </div>
            <div className="topbar-stat">
              <span className="label">Invitations :</span>
              <span className="value">{profile._count.invitees}</span>
            </div>
          </div>
        ) : (
          <span className="muted">Tracker BitTorrent privé</span>
        )}
        <div className="row">
          {user ? (
            <>
              <Link to="/messages">Messages</Link>
              <Link to="/profile">{user.username}</Link>
              <button className="secondary" onClick={() => { logout(); navigate('/login'); }}>
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Connexion</Link>
              <Link to="/register">Inscription</Link>
            </>
          )}
        </div>
      </div>

      <div className="mainnav">
        <div className="nav-links">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            <span className="icon">🏠</span>Accueil
          </Link>
          <Link to="/browse" className={location.pathname === '/browse' ? 'active' : ''}>
            <span className="icon">🔍</span>Parcourir
          </Link>
          {user && (
            <Link to="/upload"><span className="icon">⬆️</span>Envoyer</Link>
          )}
          <Link to="/requests"><span className="icon">💬</span>Demandes</Link>
          <Link to="/forum"><span className="icon">👥</span>Forums</Link>
          <Link to="/rules"><span className="icon">🛡️</span>Règles</Link>
          {isStaff && <Link to="/admin"><span className="icon">👑</span>Staff</Link>}
        </div>

        <form className="search-row" onSubmit={submitSearch}>
          <input
            placeholder="Rechercher des torrents, des utilisateurs ou des catégories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Rechercher</button>
        </form>

        {categories.length > 0 && (
          <div className="category-chips">
            {categories.map((c) => (
              <Link key={c.id} to={`/browse?categoryId=${c.id}`}>{c.name}</Link>
            ))}
          </div>
        )}
      </div>

      <div className="container">
        <Outlet context={{ profile, categories } satisfies LayoutContext} />
      </div>
    </div>
  );
}
