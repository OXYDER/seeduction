import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import UserLink from '../components/UserLink';
import Loading from '../components/Loading';

interface Member {
  id: string; username: string; role: string; status: string; avatarUrl: string | null; uploaded: number; downloaded: number; ratio: number | null; bonusPoints: number;
  createdAt: string | null; lastSeenAt: string | null; online?: boolean; presence?: string; devices?: number; seeding?: number; seededSize?: number; lastAnnounceAt?: string | null;
}

const ROLES: Record<string, string> = { USER: 'Membre', UPLOADER: 'Uploader', MODERATOR: 'Modérateur', SUPER_MODERATOR: 'Super-modérateur', ADMIN: 'Admin', OWNER: 'Propriétaire' };
const STATUSES: Record<string, string> = { ACTIVE: 'Actif', BANNED: 'Banni', DISABLED: 'Désactivé', PENDING_INVITE: 'Invitation en attente', PENDING_EMAIL: 'Courriel à confirmer' };
const PRESENCE: Record<string, string> = { ONLINE: '🟢 En ligne', AWAY: '🟡 Absent', BUSY: '🔴 Occupé', INVISIBLE: '👻 Invisible (apparaît hors ligne)' };
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
type View = 'all' | 'online' | 'seeders';
const errorOf = (e: any) => e?.response?.data?.message ?? 'Chargement impossible';

