import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Avatar from './Avatar';

interface Tier { minAmount: number; label: string; days: number; freeleechDays: number; hnrDays: number; bonusPoints: number; invites: number }
interface Config { enabled: boolean; currency: string; headline: string; text: string; howTo: string; links: { label: string; url: string }[]; goalMonthly: number; tiers: Tier[] }
interface Overview {
  config: Config;
  recent: { id: string; amount: number; currency: string; note: string | null; tierLabel: string | null; recordedByName: string; receivedAt: string; user: { id: string; username: string; avatarUrl: string | null } }[];
  totals: { month: number; monthCount: number; year: number; all: number; count: number; activeDonors: number };
}
const errorOf = (e: any) => e?.response?.data?.message ?? 'Action impossible';

/** Administration des dons : inscrire un don reçu (les avantages se versent aussitôt), régler les liens, l'objectif du mois et les avantages de chaque palier. */
export default function AdminDonations() {
  const [data, setData] = useState<Overview | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', amount: '', note: '', receivedAt: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/donations/admin').then((r) => { setData(r.data); setCfg((c) => c ?? r.data.config); }).catch((e) => setError(errorOf(e))), []);
  useEffect(() => { load(); }, [load]);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const d = (await api.post('/donations/admin/record', { username: form.username, amount: Number(form.amount), note: form.note || undefined, receivedAt: form.receivedAt || undefined })).data;
      setNotice(`✓ Don de ${d.amount} ${d.currency} inscrit${d.tierLabel ? ` (palier « ${d.tierLabel} »)` : ' (sous le premier palier : statut donateur seulement)'} : avantages versés, membre notifié.`);
      setForm({ username: '', amount: '', note: '', receivedAt: '' });
      load();
    } catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  }

  async function saveConfig() {
    if (!cfg) return;
    setBusy(true); setError(''); setNotice('');
    try { const saved = (await api.put('/donations/admin/config', cfg)).data; setCfg(saved); setNotice('✓ Réglages enregistrés.'); load(); }
    catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  }

  if (!data || !cfg) return <p className="muted">{error || 'Chargement…'}</p>;
  const setTier = (i: number, patch: Partial<Tier>) => setCfg({ ...cfg, tiers: cfg.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const numInput = (v: number, on: (n: number) => void, w = 80) => <input type="number" min={0} style={{ width: w }} value={v} onChange={(e) => on(Number(e.target.value) || 0)} />;

  return (
    <div className="grid" style={{ gap: 14 }}>
      {notice && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{notice}</div>}
      {error && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div className="panel"><div className="muted">Ce mois-ci</div><strong style={{ fontSize: 22 }}>{data.totals.month.toLocaleString('fr-CA')} {cfg.currency}</strong><div className="muted" style={{ fontSize: 12 }}>{data.totals.monthCount} don{data.totals.monthCount > 1 ? 's' : ''}</div></div>
        <div className="panel"><div className="muted">Cette année</div><strong style={{ fontSize: 22 }}>{data.totals.year.toLocaleString('fr-CA')} {cfg.currency}</strong></div>
        <div className="panel"><div className="muted">Depuis le début</div><strong style={{ fontSize: 22 }}>{data.totals.all.toLocaleString('fr-CA')} {cfg.currency}</strong><div className="muted" style={{ fontSize: 12 }}>{data.totals.count} dons</div></div>
        <div className="panel"><div className="muted">Donateurs actifs</div><strong style={{ fontSize: 22 }}>{data.totals.activeDonors}</strong></div>
      </div>

      <form className="panel" onSubmit={record}>
        <h3 style={{ marginTop: 0 }}>➕ Inscrire un don reçu</h3>
        <p className="muted" style={{ marginTop: 0 }}>Une fois le don reçu sur la plateforme, inscris-le ici : le palier atteint verse tout de suite les avantages (statut ❤️, freeleech, hit &amp; run désactivé, points, invitations) et le membre est notifié.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="grid" style={{ gap: 3 }}><span className="muted">Pseudo du membre</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required style={{ width: 200 }} /></label>
          <label className="grid" style={{ gap: 3 }}><span className="muted">Montant ({cfg.currency})</span><input type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required style={{ width: 120 }} /></label>
          <label className="grid" style={{ gap: 3 }}><span className="muted">Date (facultatif)</span><input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label>
          <label className="grid" style={{ gap: 3, flex: 1, minWidth: 180 }}><span className="muted">Note (plateforme, référence…)</span><input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button type="submit" disabled={busy}>Inscrire le don</button>
        </div>
      </form>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Derniers dons</h3>
        {data.recent.length === 0 ? <p className="muted">Aucun don inscrit.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Date</th><th>Membre</th><th>Montant</th><th>Palier</th><th>Note</th><th>Inscrit par</th></tr></thead>
              <tbody>
                {data.recent.map((d) => (
                  <tr key={d.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(d.receivedAt).toLocaleDateString('fr-CA')}</td>
                    <td><span className="row" style={{ gap: 6, alignItems: 'center' }}><Avatar user={d.user} size={22} />{d.user.username}</span></td>
                    <td><strong>{d.amount} {d.currency}</strong></td>
                    <td>{d.tierLabel ?? <span className="muted">—</span>}</td>
                    <td className="muted">{d.note ?? ''}</td>
                    <td className="muted">{d.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Réglages de la page « Soutenir »</h3>
        <div className="grid" style={{ gap: 10 }}>
          <label className="row" style={{ gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Page ouverte aux membres</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <label className="grid" style={{ gap: 3, flex: 1, minWidth: 220 }}><span className="muted">Titre</span><input value={cfg.headline} onChange={(e) => setCfg({ ...cfg, headline: e.target.value })} /></label>
            <label className="grid" style={{ gap: 3 }}><span className="muted">Devise</span><input value={cfg.currency} maxLength={6} style={{ width: 80 }} onChange={(e) => setCfg({ ...cfg, currency: e.target.value })} /></label>
            <label className="grid" style={{ gap: 3 }}><span className="muted">Objectif mensuel</span>{numInput(cfg.goalMonthly, (n) => setCfg({ ...cfg, goalMonthly: n }), 120)}</label>
          </div>
          <label className="grid" style={{ gap: 3 }}><span className="muted">Texte d'introduction</span><textarea rows={4} value={cfg.text} onChange={(e) => setCfg({ ...cfg, text: e.target.value })} /></label>
          <label className="grid" style={{ gap: 3 }}><span className="muted">Comment donner (étapes)</span><textarea rows={3} value={cfg.howTo} onChange={(e) => setCfg({ ...cfg, howTo: e.target.value })} /></label>

          <div>
            <strong>Liens de don</strong> <span className="muted">(Ko-fi, Liberapay, PayPal.me… adresses https)</span>
            {cfg.links.map((l, i) => (
              <div key={i} className="row" style={{ gap: 6, marginTop: 6 }}>
                <input placeholder="Nom (ex. Ko-fi)" value={l.label} style={{ width: 160 }} onChange={(e) => setCfg({ ...cfg, links: cfg.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input placeholder="https://…" value={l.url} style={{ flex: 1 }} onChange={(e) => setCfg({ ...cfg, links: cfg.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                <button type="button" className="secondary" onClick={() => setCfg({ ...cfg, links: cfg.links.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            {cfg.links.length < 6 && <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setCfg({ ...cfg, links: [...cfg.links, { label: '', url: '' }] })}>＋ Ajouter un lien</button>}
          </div>

          <div>
            <strong>Paliers et avantages</strong> <span className="muted">(le palier le plus haut dont le montant est atteint s'applique ; 0 = pas cet avantage)</span>
            <div style={{ overflowX: 'auto', marginTop: 6 }}>
              <table>
                <thead><tr><th>Nom</th><th>Dès ({cfg.currency})</th><th>Statut (jours)</th><th>Freeleech (jours)</th><th>Hit &amp; run off (jours)</th><th>Points bonus</th><th>Invitations +</th><th /></tr></thead>
                <tbody>
                  {cfg.tiers.map((t, i) => (
                    <tr key={i}>
                      <td><input value={t.label} style={{ width: 130 }} onChange={(e) => setTier(i, { label: e.target.value })} /></td>
                      <td>{numInput(t.minAmount, (n) => setTier(i, { minAmount: n }), 80)}</td>
                      <td>{numInput(t.days, (n) => setTier(i, { days: n }))}</td>
                      <td>{numInput(t.freeleechDays, (n) => setTier(i, { freeleechDays: n }))}</td>
                      <td>{numInput(t.hnrDays, (n) => setTier(i, { hnrDays: n }))}</td>
                      <td>{numInput(t.bonusPoints, (n) => setTier(i, { bonusPoints: n }), 90)}</td>
                      <td>{numInput(t.invites, (n) => setTier(i, { invites: n }), 60)}</td>
                      <td><button type="button" className="secondary" onClick={() => setCfg({ ...cfg, tiers: cfg.tiers.filter((_, j) => j !== i) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cfg.tiers.length < 8 && <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setCfg({ ...cfg, tiers: [...cfg.tiers, { minAmount: 5, label: 'Nouveau palier', days: 30, freeleechDays: 0, hnrDays: 0, bonusPoints: 0, invites: 0 }] })}>＋ Ajouter un palier</button>}
          </div>
          <div><button type="button" disabled={busy} onClick={saveConfig}>Enregistrer les réglages</button></div>
        </div>
      </div>
    </div>
  );
}
