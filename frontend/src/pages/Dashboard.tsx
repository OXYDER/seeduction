import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import { getRankInfo } from '../lib/rank';
import { CATEGORY_STYLE, type LayoutContext } from '../components/Layout';

interface GlobalStats {
  totalUsers: number;
  totalTorrents: number;
  totalSeeders: number;
  totalLeechers: number;
  totalPeers: number;
  totalTraffic: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  author: { username: string };
}

interface TopUploader {
  id: string;
  username: string;
  uploaded: string;
}

export default function Dashboard() {
  const { profile } = useOutletContext<LayoutContext>();
  const user = useAuthStore((s) => s.user);
  const [torrents, setTorrents] = useState<any[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [topUploaders, setTopUploaders] = useState<TopUploader[]>([]);

  useEffect(() => {
    api.get('/torrents', { params: { pageSize: 20 } }).then((r) => {
      const sorted = [...r.data.items].sort((a, b) => b.seeders - a.seeders);
      setTorrents(sorted.slice(0, 5));
    });
    api.get('/stats/global').then((r) => setStats(r.data));
    api.get('/announcements', { params: { limit: 3 } }).then((r) => setAnnouncements(r.data)).catch(() => {});
    api.get('/users/leaderboard', { params: { limit: 5 } }).then((r) => setTopUploaders(r.data));
  }, []);

  const rank = profile ? getRankInfo(profile.uploaded) : null;

  return (
    <div className="grid">
      <div className="hero ornate-frame">
        <div className="hero-top">
          <div className="hero-content">
            <div className="hero-eyebrow">REJOIGNEZ</div>
            <h2>LA LÉGENDE</h2>
            <div className="ornate-divider" style={{ maxWidth: 260 }} />
            <p>Le tracker privé le plus élite jamais créé.</p>
            <Link to={user ? '/browse' : '/register'}>
              <button className="hero-cta">{user ? 'Parcourir les torrents' : 'Devenir légendaire'}</button>
            </Link>
          </div>
          <div className="hero-logo"><img src="/logo-full.png" alt="Seeduction" /></div>
        </div>
        <div className="hero-features">
          <div className="hero-feature"><span className="hero-feature-icon">👥</span><div><strong>Communauté d'élite</strong>Membres triés sur le volet</div></div>
          <div className="hero-feature"><span className="hero-feature-icon">⚡</span><div><strong>Rapide &amp; sécurisé</strong>Haute vitesse &amp; chiffrement</div></div>
          <div className="hero-feature"><span className="hero-feature-icon">🎬</span><div><strong>Contenu exclusif</strong>Ce que les autres n'ont pas</div></div>
          <div className="hero-feature"><span className="hero-feature-icon">🛡️</span><div><strong>Tolérance zéro</strong>Pour leechers &amp; tricheurs</div></div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid">
          {profile && rank && (
            <div className="panel ornate">
              <div className="row" style={{ gap: 14 }}>
                <div className="avatar-ring">
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
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
              {user && <Link to="/profile"><span className="icon">👤</span><span className="label">Mon profil</span></Link>}
              {user && <Link to={`/browse?uploaderId=${user.id}`}><span className="icon">⬆️</span><span className="label">Mes uploads</span></Link>}
              {user && (
                <Link to="/profile">
                  <span className="icon">✉️</span>
                  <span className="label">Invitations</span>
                  {profile && <span className="pill">{profile._count.invitees}</span>}
                </Link>
              )}
              <Link to="/rules"><span className="icon">🛡️</span><span className="label">Règles</span></Link>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title"><span className="title-icon">🏆</span>Torrents en vedette</div>
          <table>
            <thead>
              <tr><th>Nom</th><th>Catégorie</th><th>Taille</th><th>Ajouté</th><th>Seed</th><th>Leech</th></tr>
            </thead>
            <tbody>
              {torrents.map((t) => {
                const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
                return (
                <tr key={t.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="category-swatch" style={{ background: `${(catStyle?.color ?? '#e0b84a')}26` }}>
                        {catStyle?.icon ?? '📦'}
                      </span>
                      <span>
                        <Link to={`/torrents/${t.id}`}>{t.name}</Link>{' '}
                        {timeAgo(t.createdAt) === "à l'instant" && <span className="badge new">NEW</span>}{' '}
                        {t.freeleech && <span className="badge freeleech">FREELEECH</span>}
                      </span>
                    </div>
                  </td>
                  <td className="muted">{t.category?.name}</td>
                  <td className="muted">{formatBytes(t.size)}</td>
                  <td className="muted">{timeAgo(t.createdAt)}</td>
                  <td style={{ color: 'var(--success)' }}>{t.seeders}</td>
                  <td style={{ color: 'var(--danger)' }}>{t.leechers}</td>
                </tr>
                );
              })}
              {torrents.length === 0 && (
                <tr><td colSpan={6} className="muted">Aucun torrent pour l'instant.</td></tr>
              )}
            </tbody>
          </table>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <Link to="/browse"><button className="secondary">Voir tous les torrents</button></Link>
          </div>
        </div>

        <div className="grid">
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
  );
}