/** Listes de membres de l'équipe, ouvertes depuis les tuiles « La communauté » : tous les membres, ceux en ligne, ceux qui seedent. */
export default function StaffMembers() {
  const role = useAuthStore((s) => s.user?.role);
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'online' ? 'online' : params.get('view') === 'seeders' ? 'seeders' : 'all';
  const [q, setQ] = useState('');
  const [roleF, setRoleF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Member[]; total: number; pageSize?: number; invisible?: number; totalPeers?: number; byStatus?: Record<string, number> } | null>(null);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<{ all: number; online: number; seeders: number } | null>(null);

  const load = useCallback(() => {
    const url = view === 'online' ? '/staff/members/online' : view === 'seeders' ? '/staff/members/seeders' : '/staff/members';
    const p = view === 'all' ? { q: q || undefined, role: roleF || undefined, status: statusF || undefined, sort, page } : view === 'seeders' ? { q: q || undefined } : undefined;
    api.get(url, { params: p }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorOf(e)));
  }, [view, q, roleF, statusF, sort, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { setPage(1); }, [view, q, roleF, statusF, sort]);
  // Les nombres des trois onglets sont toujours affichés, qu'ils soient sélectionnés ou non.
  useEffect(() => {
    const loadCounts = () => api.get('/staff/members/counts').then((r) => setCounts(r.data)).catch(() => undefined);
    loadCounts();
    const t = setInterval(loadCounts, 15_000);
    return () => clearInterval(t);
  }, []);
  // La liste des membres en ligne se rafraîchit toute seule.
  useEffect(() => { if (view !== 'online') return; const t = setInterval(load, 15_000); return () => clearInterval(t); }, [view, load]);

  if (!STAFF.includes(role ?? '')) return <div className="panel"><p className="muted">Cette page est réservée à l'équipe.</p></div>;

  const setView = (v: View) => { const next = new URLSearchParams(params); if (v === 'all') next.delete('view'); else next.set('view', v); setParams(next, { replace: true }); setData(null); };
  const pages = data?.pageSize ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = view === 'online' && q.trim() ? data?.items.filter((m) => m.username.toLowerCase().includes(q.trim().toLowerCase())) : data?.items;

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>👥 Membres</h1>
        <button type="button" className="secondary" onClick={load}>↻ Actualiser</button>
      </div>

      <div className="mod-tabs" role="tablist">
        {([['all', 'Tous les membres'], ['online', 'En ligne'], ['seeders', 'Seeders']] as [View, string][]).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {label} {counts && <span className="mod-count">{counts[v]}</span>}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder="Rechercher un pseudo…" value={q} onChange={(e) => setQ(e.target.value)} />
        {view === 'all' && (
          <>
            <select value={roleF} onChange={(e) => setRoleF(e.target.value)} style={{ width: 'auto' }}><option value="">Tous les rôles</option>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: 'auto' }}><option value="">Tous les statuts</option>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}{data?.byStatus?.[k] != null ? ` (${data.byStatus[k]})` : ''}</option>)}</select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
              <option value="new">Inscrits récemment</option><option value="old">Plus anciens</option><option value="name">Pseudo (A-Z)</option><option value="seen">Dernière visite</option>
              <option value="upload">Plus gros upload</option><option value="download">Plus gros téléchargement</option><option value="points">Plus de points bonus</option>
            </select>
          </>
        )}
      </div>

      {view === 'online' && data && <p className="muted" style={{ margin: 0 }}>{data.total} membre{data.total > 1 ? 's' : ''} connecté{data.total > 1 ? 's' : ''}{data.invisible ? ` dont ${data.invisible} qui apparaî${data.invisible > 1 ? 'ssent' : 't'} hors ligne (visible de l'équipe seulement)` : ''}. Rafraîchi toutes les 15 s.</p>}
      {view === 'seeders' && data && <p className="muted" style={{ margin: 0 }}>{data.total} membre{data.total > 1 ? 's' : ''} seed{data.total > 1 ? 'ent' : 'e'} en ce moment ({formatNumber(data.totalPeers ?? 0)} pairs seeders au total : un même torrent peut être seedé depuis plusieurs clients).</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!data ? <Loading /> : !filtered || filtered.length === 0 ? <div className="panel mod-empty"><strong>Aucun membre</strong><span className="muted">Rien ne correspond.</span></div> : (
        <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Membre</th><th>Rôle</th>{view === 'online' && <th>Présence</th>}{view !== 'online' && <th>Statut</th>}
                {view === 'seeders' && <><th>Torrents seedés</th><th>Volume seedé</th><th>Dernier contact</th></>}
                <th>Ratio</th><th>↑ Envoyé</th><th>↓ Reçu</th><th>Points</th>{view === 'all' && <><th>Inscrit</th><th>Dernière visite</th></>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{m.online || view === 'online' ? <span title="En ligne" style={{ color: '#4ade80', marginRight: 6 }}>●</span> : null}<UserLink user={m} /></td>
                  <td>{ROLES[m.role] ?? m.role}</td>
                  {view === 'online' && <td>{PRESENCE[m.presence ?? 'ONLINE']}{m.devices && m.devices > 1 ? <span className="muted"> · {m.devices} appareils</span> : null}</td>}
                  {view !== 'online' && <td style={m.status === 'BANNED' ? { color: 'var(--danger)' } : undefined}>{STATUSES[m.status] ?? m.status}</td>}
                  {view === 'seeders' && <><td><strong>{formatNumber(m.seeding ?? 0)}</strong></td><td>{formatBytes(m.seededSize ?? 0)}</td><td className="muted">{m.lastAnnounceAt ? timeAgo(m.lastAnnounceAt) : '—'}</td></>}
                  <td>{m.ratio === null ? '∞' : m.ratio.toFixed(2)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatBytes(m.uploaded)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatBytes(m.downloaded)}</td>
                  <td>{formatNumber(m.bonusPoints)}</td>
                  {view === 'all' && <><td className="muted" style={{ whiteSpace: 'nowrap' }}>{m.createdAt ? new Date(m.createdAt).toLocaleDateString('fr-FR') : '—'}</td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{m.lastSeenAt ? timeAgo(m.lastSeenAt) : 'jamais'}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'all' && pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
          <span className="muted">Page {page} / {pages}</span>
          <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Clique sur un pseudo pour ouvrir le profil (et les outils de modération). <Link to="/stats">Statistiques du site →</Link></p>
    </div>
  );
}
