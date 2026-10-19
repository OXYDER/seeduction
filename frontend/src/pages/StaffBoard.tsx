import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

interface Queue { key: string; label: string; icon: string; link: string; count: number; oldestAt: string | null; oldestHours: number | null; level: 'ok' | 'warn' | 'late'; mine: number | null }
interface Delay { median: number; p90: number; sample: number }
interface Board {
  generatedAt: string; total: number; late: number; queues: Queue[];
  delays: { torrentApprovalHours: Delay | null; ticketFirstResponseHours: Delay | null };
  activity: { id: string; username: string; role: string; total: number; detail: { action: string; label: string; count: number }[] }[];
  onlineHint: string[];
}

/** « 3 h 20 », « 2 j 4 h » : durée lisible. */
function span(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) { const h = Math.floor(hours), m = Math.round((hours - h) * 60); return m && hours < 10 ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.round(hours)} h`; }
  return `${Math.floor(hours / 24)} j ${Math.round(hours % 24)} h`;
}
const LEVEL: Record<Queue['level'], { label: string; color: string }> = { ok: { label: 'À jour', color: 'var(--success, #4caf50)' }, warn: { label: 'À surveiller', color: '#ff9f2d' }, late: { label: 'En retard', color: 'var(--danger, #e5384f)' } };
const ROLE: Record<string, string> = { MODERATOR: 'modérateur', SUPER_MODERATOR: 'super-modérateur', ADMIN: 'administrateur', OWNER: 'propriétaire' };

/** Tableau de bord de l'équipe : ce qui attend un traitement (et depuis quand), les délais de traitement et l'activité des 7 derniers jours. */
export default function StaffBoard() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const load = () => api.get('/staff/board').then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000); return () => clearInterval(t); }, []);
  if (!data) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;

  const todo = data.queues.filter((q) => q.count > 0).sort((a, b) => (a.level === b.level ? (b.oldestHours ?? 0) - (a.oldestHours ?? 0) : a.level === 'late' ? -1 : b.level === 'late' ? 1 : a.level === 'warn' ? -1 : 1));
  const clear = data.queues.filter((q) => q.count === 0);
  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><h1 style={{ margin: 0 }}>📋 Tableau de bord de l'équipe</h1><Link to="/moderation-log" className="button secondary">🧾 Journal de modération</Link></div>
      <div className="panel row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><div style={{ fontSize: 30, fontWeight: 800 }}>{data.total}</div><div className="muted" style={{ fontSize: 13 }}>élément{data.total > 1 ? 's' : ''} en attente</div></div>
        <div><div style={{ fontSize: 30, fontWeight: 800, color: data.late ? LEVEL.late.color : LEVEL.ok.color }}>{data.late}</div><div className="muted" style={{ fontSize: 13 }}>file{data.late > 1 ? 's' : ''} en retard</div></div>
        <div><div style={{ fontSize: 20, fontWeight: 800 }}>{data.delays.torrentApprovalHours ? span(data.delays.torrentApprovalHours.median) : '—'}</div><div className="muted" style={{ fontSize: 13 }}>délai de validation d'un torrent (médiane, 30 j){data.delays.torrentApprovalHours ? ` · 9 sur 10 en moins de ${span(data.delays.torrentApprovalHours.p90)}` : ''}</div></div>
        <div><div style={{ fontSize: 20, fontWeight: 800 }}>{data.delays.ticketFirstResponseHours ? span(data.delays.ticketFirstResponseHours.median) : '—'}</div><div className="muted" style={{ fontSize: 13 }}>première réponse du support (médiane, 30 j){data.delays.ticketFirstResponseHours ? ` · 9 sur 10 en moins de ${span(data.delays.ticketFirstResponseHours.p90)}` : ''}</div></div>
      </div>

      {todo.length === 0 ? <div className="panel">🎉 Tout est à jour : aucune file en attente.</div> : (
        <div className="sb-grid">
          {todo.map((q) => (
            <Link key={q.key} to={q.link} className={`sb-card ${q.level}`} title={`${LEVEL[q.level].label}${q.oldestHours !== null ? ` : le plus ancien attend depuis ${span(q.oldestHours)}` : ''}`}>
              <span className="sb-icon" aria-hidden>{q.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div className="sb-count">{q.count}</div>
                <div style={{ fontWeight: 700 }}>{q.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Plus ancien : <strong style={{ color: LEVEL[q.level].color }}>{span(q.oldestHours)}</strong>
                  {q.mine ? ` · dont ${q.mine} pour moi` : ''}
                </div>
              </div>
              <span className="sb-dot" style={{ background: LEVEL[q.level].color }} aria-label={LEVEL[q.level].label} />
            </Link>
          ))}
        </div>
      )}
      {clear.length > 0 && <p className="muted" style={{ margin: 0 }}>✅ À jour : {clear.map((q) => `${q.icon} ${q.label}`).join(' · ')}</p>}

      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Activité de l'équipe · 7 derniers jours</h3>
        {data.activity.length === 0 ? <span className="muted">Aucune action de modération enregistrée cette semaine.</span> : (
          <table>
            <thead><tr><th>Membre de l'équipe</th><th>Actions</th><th>Détail</th></tr></thead>
            <tbody>
              {data.activity.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/users/${a.id}`}>{a.username}</Link> <small className="muted">{ROLE[a.role] ?? a.role}{data.onlineHint.includes(a.username) ? ' · 🟢 en ligne' : ''}</small></td>
                  <td><strong>{a.total}</strong></td>
                  <td className="muted" style={{ fontSize: 13 }}>{a.detail.map((d) => `${d.count} ${d.label}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <small className="muted">Mis à jour toutes les minutes. Seuils : « à surveiller » puis « en retard » selon la plus longue attente de chaque file (ex : torrents 12 h / 48 h, support 8 h / 24 h).</small>
    </div>
  );
}
