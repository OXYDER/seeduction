import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div>
      <nav className="row" style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 20 }}>
          <Link to="/" style={{ fontWeight: 700, color: 'var(--text)' }}>⚡ Mega Tracker</Link>
          <Link to="/browse">Torrents</Link>
          <Link to="/requests">Requests</Link>
          <Link to="/forum">Forum</Link>
          <Link to="/leaderboard">Classement</Link>
          {user && <Link to="/upload">Upload</Link>}
          {(user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'OWNER') && (
            <Link to="/admin">Admin</Link>
          )}
        </div>
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
      </nav>
      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}
