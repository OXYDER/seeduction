import UserLink from '../components/UserLink';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useQueue } from '../store/queue';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import RejectReason from '../components/RejectReason';
import PendingTorrentCard, { type PendingTorrent } from '../components/PendingTorrentCard';
import { SupportQueue, SupportStats } from '../components/AdminSupport';
import ChatBansPanel from '../components/ChatBansPanel';
import { useSupport } from '../store/support';
import Loading from '../components/Loading';
import FixesQueue from '../components/FixesQueue';

interface ReportRow {
  id: string; targetType: string; targetId: string; reason: string; createdAt: string; label: string; link: string | null;
  reporter: { id: string; username: string } | null;
  torrent: { id: string; name: string; coverImage: string | null; status: string; seeders: number } | null;
}

const TYPE_LABEL: Record<string, string> = { torrent: 'Torrent', user: 'Membre', forumPost: 'Forum', comment: 'Commentaire', chatMessage: 'Chat' };
const isOld = (iso: string) => Date.now() - new Date(iso).getTime() > 24 * 3600_000;

/** La file de modération du staff : torrents à valider et signalements, avec les actions à portée de clic. */
export default function Moderation() {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const refreshQueue = useQueue((s) => s.refresh);
  const pendingFixes = useQueue((s) => s.pendingFixes);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  type Tab = 'torrents' | 'reports' | 'fixes' | 'billets' | 'support-stats' | 'chat-bans';
  const fromUrl = params.get('tab');
  const tab: Tab = fromUrl === 'billets' || fromUrl === 'support-stats' || fromUrl === 'chat-bans' || fromUrl === 'reports' || fromUrl === 'fixes' || fromUrl === 'torrents' ? fromUrl : (location.state as any)?.tab === 'reports' ? 'reports' : 'torrents';
  const setTab = (t: Tab) => { const next = new URLSearchParams(params); if (t === 'torrents') next.delete('tab'); else next.set('tab', t); setParams(next, { replace: true }); };
  const openTickets = useSupport((s) => s.staff);
  const refreshSupport = useSupport((s) => s.refreshBadge);
  useEffect(() => { void refreshSupport(); }, [refreshSupport]);
  const [pending, setPending] = useState<PendingTorrent[] | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [holding, setHolding] = useState<string | null>(null);
  const [queueView, setQueueView] = useState<'todo' | 'hold'>('todo');

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

  /** Met un torrent en suspens et demande une correction au membre : il sort de la file à examiner jusqu'à ce que le membre le renvoie. */
  async function hold(t: PendingTorrent, data: { reasons: string[]; note: string }) {
    setBusy(t.id); setError('');
    try {
      await api.post(`/admin/torrents/${t.id}/hold`, data);
      setPending((l) => l?.map((x) => (x.id === t.id ? { ...x, hold: { at: new Date().toISOString(), reasons: data.reasons, note: data.note || null, by: null }, resubmitted: null } : x)) ?? l);
      setHolding(null);
      say(`⏸ « ${t.name} » mis en suspens : le membre est prévenu`);
    } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
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
  // À examiner : les torrents corrigés par leur membre passent en premier ; « en attente de correction » : ceux qu'on a mis en suspens.
  const todo = useMemo(() => (pending ?? []).filter((t) => !t.hold).sort((a, b) => Number(!!b.resubmitted) - Number(!!a.resubmitted)), [pending]);
  const onHold = useMemo(() => (pending ?? []).filter((t) => !!t.hold), [pending]);
  const listed = queueView === 'hold' ? onHold : todo;
  const allSelected = listed.length > 0 && listed.every((t) => selected.has(t.id));

  if (!isStaff) return <div className="panel"><p className="muted">Cette page est réservée à l'équipe de modération.</p></div>;

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🛡️ Modération</h1>
        <button type="button" className="secondary" onClick={() => void load()}>↻ Actualiser</button>
      </div>

      <div className="mod-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'torrents'} className={tab === 'torrents' ? 'on' : ''} onClick={() => setTab('torrents')}>
          Torrents à valider {pending ? <span className={`mod-count${todo.length ? ' hot' : ''}`}>{todo.length}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>
          Signalements {reports ? <span className={`mod-count${reports.length ? ' hot' : ''}`}>{reports.length}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'fixes'} className={tab === 'fixes' ? 'on' : ''} onClick={() => setTab('fixes')}>
          ✏️ Corrections proposées <span className={'mod-count' + (pendingFixes ? ' hot' : '')}>{pendingFixes}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'billets'} className={tab === 'billets' ? 'on' : ''} onClick={() => setTab('billets')}>
          🎫 Billets de support {openTickets !== null ? <span className={`mod-count${openTickets ? ' hot' : ''}`}>{openTickets}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'support-stats'} className={tab === 'support-stats' ? 'on' : ''} onClick={() => setTab('support-stats')}>
          📊 Statistiques du support
        </button>
        <button type="button" role="tab" aria-selected={tab === 'chat-bans'} className={tab === 'chat-bans' ? 'on' : ''} onClick={() => setTab('chat-bans')}>
          🚫 Bannis du chat
        </button>
      </div>

      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
      {flash && <div className="mod-flash" role="status">{flash}</div>}

      {tab === 'billets' && <SupportQueue />}
      {tab === 'support-stats' && <SupportStats />}
      {tab === 'chat-bans' && <ChatBansPanel />}

      {tab === 'torrents' && (
        <>
          {pending === null ? <Loading /> : pending.length === 0 ? (
            <div className="panel mod-empty"><div style={{ fontSize: 34 }}>🎉</div><strong>Rien à valider</strong><span className="muted">Tous les torrents envoyés ont été traités.</span></div>
          ) : (
            <>
              <div className="mod-filters">
                <button type="button" className={`secondary${queueView === 'todo' ? ' on' : ''}`} onClick={() => setQueueView('todo')}>À examiner ({todo.length})</button>
                <button type="button" className={`secondary${queueView === 'hold' ? ' on' : ''}`} onClick={() => setQueueView('hold')}>⏸ En attente de correction ({onHold.length})</button>
              </div>
              {listed.length === 0 && <div className="panel mod-empty"><strong>{queueView === 'hold' ? 'Aucun torrent en attente de correction' : 'Rien à examiner'}</strong><span className="muted">{queueView === 'hold' ? 'Ceux que tu mets en suspens apparaissent ici jusqu\'à ce que le membre les renvoie.' : 'Les torrents en suspens sont dans l\'autre onglet.'}</span></div>}
              <div className="mod-bulk">
                <label><input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(listed.map((t) => t.id)) : new Set())} /> Tout sélectionner</label>
                <button type="button" disabled={selected.size === 0 || busy === 'bulk'} onClick={approveSelected}>✓ Approuver la sélection ({selected.size})</button>
              </div>
              <div className="mod-list">
                {listed.map((t) => (
                  <PendingTorrentCard
                    key={t.id} t={t} busy={busy === t.id} rejecting={rejecting === t.id} holding={holding === t.id} onHold={(h) => hold(t, h)} onToggleHold={() => setHolding(holding === t.id ? null : t.id)}
                    selected={selected.has(t.id)} onSelect={(on) => setSelected((sel) => { const n = new Set(sel); if (on) n.add(t.id); else n.delete(t.id); return n; })}
                    onApprove={() => approve(t)} onToggleReject={() => setRejecting(rejecting === t.id ? null : t.id)} onReject={(reason) => reject(t, reason)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'fixes' && <FixesQueue />}

      {tab === 'reports' && (
        <>
          {reports === null ? <Loading /> : reports.length === 0 ? (
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
                      <div className="mod-meta">Signalé par {r.reporter ? <UserLink user={r.reporter} /> : '?'} · <span className={isOld(r.createdAt) ? 'mod-late' : ''}>{timeAgo(r.createdAt)}</span></div>
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
