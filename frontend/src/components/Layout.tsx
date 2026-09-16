import { useEffect, useState, FormEvent } from 'react';
import { Outlet, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import { getRankInfo } from '../lib/rank';

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

interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
}

interface TopUploader {
  id: string;
  username: string;
  uploaded: string;
}

interface GlobalStats {
  totalUsers: number;
  totalTorrents: number;
  totalSeeders: number;
  totalLeechers: number;
  totalPeers: number;
  totalTraffic: string;
}

export default function Layout() {
  const { user, accessToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [topUploaders, setTopUploaders] = useState<TopUploader[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/announcements', { params: { limit: 3 } }).then((r) => setAnnouncements(r.data)).catch(() => {});
    api.get('/users/leaderboard', { params: { limit: 5 } }).then((r) => setTopUploaders(r.data)).catch(() => {});
    api.get('/stats/global').then((r) => setStats(r.data)).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      api.get('/users/me').then((r) => setProfile(r.data)).catch(() => {});
    } else {
      setProfile(null);
    }
  }, [accessToken]);

  const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'OWNER';
  const rank = profile ? getRankInfo(profile.uploaded) : null;

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/browse?search=${encodeURIComponent(search)}`);
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
            <div className="topbar-stat">
              <span className="label">Points Seed :</span>
              <span className="value">{formatNumber(Math.round(profile.bonusPoints))}</span>
            </div>
            <div className="topbar-stat">
              <span className="label">Invitations :</span>
              <span className="value">{profile._count.invitees}</span>
            </div>
          </div>
        )}
        <div className="row">
          <Link to="/messages">Messages</Link>
          <Link to="/profile">{user?.username}</Link>
          <button className="secondary" onClick={() => { logout(); navigate('/login'); }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div className="mainnav">
        <div className="nav-links">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            <span className="nav-icon c-home">🏠</span>Accueil
          </Link>
          <Link to="/browse" className={location.pathname === '/browse' ? 'active' : ''}>
            <span className="nav-icon c-search">🔍</span>Parcourir
          </Link>
          <Link to="/upload"><span className="nav-icon c-upload">⬆️</span>Envoyer</Link>
          <Link to="/requests"><span className="nav-icon c-chat">💬</span>Demandes</Link>
          <Link to="/forum"><span className="nav-icon c-forum">👥</span>Forums</Link>
          <Link to="/rules"><span className="nav-icon c-rules">🛡️</span>Règles</Link>
          {isStaff && <Link to="/admin"><span className="nav-icon c-staff">👑</span>Staff</Link>}
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
            {categories.map((c) => {
              const style = CATEGORY_STYLE[c.slug];
              return (
                <Link key={c.id} to={`/browse?categoryId=${c.id}`}>
                  {style ? <span>{style.icon}</span> : <span className="dot" style={{ background: 'var(--gold)' }} />}
                  {c.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="container">
        <div className="dashboard-grid">
          <div className="grid col-left">
            {profile && rank && (
              <div className="panel ornate">
                <div className="row" style={{ gap: 14 }}>
                  <div className="avatar-ring">
                    <div style={{
                      width: 44, height: 44, borderRadius: 4,
                      background: 'var(--bg-panel)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, color: 'var(--gold-bright)',
                    }}>
                      {profile.username[0]?.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <strong>{profile.username}</strong>{' '}
                    {['ADMIN', 'OWNER', 'MODERATOR'].includes(profile.role) && '👑'}
                    <div className="muted">{rank.title}</div>
                  </div>
                </div>

                <div className="ornate-divider" />

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <span className="stat-trend up">▲</span>
                    <div className="muted">RATIO</div>
                    <strong style={{ color: 'var(--gold-bright)' }}>{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</strong>
                  </div>
                  <div>
                    <span className="stat-trend up">▲</span>
                    <div className="muted">POINTS</div>
                    <strong style={{ color: 'var(--gold-bright)' }}>{formatNumber(Math.round(profile.bonusPoints))}</strong>
                  </div>
                  <div>
                    <span className="stat-trend up">▲</span>
                    <div className="muted">UPLOAD</div>
                    <strong style={{ color: 'var(--gold-bright)' }}>{formatBytes(profile.uploaded)}</strong>
                  </div>
                  <div>
                    <span className="stat-trend down">▼</span>
                    <div className="muted">TÉLÉCHARGÉ</div>
                    <strong style={{ color: 'var(--gold-bright)' }}>{formatBytes(profile.downloaded)}</strong>
                  </div>
                </div>

                {rank.next && (
                  <>
                    <div className="ornate-divider" />
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="muted">Prochain rang : {rank.next}</span>
                      <span style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>{rank.progressPercent}%</span>
                    </div>
                    <div className="rank-progress">
                      <div className="rank-progress-fill" style={{ width: `${rank.progressPercent}%` }} />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="panel">
              <div className="panel-title">Menu principal</div>
              <div className="sidebar-menu">
                <Link to="/"><span className="icon">🏠</span><span className="label">Tableau de bord</span></Link>
                <Link to="/browse"><span className="icon">📦</span><span className="label">Torrents</span></Link>
                <Link to="/requests"><span className="icon">💬</span><span className="label">Demandes</span></Link>
                <Link to="/forum"><span className="icon">👥</span><span className="label">Forums</span></Link>
                <Link to="/leaderboard"><span className="icon">🏆</span><span className="label">Top 100</span></Link>
                <Link to="/profile"><span className="icon">👤</span><span className="label">Mon profil</span></Link>
                {user && <Link to={`/browse?uploaderId=${user.id}`}><span className="icon">⬆️</span><span className="label">Mes uploads</span></Link>}
                <Link to="/profile">
                  <span className="icon">✉️</span>
                  <span className="label">Invitations</span>
                  {profile && <span className="pill">{profile._count.invitees}</span>}
                </Link>
                <Link to="/rules"><span className="icon">🛡️</span><span className="label">Règles</span></Link>
              </div>
            </div>
          </div>

          <div className="col-center">
            <Outlet context={{ profile, categories } satisfies LayoutContext} />
          </div>

          <div className="grid col-right">
            <div className="panel">
              <div className="panel-title"><span className="title-icon">📯</span>Annonces</div>
              {announcements.length === 0 && <p className="muted">Aucune annonce pour l'instant.</p>}
              {announcements.map((a) => (
                <div key={a.id} style={{ marginBottom: 14 }}>
                  <strong>{a.pinned ? '🔥 ' : ''}{a.title}</strong>
                  <p className="muted" style={{ margin: '4px 0' }}>{a.content}</p>
                  <span className="muted" style={{ fontSize: 11 }}>{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>

            <div className="panel">
              <div className="panel-title"><span className="title-icon">👑</span>Top uploaders</div>
              {topUploaders.map((u, i) => (
                <div key={u.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className={`rank-badge ${i === 0 ? 'gold' : ''}`}>{i + 1}</span>
                    <Link to={`/users/${u.id}`}>{u.username}</Link>
                  </span>
                  <span className="muted">{formatBytes(u.uploaded)}</span>
                </div>
              ))}
              {topUploaders.length === 0 && <p className="muted">Aucun membre pour l'instant.</p>}
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <Link to="/leaderboard"><button className="secondary">Voir le classement</button></Link>
              </div>
            </div>
          </div>
        </div>

        {stats && (
          <div className="footer-stats ornate-frame">
            <div className="item"><div className="icon">👥</div><div className="n">{formatNumber(stats.totalUsers)}</div><div className="l">Utilisateurs</div></div>
            <div className="item"><div className="icon">📦</div><div className="n">{formatNumber(stats.totalTorrents)}</div><div className="l">Torrents</div></div>
            <div className="item"><div className="icon">🌱</div><div className="n">{formatNumber(stats.totalSeeders)}</div><div className="l">Seeders</div></div>
            <div className="item"><div className="icon">📥</div><div className="n">{formatNumber(stats.totalLeechers)}</div><div className="l">Leechers</div></div>
            <div className="item"><div className="icon">🔗</div><div className="n">{formatNumber(stats.totalPeers)}</div><div className="l">Pairs</div></div>
            <div className="item"><div className="icon">📊</div><div className="n">{formatBytes(stats.totalTraffic)}</div><div className="l">Trafic total</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
