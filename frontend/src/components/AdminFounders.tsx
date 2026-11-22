import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Nick from './Nick';

interface Cfg { cutoff: string; minCriteria: number; activeDays: number; loginDays: number; posts: number; uploads: number; feedback: number; seedHours: number }
interface Row {
  id: string; username: string; role: string; createdAt: string; lastSeenAt: string | null; founder: boolean; eligible: boolean; recent: boolean;
  metrics: { loginDays: number; posts: number; uploads: number; feedback: number; seedHours: number }; met: string[];
}
interface Overview { config: Cfg; total: number; founders: number; eligible: number; rows: Row[] }

const CRITERIA: { key: keyof Row['metrics']; label: string; short: string }[] = [
  { key: 'loginDays', label: 'Jours de connexion différents', short: 'Jours' },
  { key: 'posts', label: 'Messages au forum et commentaires', short: 'Messages' },
  { key: 'uploads', label: 'Torrents envoyés (approuvés)', short: 'Envois' },
  { key: 'feedback', label: 'Suggestions et billets de support (retours de bêta)', short: 'Retours' },
  { key: 'seedHours', label: 'Heures de seed cumulées', short: 'Seed (h)' },
];
const toLocalInput = (iso: string) => { const d = new Date(iso); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };

/** Admin > Fondateurs : le site propose les membres de la bêta qui ont été actifs ; l'administration valide qui reçoit le statut « Fondateur ». */
export default function AdminFounders() {
  const [data, setData] = useState<Overview | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'eligible' | 'all' | 'founders'>('eligible');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const apply = (d: Overview) => { setData(d); setCfg(d.config); };
  useEffect(() => { api.get('/founders/admin').then((r) => apply(r.data)).catch(() => setError('Chargement impossible')); }, []);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => (filter === 'eligible' ? r.eligible && !r.founder : filter === 'founders' ? r.founder : true)), [data, filter]);

  async function run<T>(fn: () => Promise<T>, ok?: (r: T) => string) {
    setBusy(true); setError(''); setInfo('');
    try { const r = await fn(); if (ok) setInfo(ok(r)); } catch (e: any) { setError(e.response?.data?.message ?? 'Action impossible'); } finally { setBusy(false); }
  }
  const saveConfig = () => run(async () => apply((await api.put('/founders/admin/config', { ...cfg, cutoff: new Date(cfg!.cutoff).toISOString() })).data), () => 'Critères enregistrés');
  const grant = (ids: string[]) => run(async () => { const r = (await api.post('/founders/admin/grant', { ids })).data; apply(r.overview); setPicked(new Set()); return r; }, (r: any) => `${r.granted} membre(s) maintenant fondateur(s)`);
  const revoke = (r: Row) => { if (window.confirm(`Retirer le statut de fondateur à ${r.username} ?`)) void run(async () => apply((await api.post('/founders/admin/revoke', { id: r.id })).data), () => `Statut retiré à ${r.username}`); };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allEligible = (data?.rows ?? []).filter((r) => r.eligible && !r.founder).map((r) => r.id);

  if (!data || !cfg) return <div className="panel"><h3 style={{ marginTop: 0 }}>🏅 Membres fondateurs</h3>{error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <p className="muted">Chargement…</p>}</div>;
  const num = (k: keyof Cfg, label: string, max = 100000) => (
    <label key={k} style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} max={max} value={cfg[k] as number} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} style={{ maxWidth: 140 }} />
    </label>
  );

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>🏅 Membres fondateurs : les critères</h3>
        <p className="muted" style={{ margin: 0 }}>
          Les membres de la bêta (compte créé avant la date limite) qui remplissent assez de critères d'activité et ont été vus récemment sont proposés ci-dessous. Rien n'est attribué tout seul : tu valides chaque fondateur.
        </p>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Fin de la bêta (date limite d'inscription)
            <input type="datetime-local" value={toLocalInput(cfg.cutoff)} onChange={(e) => e.target.value && setCfg({ ...cfg, cutoff: new Date(e.target.value).toISOString() })} />
          </label>
          {num('minCriteria', 'Critères à remplir (sur 5)', 5)}
          {num('activeDays', 'Vu dans les N derniers jours (0 = ignorer)', 3650)}
        </div>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          {num('loginDays', 'Jours de connexion ≥')}
          {num('posts', 'Messages et commentaires ≥')}
          {num('uploads', 'Torrents approuvés ≥')}
          {num('feedback', 'Suggestions / billets ≥')}
          {num('seedHours', 'Heures de seed ≥', 1000000)}
          <button type="button" className="secondary" disabled={busy} onClick={saveConfig}>Enregistrer les critères</button>
        </div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Candidats</h3>
        <span className="muted" style={{ fontSize: 13 }}>{data.total} membre(s) de la bêta · <strong>{data.eligible}</strong> proposé(s) · <strong>{data.founders}</strong> déjà fondateur(s)</span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {([['eligible', 'Proposés'], ['all', 'Tous les membres de la bêta'], ['founders', 'Fondateurs actuels']] as const).map(([k, l]) => (
            <button key={k} type="button" className={filter === k ? '' : 'secondary'} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" disabled={busy || allEligible.length === 0} onClick={() => setPicked(new Set(allEligible))}>Cocher tous les proposés ({allEligible.length})</button>
          <button type="button" disabled={busy || picked.size === 0} onClick={() => { if (window.confirm(`Donner le statut de fondateur à ${picked.size} membre(s) ?`)) void grant([...picked]); }}>🏅 Nommer fondateur ({picked.size})</button>
        </div>
        {info && <span style={{ color: 'var(--success)' }}>✓ {info}</span>}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th /><th>Membre</th><th>Inscrit</th><th>Vu</th>{CRITERIA.map((c) => <th key={c.key} title={c.label}>{c.short}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{!r.founder && <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Choisir ${r.username}`} />}</td>
                  <td><Nick id={r.id} name={r.username} /> {r.founder && <span title="Fondateur">🏅</span>}</td>
                  <td className="muted">{new Date(r.createdAt).toLocaleDateString('fr-CA')}</td>
                  <td className="muted" style={{ color: r.recent ? undefined : 'var(--danger)' }}>{r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleDateString('fr-CA') : '—'}</td>
                  {CRITERIA.map((c) => <td key={c.key} style={{ fontWeight: r.met.includes(c.key) ? 700 : 400, color: r.met.includes(c.key) ? 'var(--success)' : 'var(--text-dim)' }}>{r.metrics[c.key]}</td>)}
                  <td>{r.founder ? <button type="button" className="secondary" disabled={busy} onClick={() => revoke(r)}>Retirer</button> : !r.eligible ? <span className="muted" style={{ fontSize: 12 }}>{r.met.length}/{data.config.minCriteria} critères{!r.recent ? ', absent' : ''}</span> : <button type="button" disabled={busy} onClick={() => void grant([r.id])}>Nommer</button>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5 + CRITERIA.length} className="muted">Aucun membre dans cette liste.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
