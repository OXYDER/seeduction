import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Seg { label: string; points: number; tokens: number; weight: number; color: string }
interface Cfg { enabled: boolean; minAccountDays: number; segments: Seg[]; streak: { bonusPerDay: number; maxBonus: number; weeklyBonus: number } }
interface Totals { spins: number; points: number; tokens: number }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : la roue de la fortune (lots, chances, série) et ce qu'elle a coûté. Ces informations ne sont jamais montrées aux membres. */
export default function AdminWheel() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [info, setInfo] = useState<{ expected: { first: number; maxStreak: number }; stats: { today: Totals; week: Totals; all: Totals; playersWeek: number } } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/wheel/admin').then((r) => { setCfg(r.data.config); setInfo({ expected: r.data.expected, stats: r.data.stats }); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!cfg || !info) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const totalWeight = cfg.segments.reduce((s, x) => s + x.weight, 0);
  const setSeg = (i: number, patch: Partial<Seg>) => setCfg({ ...cfg, segments: cfg.segments.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/games/wheel/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  const num = (v: number, set: (n: number) => void, label: string, hint?: string, step = 1) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} step={step} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  const row = (label: string, t: Totals) => (
    <tr key={label} style={{ borderTop: '1px solid var(--border)' }}><td>{label}</td><td>{formatNumber(t.spins)}</td><td>{formatNumber(t.points)}</td><td>{formatNumber(t.tokens)}</td></tr>
  );

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🎡 Roue de la fortune : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Un tour gratuit par membre et par jour : ce sont des cadeaux du site, sans mise. Le coût moyen d'un tour est d'environ <strong>{info.expected.first} points</strong> au premier jour
        (jusqu'à environ {info.expected.maxStreak} avec la série maximale ; un jeton compte pour 300 points). Le tirage suit les poids ci-dessous : un secteur de poids 4 sort deux fois plus souvent qu'un secteur de poids 2.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Roue ouverte aux membres</label>
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimal du compte (jours)')}
        {num(Math.round(cfg.streak.bonusPerDay * 1000) / 10, (n) => setCfg({ ...cfg, streak: { ...cfg.streak, bonusPerDay: n / 100 } }), 'Bonus par jour de série (%)', '0 à 50', 0.5)}
        {num(Math.round(cfg.streak.maxBonus * 100), (n) => setCfg({ ...cfg, streak: { ...cfg.streak, maxBonus: n / 100 } }), 'Bonus maximal de série (%)', '0 à 500')}
        {num(cfg.streak.weeklyBonus, (n) => setCfg({ ...cfg, streak: { ...cfg.streak, weeklyBonus: n } }), 'Bonus du 7e jour (points)')}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: 'left' }}><th>#</th><th>Étiquette</th><th>Points</th><th>Jetons</th><th>Poids</th><th>Chance</th><th>Couleur</th></tr></thead>
        <tbody>
          {cfg.segments.map((s, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td>{i + 1}</td>
              <td><input value={s.label} maxLength={12} onChange={(e) => setSeg(i, { label: e.target.value })} style={{ width: 90 }} /></td>
              <td><input type="number" min={0} value={s.points} onChange={(e) => setSeg(i, { points: Number(e.target.value) })} style={{ width: 80 }} /></td>
              <td><input type="number" min={0} max={20} value={s.tokens} onChange={(e) => setSeg(i, { tokens: Number(e.target.value) })} style={{ width: 60 }} /></td>
              <td><input type="number" min={0} step={0.1} value={s.weight} onChange={(e) => setSeg(i, { weight: Number(e.target.value) })} style={{ width: 70 }} /></td>
              <td>{totalWeight > 0 ? `${((s.weight / totalWeight) * 100).toFixed(1)} %` : '–'}</td>
              <td><input type="color" value={s.color} onChange={(e) => setSeg(i, { color: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: 'left' }}><th /><th>Tours</th><th>Points offerts</th><th>Jetons offerts</th></tr></thead>
        <tbody>{row('24 heures', info.stats.today)}{row('7 jours', info.stats.week)}{row('Depuis le début', info.stats.all)}</tbody>
      </table>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{info.stats.playersWeek} membre{info.stats.playersWeek > 1 ? 's ont' : ' a'} tourné la roue ces 7 derniers jours.</p>
    </div>
  );
}
