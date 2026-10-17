import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Cfg { enabled: boolean; rate: number; minLoss: number; maxPerDay: number }

/** Admin > Jeux : remise de fidélité commune à tous les jeux contre la maison (machines à sous, Plus haut ou plus bas...). */
export default function AdminCashback() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/games/cashback/admin').then((r) => setCfg(r.data)).catch(() => setErr('Chargement impossible')); }, []);
  if (!cfg) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  async function save() {
    setMsg(''); setErr('');
    try { setCfg((await api.put('/games/cashback/admin', cfg)).data); setMsg('✓ Réglages enregistrés'); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }
  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>💝 Remise de fidélité (tous les jeux)</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Chaque matin (5 h 15, heure de Montréal), une part des pertes nettes de la veille, tous les jeux contre la maison confondus, est rendue à chaque membre qui a perdu plus que le seuil. Il reçoit une notification.
        Les membres se sentent soutenus quand la chance tourne mal ; le coût pour le site est une fraction des pertes seulement.
      </p>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Remise activée</label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Part des pertes rendue (%)
          <input type="number" min={0} max={50} step={1} value={Math.round(cfg.rate * 100)} onChange={(e) => setCfg({ ...cfg, rate: Number(e.target.value) / 100 })} style={{ width: 110 }} />
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Pertes minimales (points)
          <input type="number" min={0} value={cfg.minLoss} onChange={(e) => setCfg({ ...cfg, minLoss: Number(e.target.value) })} style={{ width: 110 }} />
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Maximum par jour (points)
          <input type="number" min={0} value={cfg.maxPerDay} onChange={(e) => setCfg({ ...cfg, maxPerDay: Number(e.target.value) })} style={{ width: 110 }} />
        </label>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
