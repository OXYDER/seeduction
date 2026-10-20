import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import Loading from '../components/Loading';

interface Alert { id: string; name: string; query: Record<string, string>; summary: string; inApp: boolean; telegram: boolean; active: boolean; lastMatchAt: string | null; matchCount: number }
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };

/** Mes alertes de recherche (les séries suivies, avec leur compte à rebours, sont sur la page « Mes séries suivies ») : les recherches enregistrées depuis Parcourir, avec leur mode d'alerte. */
export default function Alerts() {
  const [data, setData] = useState<{ max: number; telegramLinked: boolean; items: Alert[] } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const load = () => api.get('/saved-searches').then((r) => setData(r.data)).catch((e) => setError(errorOf(e)));
  useEffect(() => { void load(); }, []);

  async function patch(a: Alert, body: Partial<Alert>) {
    setError('');
    try { await api.put(`/saved-searches/${a.id}`, body); await load(); } catch (e) { setError(errorOf(e)); }
  }
  async function remove(a: Alert) {
    if (!window.confirm(`Supprimer l'alerte « ${a.name} » ?`)) return;
    try { await api.delete(`/saved-searches/${a.id}`); await load(); } catch (e) { setError(errorOf(e)); }
  }
  async function checkNow(a: Alert) {
    setError(''); setNote('');
    try { const r = await api.post(`/saved-searches/${a.id}/check`); setNote(r.data.found > 0 ? `« ${a.name} » : ${r.data.found} nouveau${r.data.found > 1 ? 'x' : ''} torrent${r.data.found > 1 ? 's' : ''} (alerte envoyée).` : `« ${a.name} » : rien de nouveau depuis la dernière vérification.`); await load(); } catch (e) { setError(errorOf(e)); }
  }

  if (!data) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  return (
    <div className="grid">
      <h1 style={{ marginBottom: 0 }}>🔔 Mes alertes</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Une alerte garde une recherche de <Link to="/browse">Parcourir</Link> (mots et filtres) et te prévient dès qu'un nouveau torrent y correspond : dans la cloche du site, et si tu veux par Telegram.
        Le site vérifie toutes les 5 minutes. Pour en créer une, fais ta recherche dans Parcourir puis clique sur « 🔔 Alerte ». {data.items.length}/{data.max} alertes.
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {note && <p style={{ color: 'var(--success)' }}>{note}</p>}
      {data.items.length === 0 && <div className="panel muted">Aucune alerte pour l'instant.</div>}
      {data.items.map((a) => (
        <div key={a.id} className="panel" style={{ display: 'grid', gap: 8, opacity: a.active ? 1 : 0.65 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>{a.name}</strong> {!a.active && <span className="badge">en pause</span>}
              <div className="muted" style={{ fontSize: 13 }}>{a.summary}</div>
            </div>
            <div className="muted" style={{ fontSize: 13, textAlign: 'right' }}>
              {a.matchCount > 0 ? `${a.matchCount} torrent${a.matchCount > 1 ? 's' : ''} signalé${a.matchCount > 1 ? 's' : ''}${a.lastMatchAt ? ` · dernier ${timeAgo(a.lastMatchAt)}` : ''}` : 'Rien signalé pour l\'instant'}
            </div>
          </div>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={a.inApp} onChange={(e) => patch(a, { inApp: e.target.checked })} /> Cloche</label>
            <label className="row" style={{ gap: 6, opacity: data.telegramLinked ? 1 : 0.6 }} title={data.telegramLinked ? '' : "Relie d'abord ton compte à Telegram"}><input type="checkbox" style={{ width: 'auto' }} checked={a.telegram} disabled={!data.telegramLinked} onChange={(e) => patch(a, { telegram: e.target.checked })} /> Telegram</label>
            <Link className="button secondary" to={`/browse?${new URLSearchParams(a.query).toString()}`}>Voir les résultats</Link>
            <button type="button" className="secondary" onClick={() => checkNow(a)}>Vérifier maintenant</button>
            <button type="button" className="secondary" onClick={() => patch(a, { active: !a.active })}>{a.active ? 'Mettre en pause' : 'Réactiver'}</button>
            <button type="button" className="secondary" onClick={() => remove(a)}>🗑️ Supprimer</button>
          </div>
        </div>
      ))}
    </div>
  );
}
