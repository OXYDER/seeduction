import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Finding { key: string; kind: string; severity: 'warn' | 'high'; subject: string; count: number; detail: string; label: string }
interface Report { hours: number; at: string; totals: { failed: number; failedIps: number; logins: number }; findings: Finding[]; topIps: { ip: string; count: number }[] }

/** Admin > Monitoring : activité suspecte des dernières heures (force brute, arrosage de comptes, compte ciblé, équipe connectée depuis une nouvelle adresse). */
export default function SecurityWatch() {
  const [r, setR] = useState<Report | null>(null);
  const [hours, setHours] = useState(24);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/admin/monitoring/security', { params: { hours } }).then((x) => { setR(x.data); setErr(''); }).catch((e) => setErr(e.response?.data?.message ?? 'Impossible de lire le rapport de sécurité')), [hours]);
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000); return () => clearInterval(t); }, [load]);
  if (err && !r) return <div className="panel" style={{ color: 'var(--danger)' }}>{err}</div>;
  if (!r) return null;
  const high = r.findings.some((f) => f.severity === 'high');
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, borderColor: high ? 'var(--danger)' : r.findings.length ? '#e0a030' : undefined }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{high ? '🔴' : r.findings.length ? '🟠' : '🟢'} Sécurité : connexions suspectes{r.findings.length ? ` (${r.findings.length})` : ''}</h3>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          Période
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={1}>1 heure</option><option value={24}>24 heures</option><option value={72}>3 jours</option><option value={168}>7 jours</option>
          </select>
        </label>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {formatNumber(r.totals.logins)} connexions réussies · {formatNumber(r.totals.failed)} échecs depuis {formatNumber(r.totals.failedIps)} adresse{r.totals.failedIps > 1 ? 's' : ''}.
        Les administrateurs reçoivent une notification (une fois par jour pour un même constat). Le blocage d'une adresse se fait au niveau du proxy ; ce panneau sert à la repérer.
      </p>
      {r.findings.length === 0 ? <p style={{ margin: 0 }}>Rien de suspect sur cette période.</p> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {r.findings.map((f) => (
            <div key={f.key} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 8px', borderRadius: 8, background: f.severity === 'high' ? 'rgba(255, 90, 90, 0.12)' : 'rgba(224, 160, 48, 0.12)' }}>
              <strong>{f.severity === 'high' ? '🔴' : '🟠'} {f.label}</strong>
              <code>{f.subject}</code>
              <span className="muted" style={{ fontSize: 13 }}>{f.detail}</span>
            </div>
          ))}
        </div>
      )}
      {r.topIps.length > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Adresses avec le plus d'échecs : {r.topIps.map((t) => `${t.ip} (${t.count})`).join(' · ')}
        </p>
      )}
    </div>
  );
}
