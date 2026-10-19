import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Cfg { enabled: boolean; rewardPoints: number; minDays: number; minClass: string; maxPerMonth: number }
const CLASSES: [string, string][] = [['MEMBRE', 'Membre'], ['POWER_USER', 'Power User'], ['ELITE', 'Élite'], ['VETERAN', 'Vétéran']];

/** Admin > Invitations : prime de parrainage (points bonus versés à celui qui invite quand son invité devient un vrai membre). */
export function AdminReferral() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/admin/referral').then((r) => setCfg(r.data)).catch((e) => setMsg(e.response?.data?.message ?? 'Chargement impossible')); }, []);
  if (!cfg) return msg ? <p style={{ color: 'var(--danger)' }}>{msg}</p> : null;
  const up = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg({ ...cfg, [k]: v });
  async function save() {
    setBusy(true); setMsg('');
    try { setCfg((await api.put('/admin/referral', cfg)).data); setMsg('Enregistré.'); } catch (e: any) { setMsg(e.response?.data?.message ?? 'Enregistrement impossible'); } finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); setMsg('');
    try { const r = await api.post('/admin/referral/run'); setMsg(`${r.data.paid} prime${r.data.paid > 1 ? 's' : ''} versée${r.data.paid > 1 ? 's' : ''}.`); } catch (e: any) { setMsg(e.response?.data?.message ?? 'Impossible'); } finally { setBusy(false); }
  }
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
      <h2 style={{ margin: 0 }}>🤝 Prime de parrainage</h2>
      <p className="muted" style={{ margin: 0 }}>Un membre qui invite quelqu'un reçoit des points bonus quand l'invité devient un vrai membre (pas dès l'inscription). Jamais pour un code générique, ni quand l'invité partage une adresse IP avec son parrain. Versée à l'ouverture de la page Parrainage et chaque nuit.</p>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => up('enabled', e.target.checked)} /> Primes activées</label>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Points par prime<input type="number" min={0} max={100000} value={cfg.rewardPoints} onChange={(e) => up('rewardPoints', Number(e.target.value))} style={{ width: 130 }} /></label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Ancienneté de l'invité (jours)<input type="number" min={0} max={365} value={cfg.minDays} onChange={(e) => up('minDays', Number(e.target.value))} style={{ width: 130 }} /></label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Rang minimum de l'invité<select value={cfg.minClass} onChange={(e) => up('minClass', e.target.value)}>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Primes max. par parrain et par mois<input type="number" min={1} max={100} value={cfg.maxPerMonth} onChange={(e) => up('maxPerMonth', Number(e.target.value))} style={{ width: 130 }} /></label>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={busy} onClick={save}>Enregistrer</button>
        <button type="button" className="secondary" disabled={busy} onClick={run}>Verser les primes dues maintenant</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}
