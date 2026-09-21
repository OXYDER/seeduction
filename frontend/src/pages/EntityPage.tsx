import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { ROLE_LABEL, TYPE_LABEL } from '../lib/entityLabels';

const PAGE_SIZE = 24;

/** Tous les torrents liés à un acteur, un studio, un genre, un artiste, un éditeur... */
export default function EntityPage() {
  const { id } = useParams();
  const [entity, setEntity] = useState<any>(null);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

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
        <div className="muted" style={{ marginBottom: 12 }}>{total} torrent{total > 1 ? 's' : ''}</div>
        <div className="entity-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {items.map((t) => (
            <Link key={t.id} to={`/torrents/${t.id}`} className="entity-card">
              {t.coverImage
                ? <img src={t.coverImage} alt="" style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 4 }} />
                : <div className="entity-initial" style={{ width: '100%', aspectRatio: '2 / 3' }}>{t.name.slice(0, 1).toUpperCase()}</div>}
              <div className="entity-card-name">{t.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {[t.year, t.category?.name, formatBytes(t.size)].filter(Boolean).join(' · ')}
              </div>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: 'var(--success)' }}>{t.seeders} S</span>{' '}
                <span style={{ color: 'var(--danger)' }}>{t.leechers} L</span>
              </div>
            </Link>
          ))}
        </div>
        {items.length === 0 && <p className="muted">Aucun torrent approuvé pour l'instant.</p>}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <span className="muted">Page {page}</span>
          <div className="row">
            <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Préc.</button>
            <button className="secondary" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Suiv. →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
