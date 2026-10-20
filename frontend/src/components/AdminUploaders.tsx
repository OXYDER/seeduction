import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import UserLink from './UserLink';

interface Cfg { enabled: boolean; minAccountDays: number; minApproved: number; windowDays: number; minClean: number; minCleanRate: number; keepActiveDays: number; keepWindowDays: number; maxFaults: number; maxReports: number }
interface Stats { accountDays: number; approvedTotal: number; window: { approvedClean: number; reviewed: number }; keep: { faults: number; reports: number }; daysSinceLastUpload: number | null }
interface Trusted { id: string; username: string; auto: boolean; since: string | null; stats: Stats; risk: string[] }
interface Candidate { id: string; username: string; stats: Stats; ready: boolean; missing: string[] }

const NUM: { key: keyof Cfg; label: string; min: number; max: number; step?: number; hint?: string }[] = [
  { key: 'minAccountDays', label: 'Ancienneté du compte (jours)', min: 0, max: 3650 },
  { key: 'minApproved', label: 'Torrents approuvés au total', min: 1, max: 10000 },
  { key: 'windowDays', label: 'Période observée (jours)', min: 7, max: 730 },
  { key: 'minClean', label: 'Approuvés du premier coup dans la période', min: 1, max: 10000 },
  { key: 'minCleanRate', label: 'Part approuvée du premier coup (0,5 à 1)', min: 0.5, max: 1, step: 0.05 },
  { key: 'keepActiveDays', label: 'Pour garder le rang : un envoi tous les (jours)', min: 7, max: 730 },
  { key: 'keepWindowDays', label: 'Période des fautes et signalements (jours)', min: 7, max: 730 },
  { key: 'maxFaults', label: 'Fautes tolérées (correction demandée ou refus)', min: 0, max: 100 },
  { key: 'maxReports', label: 'Signalements tolérés', min: 0, max: 100 },
];

const since = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-CA') : '');

/** Admin > Torrents : rang « Uploadeur » automatique (réglages, Uploadeurs actuels, membres proches du rang). */
export function AdminUploaders() {
  const isAdmin = ['ADMIN', 'OWNER'].includes(useAuthStore((s) => s.user?.role ?? ''));
  const [data, setData] = useState<{ config: Cfg; trusted: Trusted[]; candidates: Candidate[] } | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/admin/trusted-uploaders').then((r) => { setData(r.data); setCfg(r.data.config); }).catch((e) => setMsg(e.response?.data?.message ?? 'Chargement impossible'));
  useEffect(() => { void load(); }, []);
  if (!data || !cfg) return msg ? <p style={{ color: 'var(--danger)' }}>{msg}</p> : null;
  const up = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg({ ...cfg, [k]: v });

  async function save() {
    setBusy(true); setMsg('');
    try { await api.put('/admin/trusted-uploaders/config', cfg); setMsg('Enregistré.'); await load(); } catch (e: any) { setMsg(e.response?.data?.message ?? 'Enregistrement impossible'); } finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); setMsg('');
    try {
      const r = (await api.post('/admin/trusted-uploaders/run')).data;
      setMsg(`${r.checked} membre(s) examiné(s) : ${r.promoted.length} promu(s)${r.promoted.length ? ` (${r.promoted.join(', ')})` : ''}, ${r.demoted.length} rétrogradé(s)${r.demoted.length ? ` (${r.demoted.join(', ')})` : ''}.`);
      await load();
    } catch (e: any) { setMsg(e.response?.data?.message ?? 'Impossible'); } finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <h2 style={{ margin: 0 }}>📦 Uploadeurs automatiques</h2>
      <p className="muted" style={{ margin: 0 }}>
        Un membre dont les torrents sont presque toujours approuvés du premier coup (sans correction demandée ni refus) devient <strong>Uploadeur</strong> : ses torrents sont ensuite approuvés dès l'envoi, sans passer par la modération.
        Pour garder le rang, il doit continuer à envoyer régulièrement, sans faute ni trop de signalements. L'évaluation tourne chaque nuit ; les Uploadeurs nommés à la main ne sont jamais rétrogradés automatiquement.
      </p>

      {isAdmin && (
        <>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => up('enabled', e.target.checked)} /> Promotion et rétrogradation automatiques activées</label>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {NUM.map((f) => (
              <label key={f.key} style={{ display: 'grid', gap: 3, fontSize: 13, maxWidth: 230 }}>{f.label}
                <input type="number" min={f.min} max={f.max} step={f.step ?? 1} value={cfg[f.key] as number} onChange={(e) => up(f.key, Number(e.target.value) as never)} style={{ width: 110 }} />
              </label>
            ))}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={save}>Enregistrer</button>
            <button type="button" className="secondary" disabled={busy} onClick={run}>Évaluer maintenant</button>
          </div>
        </>
      )}
      {msg && <span className="muted">{msg}</span>}

      <h3 style={{ margin: '4px 0 0' }}>Uploadeurs ({data.trusted.length})</h3>
      {data.trusted.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun Uploadeur pour l'instant.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Membre</th><th>Rang</th><th>Dernier envoi</th><th>Fautes</th><th>Signalements</th><th>Risque</th></tr></thead>
            <tbody>
              {data.trusted.map((t) => (
                <tr key={t.id}>
                  <td><UserLink user={t} /></td>
                  <td>{t.auto ? `automatique${t.since ? ` (${since(t.since)})` : ''}` : 'nommé à la main'}</td>
                  <td>{t.stats.daysSinceLastUpload === null ? 'jamais' : `il y a ${t.stats.daysSinceLastUpload} j`}</td>
                  <td>{t.stats.keep.faults}</td>
                  <td>{t.stats.keep.reports}</td>
                  <td style={{ color: t.risk.length ? 'var(--danger)' : undefined }}>{t.auto ? (t.risk.length ? t.risk.join(' ; ') : 'aucun') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ margin: '4px 0 0' }}>Proches du rang</h3>
      {data.candidates.length === 0 ? <p className="muted" style={{ margin: 0 }}>Personne n'a encore assez de torrents approuvés.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Membre</th><th>Approuvés</th><th>Du premier coup (période)</th><th>État</th></tr></thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr key={c.id}>
                  <td><UserLink user={c} /></td>
                  <td>{c.stats.approvedTotal}</td>
                  <td>{c.stats.window.approvedClean} / {c.stats.window.reviewed}</td>
                  <td>{c.ready ? <span style={{ color: 'var(--success)' }}>✅ sera promu à la prochaine évaluation</span> : <span className="muted">{c.missing.join(' ; ')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
