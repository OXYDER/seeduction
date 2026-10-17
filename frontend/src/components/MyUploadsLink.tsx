import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

/** Lien vers « Mes envois » sur la page Envoyer, avec ce qui attend le membre : corrections demandées, torrents en attente de validation. */
export default function MyUploadsLink() {
  const [n, setN] = useState<{ hold: number; rejected: number; pending: number; total: number } | null>(null);
  useEffect(() => {
    api.get('/my-torrents').then((r) => {
      const rows = r.data as { status: string; hold: unknown }[];
      setN({ hold: rows.filter((x) => x.status === 'PENDING' && x.hold).length, rejected: rows.filter((x) => x.status === 'REJECTED').length, pending: rows.filter((x) => x.status === 'PENDING' && !x.hold).length, total: rows.length });
    }).catch(() => undefined);
  }, []);
  if (n && n.total === 0) return null;
  const todo = (n?.hold ?? 0) + (n?.rejected ?? 0);
  return (
    <Link to="/mes-envois" className={`panel myup-link${todo > 0 ? ' attention' : ''}`}>
      <span style={{ fontSize: 26 }}>📦</span>
      <div style={{ flex: 1 }}>
        <strong>Mes envois</strong>
        <div className="muted" style={{ fontSize: 13 }}>
          {n === null ? 'Tes torrents envoyés, leur état et les corrections demandées.'
            : todo > 0 ? `⚠ ${todo} torrent${todo > 1 ? 's' : ''} à corriger` + (n.pending > 0 ? ` · ${n.pending} en attente de validation` : '')
            : n.pending > 0 ? `${n.pending} torrent${n.pending > 1 ? 's' : ''} en attente de validation : tu peux encore les modifier`
            : 'Tous tes torrents sont traités.'}
        </div>
      </div>
      <span className="muted">Voir et modifier →</span>
    </Link>
  );
}
