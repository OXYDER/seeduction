import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { CATEGORY_STYLE, type LayoutContext } from '../components/Layout';

export default function Dashboard() {
  useOutletContext<LayoutContext>();
  const user = useAuthStore((s) => s.user);
  const [torrents, setTorrents] = useState<any[]>([]);

  useEffect(() => {
    api.get('/torrents', { params: { pageSize: 20 } }).then((r) => {
      const sorted = [...r.data.items].sort((a, b) => b.seeders - a.seeders);
      setTorrents(sorted.slice(0, 5));
    });
  }, []);

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
    </div>
  );
}
