import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useQueue } from '../store/queue';
import { timeAgo } from '../lib/time';
import RejectReason from './RejectReason';

interface Report { id: string; reason: string; createdAt: string; reporter: { username: string } | null }

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Approuvé', REJECTED: 'Rejeté', DEAD: 'Mort' };

/**
 * Barre de modération en haut de chaque fiche torrent (staff seulement) : statut actuel et les actions qui ont du sens pour
 * ce statut, un clic chacune — approuver / rejeter, retirer, marquer mort, freeleech, double upload, modifier — plus les
 * signalements ouverts avec de quoi les clore. La suppression et l'édition complète sont dans le panneau plus bas.
 */
export default function StaffQueueBanner({ torrent, onPatch, onEdit }: {
  torrent: { id: string; status: string; freeleech?: boolean; doubleUpload?: boolean };
  onPatch: (patch: Record<string, any>) => void;
  onEdit: () => void;
}) {
  const refreshQueue = useQueue((s) => s.refresh);
  const [reports, setReports] = useState<Report[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const loadReports = useCallback(() => {
    api.get('/admin/reports', { params: { targetType: 'torrent', targetId: torrent.id } }).then((r) => setReports(r.data)).catch(() => {});
  }, [torrent.id]);
  useEffect(() => { loadReports(); }, [loadReports]);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true); setError(''); setFlash('');
    try { await action(); setFlash(done); setTimeout(() => setFlash(''), 3000); void refreshQueue(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(false); }
  }

  const approve = () => run(async () => { await api.post(`/admin/torrents/${torrent.id}/approve`); onPatch({ status: 'APPROVED' }); },
    torrent.status === 'PENDING' ? '✓ Torrent approuvé' : '✓ Torrent de nouveau approuvé');
  const reject = (reason: string) => run(async () => { await api.post(`/admin/torrents/${torrent.id}/reject`, { reason }); onPatch({ status: 'REJECTED' }); setRejecting(false); },
    '✕ Torrent rejeté : il n\'est plus visible des membres');
  const markDead = () => {
    if (!window.confirm('Marquer ce torrent comme mort ? Il reste visible mais signalé comme sans seeder.')) return;
    void run(async () => { await api.patch(`/admin/torrents/${torrent.id}`, { status: 'DEAD' }); onPatch({ status: 'DEAD' }); }, '☠️ Torrent marqué mort');
  };
  const toggle = (key: 'freeleech' | 'doubleUpload', label: string) => run(async () => {
    const next = !torrent[key];
    await api.patch(`/admin/torrents/${torrent.id}`, { [key]: next });
    onPatch({ [key]: next });
  }, `✓ ${label} ${torrent[key] ? 'retiré' : 'activé'}`);

  async function closeReport(id: string, status: 'RESOLVED' | 'DISMISSED') {
    try { await api.post(`/admin/reports/${id}/resolve`, { status }); setReports((l) => l.filter((r) => r.id !== id)); void refreshQueue(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  const status = torrent.status;
  return (
    <div className={`panel staff-banner${status === 'PENDING' || reports.length > 0 ? ' attention' : ''}`} role="region" aria-label="Modération de ce torrent">
      <div className="staff-banner-row">
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <strong>🛡️ Modération</strong>
          <span className={`staff-status ${status}`}>{STATUS_LABEL[status] ?? status}</span>
        </span>
        <span className="staff-banner-actions">
          {(status === 'PENDING' || status === 'REJECTED' || status === 'DEAD') && <button type="button" disabled={busy} onClick={approve}>{status === 'PENDING' ? '✓ Approuver' : '✓ Réapprouver'}</button>}
          {(status === 'PENDING' || status === 'APPROVED' || status === 'DEAD') && <button type="button" className="danger" disabled={busy} onClick={() => setRejecting((v) => !v)}>{status === 'PENDING' ? '✕ Rejeter' : '✕ Retirer'}</button>}
          {status === 'APPROVED' && <button type="button" className="secondary" disabled={busy} onClick={markDead}>☠️ Marquer mort</button>}
          <button type="button" className={`secondary${torrent.freeleech ? ' on' : ''}`} disabled={busy} aria-pressed={!!torrent.freeleech} onClick={() => toggle('freeleech', 'Freeleech')}>🆓 Freeleech</button>
          <button type="button" className={`secondary${torrent.doubleUpload ? ' on' : ''}`} disabled={busy} aria-pressed={!!torrent.doubleUpload} onClick={() => toggle('doubleUpload', 'Double upload')}>⏫ Double upload</button>
          <button type="button" className="secondary" onClick={onEdit}>✏️ Modifier</button>
        </span>
      </div>
      {rejecting && <RejectReason busy={busy} onCancel={() => setRejecting(false)} onConfirm={reject} />}
      {flash && <div className="mod-flash" role="status">{flash}</div>}
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
