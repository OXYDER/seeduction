import Pager from '../components/Pager';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ROLE_LABEL, TYPE_LABEL } from '../lib/entityLabels';
import FollowButton from '../components/FollowButton';
import { useViewMode } from '../lib/viewMode';
import TorrentView, { ViewSwitcher } from '../components/TorrentView';
import { useCrumbTitle } from '../store/crumbs';

const PAGE_SIZE = 24;

/** Tous les torrents liés à un acteur, un studio, un genre, un artiste, un éditeur... */
export default function EntityPage() {
  const { id } = useParams();
  const [entity, setEntity] = useState<any>(null);
  useCrumbTitle(entity?.name);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [view, setView] = useViewMode('entity');

  useEffect(() => {
    setRole('');
    setPage(1);
    api.get(`/entities/${id}`).then((r) => setEntity(r.data)).catch(() => setError('Fiche introuvable'));
  }, [id]);

  useEffect(() => {
    api.get('/torrents', { params: { entityId: id, role: role || undefined, page, pageSize: PAGE_SIZE } })
      .then((r) => { setItems(r.data.items); setTotal(r.data.total); })
      .catch(() => {});
  }, [id, role, page]);

  if (error) return <p className="muted">{error}</p>;
  if (!entity) return <p className="muted">Chargement...</p>;

  return (
    <div className="grid">
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        {entity.imageUrl
          ? <img src={entity.imageUrl} alt="" style={{ width: 120, height: 160, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          : <div className="entity-initial" style={{ width: 120, height: 160, fontSize: 40 }}>{entity.name.slice(0, 1).toUpperCase()}</div>}
        <div>
          <div className="muted">{TYPE_LABEL[entity.type] ?? entity.type}</div>
          <h1>{entity.name}</h1>
          <FollowButton entityId={entity.id} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <button className={role === '' ? '' : 'secondary'} onClick={() => { setRole(''); setPage(1); }}>
              Tous ({entity.roles.reduce((n: number, r: any) => n + r.count, 0)})
            </button>
            {entity.roles.map((r: any) => (
              <button key={r.role} className={role === r.role ? '' : 'secondary'} onClick={() => { setRole(r.role); setPage(1); }}>
                {ROLE_LABEL[r.role] ?? r.role} ({r.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="muted">{total} torrent{total > 1 ? 's' : ''}</span>
          <ViewSwitcher value={view} onChange={setView} />
        </div>
        <div style={{ marginBottom: 10 }}><Pager page={page} total={total} pageSize={PAGE_SIZE} unit="torrent" onPage={setPage} /></div>
        <TorrentView items={items} view={view} empty="Aucun torrent approuvé pour l'instant." />
        <div style={{ marginTop: 16 }}><Pager page={page} total={total} pageSize={PAGE_SIZE} unit="torrent" onPage={setPage} scrollTop /></div>
      </div>
    </div>
  );
}
