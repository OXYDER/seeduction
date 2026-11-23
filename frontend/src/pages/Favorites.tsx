import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { FavoriteStar } from '../components/TorrentBits';
import { TYPE_LABEL } from '../lib/entityLabels';
import { useViewMode } from '../lib/viewMode';
import TorrentView, { ViewSwitcher } from '../components/TorrentView';
import Recommended from '../components/Recommended';
import Loading from '../components/Loading';
import { ClientLots } from '../components/InfiniteList';
import EmptyState from '../components/EmptyState';

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
        {items === null && <Loading />}
        {items?.length === 0 && (
          <EmptyState icon="⭐" title="Rien de côté pour l'instant" action={<Link to="/browse" className="icon-btn">Parcourir le catalogue →</Link>}>
            Clique sur l'étoile ☆ à côté d'un torrent (dans le catalogue ou sur sa fiche) pour le mettre de côté et le retrouver ici.
          </EmptyState>
        )}
        {items && items.length > 0 && (
          <ClientLots items={items}>
            {(shown) => (
              <TorrentView
                items={shown}
                view={view}
                hideUploader
                leading={(t) => <FavoriteStar active onToggle={() => remove(t.id)} />}
                extraColumns={[{ header: 'Ajouté', render: (t) => (t.favoritedAt ? timeAgo(t.favoritedAt) : '') }]}
              />
            )}
          </ClientLots>
        )}
      </div>

      <Recommended title="✨ Dans la même veine que tes favoris" />
    </div>
  );
}
