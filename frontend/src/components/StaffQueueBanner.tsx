import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useQueue } from '../store/queue';
import { timeAgo } from '../lib/time';
import RejectReason from './RejectReason';

interface Report { id: string; reason: string; createdAt: string; reporter: { username: string } | null }

/**
 * Bandeau en haut d'une fiche torrent, pour le staff : le torrent attend sa validation et/ou il a des signalements ouverts,
 * avec les boutons pour trancher sans quitter la fiche.
 */
export default function StaffQueueBanner({ torrent, onStatusChange }: { torrent: { id: string; status: string }; onStatusChange: (status: string) => void }) {
  const refreshQueue = useQueue((s) => s.refresh);
  const [reports, setReports] = useState<Report[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadReports = useCallback(() => {
    api.get('/admin/reports', { params: { targetType: 'torrent', targetId: torrent.id } }).then((r) => setReports(r.data)).catch(() => {});
  }, [torrent.id]);
  useEffect(() => { loadReports(); }, [loadReports]);

  if (torrent.status !== 'PENDING' && reports.length === 0) return null;

  async function decide(kind: 'approve' | 'reject', reason?: string) {
    setBusy(true); setError('');
    try {
      await api.post(`/admin/torrents/${torrent.id}/${kind}`, kind === 'reject' ? { reason } : undefined);
      onStatusChange(kind === 'approve' ? 'APPROVED' : 'REJECTED');
      setRejecting(false);
      void refreshQueue();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(false); }
  }

  async function closeReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    try { await api.post(`/admin/reports/${id}/resolve`, { status }); setReports((l) => l.filter((r) => r.id !== id)); void refreshQueue(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  return (
    <div className="panel staff-banner" role="region" aria-label="Modération de ce torrent">
      {torrent.status === 'PENDING' && (
        <div className="staff-banner-row">
          <strong>🛡️ En attente de validation</strong>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => decide('approve')}>✓ Approuver</button>
            <button type="button" className="danger" disabled={busy} onClick={() => setRejecting((v) => !v)}>✕ Rejeter</button>
          </span>
        </div>
      )}
      {rejecting && <RejectReason busy={busy} onCancel={() => setRejecting(false)} onConfirm={(reason) => decide('reject', reason)} />}
      {reports.length > 0 && (
        <div className="staff-banner-reports">
          <strong>⚠ {reports.length} signalement{reports.length > 1 ? 's' : ''} ouvert{reports.length > 1 ? 's' : ''}</strong>
          {reports.map((r) => (
            <div key={r.id} className="staff-banner-row">
              <span>« {r.reason} » <span className="muted">— {r.reporter?.username ?? '?'}, {timeAgo(r.createdAt)}</span></span>
              <span className="row" style={{ gap: 6 }}>
                <button type="button" onClick={() => closeReport(r.id, 'RESOLVED')}>Résolu</button>
                <button type="button" className="secondary" onClick={() => closeReport(r.id, 'DISMISSED')}>Ignorer</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}
