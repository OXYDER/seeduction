import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Flow { id: string; label: string; kind: 'free' | 'house' | 'seed' | 'other'; credit: number; debit: number; count: number }
interface Earner { username: string; net: number; bySource: Record<string, number> }
interface Overview {
  installed: boolean; config: { alertThreshold: number }; spanDays: number; sources: { id: string; label: string; kind: string }[];
  totals: { h24: Flow[]; d7: Flow[]; all: Flow[] };
  summary: { createdFree24h: number; createdFree7d: number; houseResult24h: number; houseResult7d: number; playersFree24h: number; perPlayer24h: number };
  daily: { day: string; free: number; house: number; seed: number; other: number }[];
  earners24h: Earner[]; earners7d: Earner[]; flagged24h: number;
}
const KIND: Record<string, string> = { free: 'Gratuit', house: 'Contre la maison', seed: 'Partage', other: 'Autre' };
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';
const sign = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return <div className="panel" style={{ padding: 12 }}><div className="muted" style={{ fontSize: 12.5 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, color: tone === 'good' ? 'var(--green-bright)' : tone === 'bad' ? 'var(--danger)' : undefined }}>{value}</div>{hint && <div className="muted" style={{ fontSize: 11.5 }}>{hint}</div>}</div>;
}

/** Admin > Jeux : économie des points (journal central) : combien de points naissent et disparaissent, par source, et qui gagne le plus. */
export default function AdminEconomy() {
  const [d, setD] = useState<Overview | null>(null);
  const [days, setDays] = useState(14);
  const [threshold, setThreshold] = useState(1500);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/admin/economy', { params: { days } }).then((r) => { setD(r.data); setThreshold(r.data.config.alertThreshold); setErr(''); }).catch((e) => setErr(errorOf(e))), [days]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  async function save() {
    setMsg(''); setErr('');
    try { await api.put('/admin/economy/config', { alertThreshold: threshold }); setMsg('✓ Seuil enregistré'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  const win = (list: Flow[], id: string) => list.find((f) => f.id === id) ?? { credit: 0, debit: 0, count: 0 } as Flow;
  const net = (f: { credit: number; debit: number }, kind: string) => (kind === 'house' ? f.debit - f.credit : f.credit - f.debit);

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>💰 Économie des points</h2>
        <label className="muted" style={{ fontSize: 13 }}>Période du graphique : <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} jours</option>)}</select></label>
      </div>
      {!d.installed && <div style={{ color: 'var(--danger)' }}>Le journal des points n'est pas actif : lance « prisma db push » sur le serveur puis redémarre le backend.</div>}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Chaque changement de points est noté, regroupé par membre, source et heure. <strong>Créés</strong> : points offerts sans mise (roue, quiz, pronostics, cartes, défis, remise, buts). <strong>Résultat de la maison</strong> : ce que les membres ont perdu aux jeux moins ce qu'ils ont gagné
        (positif : le site gagne des points aux membres). « Autres » regroupe les dons, requêtes, équipe... (non étiquetés).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        <Tile label="Points créés (24 h)" value={sign(d.summary.createdFree24h)} hint={`${sign(d.summary.createdFree7d)} sur 7 jours`} />
        <Tile label="Par joueur actif (24 h)" value={sign(d.summary.perPlayer24h)} hint={`${d.summary.playersFree24h} membre${d.summary.playersFree24h > 1 ? 's' : ''} actif${d.summary.playersFree24h > 1 ? 's' : ''} dans les jeux`} />
        <Tile label="Résultat de la maison (24 h)" value={sign(d.summary.houseResult24h)} hint={`${sign(d.summary.houseResult7d)} sur 7 jours`} tone={d.summary.houseResult24h >= 0 ? 'good' : 'bad'} />
        <Tile label="Gains inhabituels (24 h)" value={String(d.flagged24h)} hint={d.config.alertThreshold > 0 ? `membre(s) au-dessus de ${formatNumber(d.config.alertThreshold)} points` : 'alerte désactivée'} tone={d.flagged24h > 0 ? 'bad' : undefined} />
      </div>

      <div>
        <h3 style={{ margin: '0 0 6px' }}>Par jour (heure de Montréal)</h3>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={d.daily}>
            <XAxis dataKey="day" stroke="#8fa896" fontSize={11} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis stroke="#8fa896" fontSize={11} />
            <Tooltip contentStyle={{ background: '#0c1912', border: '1px solid #1f3d2a' }} />
            <Legend />
            <Bar dataKey="free" name="Créés (gratuit)" fill="#4caf50" />
            <Bar dataKey="house" name="Résultat de la maison" fill="#e0b84a" />
            <Bar dataKey="seed" name="Partage de torrents" fill="#5db7ff" />
            <Bar dataKey="other" name="Autres (net)" fill="#9aa9bf" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Source</th><th>Type</th><th>24 h crédités</th><th>24 h retirés</th><th>24 h net</th><th>7 j net</th><th>Période net</th></tr></thead>
          <tbody>
            {d.sources.map((s) => {
              const a = win(d.totals.h24, s.id), w = win(d.totals.d7, s.id), t = win(d.totals.all, s.id);
              const quiet = a.count === 0 && w.count === 0 && t.count === 0;
              const nn = (f: { credit: number; debit: number }) => net(f, s.kind);
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)', opacity: quiet ? 0.5 : 1 }}>
                  <td>{s.label}</td><td className="muted">{KIND[s.kind]}</td><td>{formatNumber(a.credit)}</td><td>{formatNumber(a.debit)}</td>
                  <td><strong>{s.kind === 'house' ? `maison ${sign(nn(a))}` : sign(nn(a))}</strong></td><td>{s.kind === 'house' ? `maison ${sign(nn(w))}` : sign(nn(w))}</td><td>{s.kind === 'house' ? `maison ${sign(nn(t))}` : sign(nn(t))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {([['Plus gros gagnants (24 h)', d.earners24h], ['Plus gros gagnants (7 jours)', d.earners7d]] as [string, Earner[]][]).map(([title, list]) => (
          <div key={title}>
            <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
            {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>Personne pour l'instant.</p> : (
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13.5 }}>
                {list.map((e, i) => (
                  <li key={i} style={{ color: d.config.alertThreshold > 0 && e.net >= d.config.alertThreshold && title.includes('24') ? 'var(--danger)' : undefined }}>
                    <strong>{e.username}</strong> {sign(e.net)} <span className="muted">({Object.entries(e.bySource).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${d.sources.find((s) => s.id === k)?.label ?? k} ${sign(v)}`).join(', ')})</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Le classement exclut le partage de torrents, les dons et les échanges, qui peuvent légitimement être très élevés.</p>

      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>Alerte quand un membre gagne plus de <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 100, margin: '0 6px' }} /> points en 24 h (0 = aucune alerte)</label>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
