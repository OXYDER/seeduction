import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Cfg { enabled: boolean; percent: number; maxPerTorrentGb: number; dailyMaxGb: number; requireSeeding: boolean; startedAt: string | null }

/** Admin > Paramètres : crédit d'envoi accordé à l'approbation d'un torrent. */
export default function AdminUploadCredit() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/upload-credit/admin').then((r) => setCfg(r.data)).catch(() => setErr('Chargement impossible')); }, []);
  if (!cfg) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (key: 'percent' | 'maxPerTorrentGb' | 'dailyMaxGb', label: string, hint: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} value={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })} style={{ width: 110 }} />
      <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>
    </label>
  );

  async function save() {
    setMsg(''); setErr('');
    try { setCfg((await api.put('/upload-credit/admin', cfg)).data); setMsg('✓ Réglages enregistrés'); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🎁 Crédit d'envoi à l'approbation</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Quand un torrent est approuvé, une part de sa taille s'ajoute à l'upload de son uploader, même si personne ne l'a encore téléchargé.
        Le crédit est repris si le torrent est rejeté ou supprimé. Le robot d'import n'en reçoit pas. Activé le {cfg.startedAt ? new Date(cfg.startedAt).toLocaleString('fr-CA') : '…'} : les torrents approuvés avant ne sont pas crédités.
      </p>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Crédit d'envoi activé</label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {num('percent', 'Part de la taille (%)', '25 = un quart')}
        {num('maxPerTorrentGb', 'Maximum par torrent (Go)', 'Plafonne les très gros torrents')}
        {num('dailyMaxGb', 'Maximum par jour et par membre (Go)', '0 = sans limite')}
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.requireSeeding} onChange={(e) => setCfg({ ...cfg, requireSeeding: e.target.checked })} /> L'uploader doit seeder le torrent (sinon le crédit attend, et est versé dès qu'il seede, pendant 30 jours)</label>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
