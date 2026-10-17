import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Cfg { enabled: boolean; minAccountDays: number; rewardScale: number; dailyBonus: { points: number; packs: number }; weeklyBonus: { points: number; packs: number } }
interface Cur { id: string; scope: 'daily' | 'weekly'; tier: string; icon: string; title: string; target: number; points: number; packs: number; started: number; done: number }
interface Stats { completions7d: number; pointsPaid7d: number; bonusToday: number; bonusWeek: number; players7d: number }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';

/** Admin > Jeux : les défis quotidiens et hebdomadaires (récompenses, bonus) et ce qui est en cours aujourd'hui. */
export default function AdminChallenges() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [current, setCurrent] = useState<Cur[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [size, setSize] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/challenges/admin').then((r) => { setCfg(r.data.config); setCurrent(r.data.current); setStats(r.data.stats); setSize(r.data.catalogSize); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!cfg || !stats) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (v: number, set: (n: number) => void, label: string, hint?: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/games/challenges/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🎯 Défis quotidiens et hebdomadaires : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Chaque jour, tous les membres ont les mêmes trois défis (facile, moyen, difficile) ; chaque semaine, trois défis plus longs, tirés dans un catalogue de {size} défis. Ils portent seulement sur des activités gratuites
        (roue, quiz, pronostics, cartes, parties gratuites du jour) : aucun ne pousse à miser. La récompense est versée au moment où le défi est réussi. L'échelle ci-dessous règle toutes les récompenses en points d'un coup
        (100 % = valeurs du catalogue : de 5 à 25 points par jour, de 25 à 70 par semaine ; 0 % = seulement des paquets de cartes).
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Défis ouverts aux membres</label>
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimal du compte (jours)')}
        {num(cfg.rewardScale, (n) => setCfg({ ...cfg, rewardScale: n }), 'Échelle des points (%)', '0 à 500')}
        {num(cfg.dailyBonus.points, (n) => setCfg({ ...cfg, dailyBonus: { ...cfg.dailyBonus, points: n } }), 'Bonus du jour (points)', 'Trois défis réussis')}
        {num(cfg.dailyBonus.packs, (n) => setCfg({ ...cfg, dailyBonus: { ...cfg.dailyBonus, packs: n } }), 'Bonus du jour (paquets)')}
        {num(cfg.weeklyBonus.points, (n) => setCfg({ ...cfg, weeklyBonus: { ...cfg.weeklyBonus, points: n } }), 'Bonus de la semaine (points)')}
        {num(cfg.weeklyBonus.packs, (n) => setCfg({ ...cfg, weeklyBonus: { ...cfg.weeklyBonus, packs: n } }), 'Bonus de la semaine (paquets)')}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        7 derniers jours : {formatNumber(stats.completions7d)} défis réussis par {stats.players7d} membre{stats.players7d > 1 ? 's' : ''} · {formatNumber(stats.pointsPaid7d)} points offerts (bonus compris) · bonus du jour reçus aujourd'hui : {stats.bonusToday} · bonus de la semaine : {stats.bonusWeek}.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: 'left' }}><th>Période</th><th>Défi en cours</th><th>Niveau</th><th>Récompense</th><th>Commencés</th><th>Réussis</th></tr></thead>
        <tbody>
          {current.map((c) => (
            <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td>{c.scope === 'daily' ? 'Jour' : 'Semaine'}</td><td>{c.icon} {c.title} <span className="muted">({c.target})</span></td><td>{c.tier}</td>
              <td>{c.points} pts{c.packs > 0 ? ` + ${c.packs} 🎴` : ''}</td><td>{c.started}</td><td>{c.done}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
