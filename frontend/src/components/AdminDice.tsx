import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Cfg {
  enabled: boolean; minStake: number; maxStake: number; edge: number; maxWin: number; dailyLossMax: number; minAccountDays: number;
  dailyFree: { enabled: boolean; stake: number; maxWin: number };
}
interface Totals { rolls: number; wagered: number; paid: number; houseProfit: number; observedRtp: number | null }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : les dés (marge, limites et comptes de la maison). Ces informations ne sont jamais montrées aux membres. */
export default function AdminDice() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [totals, setTotals] = useState<{ day: Totals; week: Totals; all: Totals } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/dice/admin').then((r) => { setCfg(r.data.config); setTotals(r.data.totals); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!cfg || !totals) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (v: number, set: (n: number) => void, label: string, hint?: string, step = 1) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} step={step} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/games/dice/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  const row = (label: string, t: Totals) => (
    <tr key={label} style={{ borderTop: '1px solid var(--border)' }}>
      <td>{label}</td><td>{formatNumber(t.rolls)}</td><td>{formatNumber(t.wagered)}</td><td>{formatNumber(t.paid)}</td>
      <td style={{ color: t.houseProfit >= 0 ? 'var(--green-bright)' : 'var(--danger)' }}><strong>{t.houseProfit >= 0 ? '+' : ''}{formatNumber(t.houseProfit)}</strong></td>
      <td>{t.observedRtp === null ? '–' : `${t.observedRtp} %`}</td>
    </tr>
  );

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🎲 Dés : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Chaque pari paie « (1 − marge) ÷ probabilité », calculé sur les 36 combinaisons de deux dés et arrondi vers le bas : la maison garde au moins la marge choisie sur chaque pari, quel que soit le choix du joueur.
        Les paris trop probables (cote sous ×1,10) ne sont pas proposés. Les pertes comptent pour la remise de fidélité quotidienne. Ni la marge ni les comptes ne sont montrés aux membres.
      </p>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Jeu ouvert aux membres</label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {num(cfg.minStake, (n) => setCfg({ ...cfg, minStake: n }), 'Mise minimale', 'Multiple de 5')}
        {num(cfg.maxStake, (n) => setCfg({ ...cfg, maxStake: n }), 'Mise maximale', 'Multiple de 5')}
        {num(Math.round(cfg.edge * 1000) / 10, (n) => setCfg({ ...cfg, edge: n / 100 }), 'Marge de la maison (%)', '1 à 30 % ; plus elle est basse, plus les membres gagnent', 0.5)}
        {num(cfg.maxWin, (n) => setCfg({ ...cfg, maxWin: n }), 'Gain maximal par lancer', '0 = sans plafond')}
        {num(cfg.dailyLossMax, (n) => setCfg({ ...cfg, dailyLossMax: n }), 'Pertes max. par 24 h', '0 = sans limite')}
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimal du compte (jours)')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.dailyFree.enabled} onChange={(e) => setCfg({ ...cfg, dailyFree: { ...cfg.dailyFree, enabled: e.target.checked } })} /> Un lancer gratuit par jour</label>
        {num(cfg.dailyFree.stake, (n) => setCfg({ ...cfg, dailyFree: { ...cfg.dailyFree, stake: n } }), 'Valeur du lancer gratuit', 'Mise fictive (multiple de 5)')}
        {num(cfg.dailyFree.maxWin, (n) => setCfg({ ...cfg, dailyFree: { ...cfg.dailyFree, maxWin: n } }), 'Gain maximal gratuit', 'Points offerts par le site')}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: 'left' }}><th /><th>Lancers</th><th>Misé</th><th>Payé</th><th>Bénéfice du site</th><th>Retour observé</th></tr></thead>
        <tbody>{row('24 heures', totals.day)}{row('7 jours', totals.week)}{row('Depuis le début', totals.all)}</tbody>
      </table>
    </div>
  );
}
