import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { FavoriteStar } from '../components/TorrentBits';
import { TYPE_LABEL } from '../lib/entityLabels';
import { useViewMode } from '../lib/viewMode';
import TorrentView, { ViewSwitcher } from '../components/TorrentView';
import Recommended from '../components/Recommended';

export default function Favorites() {
  const [items, setItems] = useState<any[] | null>(null);
  const [follows, setFollows] = useState<any[]>([]);
  const [view, setView] = useViewMode('favorites');

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
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="muted">{items ? `${items.length} torrent${items.length > 1 ? 's' : ''}` : ''}</span>
          <ViewSwitcher value={view} onChange={setView} />
        </div>
        {items === null && <p className="muted">Chargement...</p>}
        {items?.length === 0 && (
          <p className="muted">
            Rien ici pour l'instant. Clique sur l'étoile ☆ à côté d'un torrent (dans <Link to="/browse">Parcourir</Link> ou sur sa fiche) pour le mettre de côté.
          </p>
        )}
        {items && items.length > 0 && (
          <TorrentView
            items={items}
            view={view}
            hideUploader
            leading={(t) => <FavoriteStar active onToggle={() => remove(t.id)} />}
            extraColumns={[{ header: 'Ajouté', render: (t) => (t.favoritedAt ? timeAgo(t.favoritedAt) : '') }]}
          />
        )}
      </div>

      <Recommended title="✨ Dans la même veine que tes favoris" />
    </div>
  );
}
