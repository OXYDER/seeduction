import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useQueue } from '../store/queue';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import RejectReason from './RejectReason';

/**
 * Bandeau « À modérer » de l'accueil, visible du staff seulement et seulement s'il y a quelque chose à traiter :
 * les plus anciens torrents en attente (approuvables d'un clic) et le nombre de signalements ouverts.
 */
export default function ModerationRail() {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const { pendingTorrents, openReports, refresh } = useQueue();
  const [items, setItems] = useState<any[]>([]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    await refresh();
    api.get('/admin/queue/torrents').then((r) => setItems((r.data as any[]).slice(0, 4))).catch(() => {});
  }, [refresh]);

  useEffect(() => { if (isStaff) void load(); }, [isStaff, load]);

  async function act(id: string, kind: 'approve' | 'reject', reason?: string) {
    setBusy(id);
    try {
      await api.post(`/admin/torrents/${id}/${kind}`, kind === 'reject' ? { reason } : undefined);
      setRejecting(null);
      await load();
    } finally { setBusy(null); }
  }

  if (!isStaff || pendingTorrents + openReports === 0) return null;

  return (
    <section className="panel mod-rail" aria-label="À modérer">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>🛡️ À modérer</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {pendingTorrents > 0 && <Link to="/moderation" className="mod-pill hot">{pendingTorrents} torrent{pendingTorrents > 1 ? 's' : ''} en attente</Link>}
          {openReports > 0 && <Link to="/moderation" state={{ tab: 'reports' }} className="mod-pill hot">{openReports} signalement{openReports > 1 ? 's' : ''}</Link>}
          <Link to="/moderation" className="mod-pill">Tout ouvrir →</Link>
        </div>
      </div>
      {items.length > 0 && (
        <div className="mod-rail-list">
          {items.map((t) => (
            <div key={t.id} className="mod-rail-item">
              <Link to={`/torrents/${t.id}`} className="mod-cover tiny" title="Ouvrir la fiche">{t.coverImage ? <img src={t.coverImage} alt="" loading="lazy" /> : <span>🎬</span>}</Link>
              <div className="mod-rail-text">
                <Link to={`/torrents/${t.id}`} className="mod-title">{t.name}</Link>
                <span className="mod-meta">{t.uploader.username} · {formatBytes(t.size)} · {timeAgo(t.createdAt)}</span>
                {rejecting === t.id && <RejectReason busy={busy === t.id} onCancel={() => setRejecting(null)} onConfirm={(reason) => act(t.id, 'reject', reason)} />}
              </div>
              <div className="mod-rail-actions">
                <button type="button" disabled={busy === t.id} onClick={() => act(t.id, 'approve')} title="Approuver">✓</button>
                <button type="button" className="danger" disabled={busy === t.id} onClick={() => setRejecting(rejecting === t.id ? null : t.id)} title="Rejeter">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
