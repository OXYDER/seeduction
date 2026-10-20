import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import UserLink from './UserLink';
import Loading from './Loading';
import { FixActions, FixDiff, type FixRow } from './TorrentFixes';

/** Modération > Corrections : ce que les membres proposent de corriger sur les torrents, à appliquer ou refuser en un clic. */
export default function FixesQueue() {
  const [rows, setRows] = useState<FixRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api.get('/admin/torrent-fixes').then((r) => setRows(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible')); }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucune correction en attente. Les propositions des membres arrivent ici.</p></div>;
  return (
    <div className="grid">
      {rows.map((f) => (
        <div key={f.id} className="panel" style={{ display: 'grid', gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>{f.torrent ? <Link to={'/torrents/' + f.torrent.id} style={{ fontWeight: 700 }}>{f.torrent.name}</Link> : <em>(torrent supprimé)</em>}{f.torrent?.category && <span className="muted"> · {f.torrent.category}</span>}</div>
            <span className="muted" style={{ fontSize: 13 }}>{f.author ? <UserLink user={f.author} /> : 'Membre'} · {timeAgo(f.createdAt)}</span>
          </div>
          <FixDiff fix={f} />
          {f.note && <div className="muted" style={{ fontStyle: 'italic' }}>« {f.note} »</div>}
          <FixActions fix={f} onDone={load} />
        </div>
      ))}
    </div>
  );
}
