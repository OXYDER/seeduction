import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Loading from '../components/Loading';
import Pager from '../components/Pager';

interface Item { id: string; at: string; actor: { id: string; username: string; role: string } | null; action: string; label: string; category: string; severity: 'info' | 'important' | 'grave'; summary: string; target: { kind: string; id?: string; label: string; link?: string } | null; ip: string | null }
interface Cat { key: string; label: string; icon: string; actions: { code: string; label: string }[] }
interface Data { total: number; page: number; pageSize: number; items: Item[]; actors: { id: string; username: string }[]; categories: Cat[] }

const SEV: Record<Item['severity'], { color: string; label: string }> = { info: { color: 'transparent', label: '' }, important: { color: '#ff9f2d', label: 'important' }, grave: { color: 'var(--danger, #e5384f)', label: 'sensible' } };
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });

/** Journal de modération : qui a fait quoi, sur qui ou sur quoi, filtrable par catégorie, action, membre de l'équipe, cible, texte et dates. Les filtres sont dans l'adresse de la page (lien partageable). */
export default function ModerationLog() {
  const role = useAuthStore((s) => s.user?.role ?? '');
  const isAdmin = ['ADMIN', 'OWNER'].includes(role);
  const [params, setParams] = useSearchParams();
  const f = { category: params.get('category') ?? '', action: params.get('action') ?? '', userId: params.get('userId') ?? '', targetId: params.get('targetId') ?? '', q: params.get('q') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const [typed, setTyped] = useState(f.q);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const key = params.toString();

  useEffect(() => {
    setError('');
    api.get('/staff/mod-log', { params: { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page } }).then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  }
  async function exportCsv() {
    try {
      const r = await api.get('/staff/mod-log/export', { params: Object.fromEntries(Object.entries(f).filter(([, v]) => v)), responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `journal-moderation-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { setError('Export impossible'); }
  }

  if (!data) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  const cat = data.categories.find((c) => c.key === f.category);
  const actions = (cat ? cat.actions : data.categories.flatMap((c) => c.actions)).slice().sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = Object.values(f).some(Boolean);
  const targetName = f.targetId ? (data.items.find((i) => i.target?.id === f.targetId)?.target?.label ?? 'cette cible') : '';
  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🧾 Journal de modération</h1>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/staff-board" className="button secondary">📋 Tableau de bord</Link>
          {isAdmin && <button type="button" className="secondary" onClick={exportCsv} title="Télécharger les lignes filtrées (5000 au plus)">⬇ Exporter en CSV</button>}
        </div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className={f.category ? 'secondary' : ''} onClick={() => set({ category: '', action: '' })}>Tout</button>
          {data.categories.map((c) => <button key={c.key} type="button" className={f.category === c.key ? '' : 'secondary'} onClick={() => set({ category: c.key, action: '' })}>{c.icon} {c.label}</button>)}
        </div>
        <form className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); set({ q: typed.trim() }); }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Membre de l'équipe
            <select value={f.userId} onChange={(e) => set({ userId: e.target.value })}><option value="">Tous</option>{data.actors.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Action
            <select value={f.action} onChange={(e) => set({ action: e.target.value })}><option value="">Toutes</option>{actions.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Du<input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Au<input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13, flex: '1 1 200px' }}>Recherche (nom, motif, torrent…)<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ex : spam, Dune, marie" /></label>
          <button type="submit">🔎</button>
          {filtered && <button type="button" className="secondary" onClick={() => { setTyped(''); setParams({}, { replace: true }); }}>Effacer les filtres</button>}
        </form>
        {f.targetId && <div className="muted" style={{ fontSize: 13 }}>Filtré sur tout ce qui concerne <strong>{targetName}</strong> · <button type="button" className="link" onClick={() => set({ targetId: '' })}>voir tout</button></div>}
      </div>

      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>{data.total.toLocaleString('fr-CA')} ligne{data.total > 1 ? 's' : ''}</div>
        {data.items.length === 0 ? <span className="muted">Aucune action ne correspond.</span> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Quand</th><th>Qui</th><th>Quoi</th><th>Sur</th><th>Détail</th>{isAdmin && <th>IP</th>}</tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} style={{ boxShadow: `inset 3px 0 0 ${SEV[i.severity].color}` }}>
                    <td style={{ whiteSpace: 'nowrap' }} title={i.at}>{when(i.at)}</td>
                    <td>{i.actor ? <button type="button" className="link" onClick={() => set({ userId: i.actor!.id })} title="Filtrer sur cette personne">{i.actor.username}</button> : '—'}</td>
                    <td>{i.label} {SEV[i.severity].label && <span className="badge" style={{ borderColor: SEV[i.severity].color }}>{SEV[i.severity].label}</span>}</td>
                    <td>{i.target ? (<>{i.target.link ? <Link to={i.target.link}>{i.target.label}</Link> : i.target.label}{i.target.id && <> <button type="button" className="link" onClick={() => set({ targetId: i.target!.id! })} title="Voir tout ce qui concerne cette cible">🔎</button></>}</>) : '—'}</td>
                    <td className="muted" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{i.summary}</td>
                    {isAdmin && <td className="muted" style={{ fontSize: 12 }}>{i.ip ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && <Pager page={page} total={data.total} pageSize={data.pageSize} unit="ligne" onPage={(p) => set({ page: String(p) })} scrollTop />}
      </div>
      <small className="muted">Les connexions et les événements de sécurité du compte ne sont pas ici. {isAdmin ? 'Les réglages du site, les dons et la sécurité ne sont visibles que par les administrateurs.' : 'Les réglages du site et la sécurité ne sont visibles que par les administrateurs.'}</small>
    </div>
  );
}
