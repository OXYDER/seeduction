import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useQueue } from '../store/queue';
import PendingTorrentCard, { type PendingTorrent } from './PendingTorrentCard';

/**
 * Bandeau « À modérer » de l'accueil, visible du staff seulement et seulement s'il y a quelque chose à traiter :
 * le plus ancien torrent en attente, avec toutes ses informations et approuvable d'un clic, un lien « Voir tout » avec le nombre en attente, et le nombre de signalements ouverts.
 */
export default function ModerationRail() {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const { pendingTorrents, openReports, refresh } = useQueue();
  const [items, setItems] = useState<PendingTorrent[]>([]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    await refresh();
    api.get('/admin/queue/torrents').then((r) => setItems((r.data as PendingTorrent[]).slice(0, 1))).catch(() => {});
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
          {openReports > 0 && <Link to="/moderation" state={{ tab: 'reports' }} className="mod-pill hot">{openReports} signalement{openReports > 1 ? 's' : ''}</Link>}
          {pendingTorrents > 0 && <Link to="/moderation" className="mod-pill hot">Voir tout ({pendingTorrents} en attente) →</Link>}
          {pendingTorrents === 0 && <Link to="/moderation" className="mod-pill">Tout ouvrir →</Link>}
        </div>
      </div>
      {items.map((t) => (
        <div key={t.id} className="mod-rail-card">
          <PendingTorrentCard
            t={t} compact busy={busy === t.id} rejecting={rejecting === t.id}
            onApprove={() => act(t.id, 'approve')} onToggleReject={() => setRejecting(rejecting === t.id ? null : t.id)} onReject={(reason) => act(t.id, 'reject', reason)}
          />
          {pendingTorrents > 1 && <div className="mod-rail-more"><Link to="/moderation">+ {pendingTorrents - 1} autre{pendingTorrents - 1 > 1 ? 's' : ''} torrent{pendingTorrents - 1 > 1 ? 's' : ''} en attente →</Link></div>}
        </div>
      ))}
    </section>
  );
}
