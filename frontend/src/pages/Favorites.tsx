import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { HealthDot, FavoriteStar } from '../components/TorrentBits';
import { TYPE_LABEL } from '../lib/entityLabels';

export default function Favorites() {
  const [items, setItems] = useState<any[] | null>(null);
  const [follows, setFollows] = useState<any[]>([]);

  useEffect(() => {
    api.get('/favorites').then((r) => setItems(r.data)).catch(() => setItems([]));
    api.get('/social/follows').then((r) => setFollows(r.data)).catch(() => {});
  }, []);

  async function remove(id: string) {
    setItems((prev) => (prev ?? []).filter((t) => t.id !== id));
    await api.delete(`/favorites/${id}`).catch(() => {});
  }

  return (
    <div className="grid">
      <h1>⭐ À télécharger plus tard</h1>
      {follows.length > 0 && (
        <div className="panel">
          <h3>🔔 Mes abonnements</h3>
          <p className="muted">Tu es prévenu à chaque nouveau torrent approuvé qui les concerne.</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {follows.map((f) => (
              <Link key={f.id} to={`/entities/${f.id}`} className="entity-chip" title={TYPE_LABEL[f.type] ?? f.type}>{f.name}</Link>
            ))}
          </div>
        </div>
      )}
      <div className="panel">
        {items === null && <p className="muted">Chargement...</p>}
        {items?.length === 0 && (
          <p className="muted">
            Rien ici pour l'instant. Clique sur l'étoile ☆ à côté d'un torrent (dans <Link to="/browse">Parcourir</Link> ou sur sa fiche) pour le mettre de côté.
          </p>
        )}
        {items && items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th></th><th>Nom</th><th>Catégorie</th><th>Mis de côté</th><th>Taille</th><th>S</th><th>L</th></tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td><FavoriteStar active onToggle={() => remove(t.id)} /></td>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        {t.coverImage && <img src={t.coverImage} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 3 }} />}
                        <Link to={`/torrents/${t.id}`}>{t.name}</Link>
                      </div>
                    </td>
                    <td className="muted">{t.category?.name}</td>
                    <td className="muted">{timeAgo(t.favoritedAt)}</td>
                    <td className="muted">{formatBytes(t.size)}</td>
                    <td style={{ color: 'var(--success)' }}><HealthDot seeders={t.seeders} />{t.seeders}</td>
                    <td style={{ color: 'var(--danger)' }}>{t.leechers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
