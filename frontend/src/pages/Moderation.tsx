import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useQueue } from '../store/queue';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import RejectReason from '../components/RejectReason';

interface PendingTorrent {
  id: string; name: string; size: number; coverImage: string | null; createdAt: string; year: number | null; resolution: string | null;
  excerpt: string; fileCount: number; anonymousUpload: boolean; openReports: number;
  category: { name: string } | null;
  uploader: { id: string; username: string; uploaded: string; downloaded: string; createdAt: string };
}

interface ReportRow {
  id: string; targetType: string; targetId: string; reason: string; createdAt: string; label: string; link: string | null;
  reporter: { id: string; username: string } | null;
  torrent: { id: string; name: string; coverImage: string | null; status: string; seeders: number } | null;
}

const TYPE_LABEL: Record<string, string> = { torrent: 'Torrent', user: 'Membre', forumPost: 'Forum', comment: 'Commentaire' };
const isOld = (iso: string) => Date.now() - new Date(iso).getTime() > 24 * 3600_000;

/** La file de modération du staff : torrents à valider et signalements, avec les actions à portée de clic. */
export default function Moderation() {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = ['MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const refreshQueue = useQueue((s) => s.refresh);
  const location = useLocation();
  const [tab, setTab] = useState<'torrents' | 'reports'>((location.state as any)?.tab === 'reports' ? 'reports' : 'torrents');
  const [pending, setPending] = useState<PendingTorrent[] | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api.get('/admin/queue/torrents'), api.get('/admin/reports')]);
      setPending(p.data);
      setReports(r.data);
      setSelected((s) => new Set([...s].filter((id) => (p.data as PendingTorrent[]).some((t) => t.id === id))));
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Chargement impossible');
    }
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => { if (isStaff) void load(); }, [isStaff, load]);
  // La file bouge pendant qu'on travaille : rafraîchie toutes les 45 s tant que la page est ouverte.
  useEffect(() => {
    if (!isStaff) return;
    const t = setInterval(() => { if (!document.hidden) void load(); }, 45_000);
    return () => clearInterval(t);
  }, [isStaff, load]);

  function say(text: string) { setFlash(text); setTimeout(() => setFlash(''), 3500); }

  async function approve(t: PendingTorrent) {
    setBusy(t.id); setError('');
    try { await api.post(`/admin/torrents/${t.id}/approve`); setPending((l) => l?.filter((x) => x.id !== t.id) ?? l); say(`✓ « ${t.name} » approuvé`); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(null); void refreshQueue(); }
  }

  async function reject(t: PendingTorrent, reason: string) {
    setBusy(t.id); setError('');
    try { await api.post(`/admin/torrents/${t.id}/reject`, { reason }); setPending((l) => l?.filter((x) => x.id !== t.id) ?? l); setRejecting(null); say(`✕ « ${t.name} » rejeté`); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(null); void refreshQueue(); }
  }

  async function approveSelected() {
    if (selected.size === 0) return;
    setBusy('bulk'); setError('');
    try {
      const { data } = await api.post('/admin/torrents/approve-many', { ids: [...selected] });
      say(`✓ ${data.approved} torrent${data.approved > 1 ? 's' : ''} approuvé${data.approved > 1 ? 's' : ''}`);
      setSelected(new Set());
      await load();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(null); }
  }

  async function resolveReport(r: ReportRow, status: 'RESOLVED' | 'DISMISSED') {
    setBusy(r.id); setError('');
    try { await api.post(`/admin/reports/${r.id}/resolve`, { status }); setReports((l) => l?.filter((x) => x.id !== r.id) ?? l); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(null); void refreshQueue(); }
  }

  /** Retire le torrent signalé (rejeté : il n'est plus visible) puis clôt ce signalement. */
  async function removeReported(r: ReportRow, reason: string) {
    if (!r.torrent) return;
    setBusy(r.id); setError('');
    try {
      await api.post(`/admin/torrents/${r.torrent.id}/reject`, { reason });
      await api.post(`/admin/reports/${r.id}/resolve`, { status: 'RESOLVED' });
      setReports((l) => l?.filter((x) => x.id !== r.id) ?? l);
      setRejecting(null);
      say(`✕ « ${r.torrent.name} » retiré`);
    } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(null); void refreshQueue(); }
  }

  const shownReports = useMemo(() => (reports ?? []).filter((r) => typeFilter === 'all' || r.targetType === typeFilter), [reports, typeFilter]);
  const allSelected = !!pending?.length && pending.every((t) => selected.has(t.id));

  if (!isStaff) return <div className="panel"><p className="muted">Cette page est réservée à l'équipe de modération.</p></div>;

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🛡️ Modération</h1>
        <button type="button" className="secondary" onClick={() => void load()}>↻ Actualiser</button>
      </div>

      <div className="mod-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'torrents'} className={tab === 'torrents' ? 'on' : ''} onClick={() => setTab('torrents')}>
          Torrents à valider {pending ? <span className={`mod-count${pending.length ? ' hot' : ''}`}>{pending.length}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>
          Signalements {reports ? <span className={`mod-count${reports.length ? ' hot' : ''}`}>{reports.length}</span> : null}
        </button>
      </div>

      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
      {flash && <div className="mod-flash" role="status">{flash}</div>}

      {tab === 'torrents' && (
        <>
          {pending === null ? <p className="muted">Chargement…</p> : pending.length === 0 ? (
            <div className="panel mod-empty"><div style={{ fontSize: 34 }}>🎉</div><strong>Rien à valider</strong><span className="muted">Tous les torrents envoyés ont été traités.</span></div>
          ) : (
            <>
              <div className="mod-bulk">
                <label><input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((t) => t.id)) : new Set())} /> Tout sélectionner</label>
                <button type="button" disabled={selected.size === 0 || busy === 'bulk'} onClick={approveSelected}>✓ Approuver la sélection ({selected.size})</button>
              </div>
              <div className="mod-list">
                {pending.map((t) => (
                  <article key={t.id} className={`mod-card${isOld(t.createdAt) ? ' old' : ''}`}>
                    <label className="mod-check"><input type="checkbox" checked={selected.has(t.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} aria-label={`Sélectionner ${t.name}`} /></label>
                    <Link to={`/torrents/${t.id}`} className="mod-cover" title="Ouvrir la fiche">
                      {t.coverImage ? <img src={t.coverImage} alt="" loading="lazy" /> : <span>🎬</span>}
                    </Link>
                    <div className="mod-body">
                      <Link to={`/torrents/${t.id}`} className="mod-title">{t.name}</Link>
                      <div className="mod-meta">
                        {[t.category?.name, t.year, t.resolution, formatBytes(t.size), t.fileCount ? `${t.fileCount} fichier${t.fileCount > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mod-meta">
                        Envoyé par <Link to={`/users/${t.uploader.id}`}>{t.uploader.username}</Link>{t.anonymousUpload ? ' (anonyme)' : ''} · <span className={isOld(t.createdAt) ? 'mod-late' : ''}>{timeAgo(t.createdAt)}</span>
                        {t.openReports > 0 && <span className="badge double" style={{ marginLeft: 8 }}>⚠ {t.openReports} signalement{t.openReports > 1 ? 's' : ''}</span>}
                      </div>
                      {t.excerpt && <p className="mod-excerpt">{t.excerpt}</p>}
                      {rejecting === t.id && <RejectReason busy={busy === t.id} onCancel={() => setRejecting(null)} onConfirm={(reason) => reject(t, reason)} />}
                    </div>
                    <div className="mod-actions">
                      <button type="button" disabled={busy === t.id} onClick={() => approve(t)}>✓ Approuver</button>
                      <button type="button" className="danger" disabled={busy === t.id} onClick={() => setRejecting(rejecting === t.id ? null : t.id)}>✕ Rejeter</button>
                      <Link to={`/torrents/${t.id}?edit=1`} className="mod-link">✏️ Modifier</Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'reports' && (
        <>
          {reports === null ? <p className="muted">Chargement…</p> : reports.length === 0 ? (
            <div className="panel mod-empty"><div style={{ fontSize: 34 }}>✅</div><strong>Aucun signalement ouvert</strong><span className="muted">La communauté est calme.</span></div>
          ) : (
            <>
              <div className="mod-filters">
                {['all', 'torrent', 'comment', 'forumPost', 'user'].map((k) => {
                  const n = k === 'all' ? reports.length : reports.filter((r) => r.targetType === k).length;
                  if (k !== 'all' && n === 0) return null;
                  return <button key={k} type="button" className={`secondary${typeFilter === k ? ' on' : ''}`} onClick={() => setTypeFilter(k)}>{k === 'all' ? 'Tous' : TYPE_LABEL[k]} ({n})</button>;
                })}
              </div>
              <div className="mod-list">
                {shownReports.map((r) => (
                  <article key={r.id} className={`mod-card${isOld(r.createdAt) ? ' old' : ''}`}>
                    {r.torrent ? (
                      <Link to={`/torrents/${r.torrent.id}`} className="mod-cover small" title="Ouvrir la fiche">
                        {r.torrent.coverImage ? <img src={r.torrent.coverImage} alt="" loading="lazy" /> : <span>🎬</span>}
                      </Link>
                    ) : <div className="mod-cover small plain"><span>{r.targetType === 'user' ? '👤' : '💬'}</span></div>}
                    <div className="mod-body">
                      <div>
                        <span className="badge double">{TYPE_LABEL[r.targetType] ?? r.targetType}</span>{' '}
                        {r.link ? <Link to={r.link} className="mod-title">{r.label}</Link> : <span className="mod-title">{r.label}</span>}
                        {r.torrent && r.torrent.status !== 'APPROVED' && <span className="muted"> · {r.torrent.status === 'PENDING' ? 'en attente' : r.torrent.status === 'REJECTED' ? 'déjà rejeté' : r.torrent.status}</span>}
                      </div>
                      <p className="mod-excerpt">« {r.reason} »</p>
                      <div className="mod-meta">Signalé par {r.reporter ? <Link to={`/users/${r.reporter.id}`}>{r.reporter.username}</Link> : '?'} · <span className={isOld(r.createdAt) ? 'mod-late' : ''}>{timeAgo(r.createdAt)}</span></div>
                      {rejecting === r.id && <RejectReason busy={busy === r.id} onCancel={() => setRejecting(null)} onConfirm={(reason) => removeReported(r, reason)} />}
                    </div>
                    <div className="mod-actions">
                      {r.link && <Link to={r.link} className="mod-link">👁 Voir</Link>}
                      <button type="button" disabled={busy === r.id} onClick={() => resolveReport(r, 'RESOLVED')}>✓ Résolu</button>
                      <button type="button" className="secondary" disabled={busy === r.id} onClick={() => resolveReport(r, 'DISMISSED')}>Ignorer</button>
                      {r.torrent && r.torrent.status !== 'REJECTED' && <button type="button" className="danger" disabled={busy === r.id} onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>Retirer le torrent</button>}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
