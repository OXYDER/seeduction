import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';

interface Point { label: string; at: string; requests: number; errors: number; announces: number; onlinePeak: number; rssMB: number; lagMs: number }
interface Incident { id: string; label: string; level: 'warn' | 'error'; detail: string; startedAt: string; resolvedAt: string | null; duration: string; open: boolean }
interface Data { range: '24h' | '7d' | '30d'; points: Point[]; summary: { requests: number; errors: number; errorRate: number; peakOnline: number; maxLagMs: number; maxRssMB: number }; incidents: Incident[] }
const RANGES: [Data['range'], string][] = [['24h', '24 heures'], ['7d', '7 jours'], ['30d', '30 jours']];
const fmt = (n: number) => n.toLocaleString('fr-CA');
const tick = { fontSize: 11, fill: 'var(--text-muted, #9aa)' };
const tip = { background: '#1f2937', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, fontSize: 12 };

/** Admin > Monitoring : évolution du site sur 24 h / 7 jours / 30 jours (membres en ligne, requêtes, erreurs, mémoire, retard) et historique des incidents. */
export default function SiteHistoryPanel() {
  const [range, setRange] = useState<Data['range']>('24h');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    const load = () => api.get('/admin/monitoring/history', { params: { range } }).then((r) => { if (!off) { setData(r.data); setError(''); } }).catch((e) => { if (!off) setError(e.response?.data?.message ?? 'Historique indisponible'); });
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 120_000);
    return () => { off = true; clearInterval(t); };
  }, [range]);
  if (error && !data) return <div className="panel" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data) return null;
  const s = data.summary;
  const empty = data.points.length === 0;
  const xInterval = Math.max(0, Math.floor(data.points.length / 8) - 1);
  return (
    <div className="panel" style={{ display: 'grid', gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>📈 Évolution du site</h3>
        <div className="row" style={{ gap: 6 }}>{RANGES.map(([k, label]) => <button key={k} type="button" className={range === k ? '' : 'secondary'} onClick={() => setRange(k)}>{label}</button>)}</div>
      </div>
      <div className="row" style={{ gap: 22, flexWrap: 'wrap' }}>
        <div><strong style={{ fontSize: 22 }}>{fmt(s.peakOnline)}</strong><div className="muted" style={{ fontSize: 12 }}>pic de membres en ligne</div></div>
        <div><strong style={{ fontSize: 22 }}>{fmt(s.requests)}</strong><div className="muted" style={{ fontSize: 12 }}>requêtes</div></div>
        <div><strong style={{ fontSize: 22, color: s.errorRate >= 1 ? 'var(--danger)' : undefined }}>{s.errorRate} %</strong><div className="muted" style={{ fontSize: 12 }}>d'erreurs serveur ({fmt(s.errors)})</div></div>
        <div><strong style={{ fontSize: 22 }}>{fmt(s.maxRssMB)} Mo</strong><div className="muted" style={{ fontSize: 12 }}>mémoire maximale</div></div>
        <div><strong style={{ fontSize: 22, color: s.maxLagMs >= 500 ? '#ff9f2d' : undefined }}>{fmt(s.maxLagMs)} ms</strong><div className="muted" style={{ fontSize: 12 }}>plus grand ralentissement</div></div>
      </div>

      {empty ? <p className="muted" style={{ margin: 0 }}>L'historique se remplit au fil des heures (une mesure par heure) : reviens un peu plus tard.</p> : (
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Membres en ligne (pic)</div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={data.points}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" /><XAxis dataKey="label" tick={tick} interval={xInterval} /><YAxis tick={tick} width={36} allowDecimals={false} /><Tooltip contentStyle={tip} />
                <Area type="monotone" dataKey="onlinePeak" name="En ligne" stroke="#5b8cff" fill="#5b8cff55" /></AreaChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Requêtes (barres) et erreurs serveur (ligne rouge)</div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={data.points}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" /><XAxis dataKey="label" tick={tick} interval={xInterval} />
                <YAxis yAxisId="r" tick={tick} width={44} /><YAxis yAxisId="e" orientation="right" tick={tick} width={34} allowDecimals={false} /><Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="r" dataKey="requests" name="Requêtes" fill="#2dd4bf88" /><Line yAxisId="e" type="monotone" dataKey="errors" name="Erreurs 5xx" stroke="#ff5a5a" dot={false} strokeWidth={2} /></ComposedChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Mémoire (Mo) et plus grand ralentissement du serveur (ms)</div>
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={data.points}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" /><XAxis dataKey="label" tick={tick} interval={xInterval} />
                <YAxis yAxisId="m" tick={tick} width={40} /><YAxis yAxisId="l" orientation="right" tick={tick} width={40} /><Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="m" type="monotone" dataKey="rssMB" name="Mémoire (Mo)" stroke="#a78bfa" dot={false} strokeWidth={2} /><Line yAxisId="l" type="monotone" dataKey="lagMs" name="Ralentissement (ms)" stroke="#ff9f2d" dot={false} strokeWidth={2} /></ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div>
        <h4 style={{ margin: '0 0 6px' }}>Incidents des 30 derniers jours</h4>
        {data.incidents.length === 0 ? <span className="muted">Aucun incident enregistré. 🎉</span> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {data.incidents.map((i) => (
              <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 8, alignItems: 'start' }}>
                <span aria-hidden>{i.open ? (i.level === 'error' ? '🔴' : '🟠') : '🟢'}</span>
                <div><strong style={{ fontSize: 13.5 }}>{i.label}</strong>{i.open && <span className="badge" style={{ marginLeft: 6 }}>en cours</span>}<div className="muted" style={{ fontSize: 12 }}>{i.detail}</div></div>
                <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>{new Date(i.startedAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}<br />{i.open ? `depuis ${i.duration}` : `durée : ${i.duration}`}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
