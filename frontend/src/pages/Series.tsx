import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

interface Item {
  id: string; title: string; cover: string | null; status: string | null;
  next: { label: string; name: string | null; airDate: string | null; days: number | null; countdown: string } | null;
  last: { label: string; airDate: string | null } | null;
  latestOnSite: { torrentId: string; label: string } | null;
  nextOnSite: string | null;
}

const STATUS: Record<string, string> = { 'Returning Series': 'En cours', Ended: 'Terminée', Canceled: 'Annulée', 'In Production': 'En production', Planned: 'Prévue', Pilot: 'Pilote' };
const dateFr = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });

/** Mes séries suivies : le prochain épisode de chacune avec son compte à rebours, et ce qui est déjà sur Seeduction. */
export default function Series() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const load = () => api.get('/series-follow').then((r) => setItems(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  useEffect(() => { void load(); }, []);
  async function remove(i: Item) {
    if (!window.confirm('Ne plus suivre « ' + i.title + ' » ?')) return;
    try { await api.delete('/series-follow/' + i.id); await load(); } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible'); }
  }
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!items) return <Loading />;

  return (
    <div className="grid">
      <h1 style={{ margin: 0 }}>🔔 Mes séries suivies</h1>
      <p className="muted" style={{ margin: 0 }}>Tu es prévenu la veille de la sortie du prochain épisode, le jour même, puis dès qu'un torrent de cet épisode est approuvé sur Seeduction (cloche, notifications push, Telegram selon tes réglages). Pour suivre une série, ouvre la fiche d'un de ses torrents et clique « 🔔 Suivre cette série ». Les alertes sur des recherches précises sont dans <Link to="/alerts">Mes alertes</Link>.</p>
      {items.length === 0 ? <div className="panel"><p style={{ margin: 0 }}>Tu ne suis aucune série pour l'instant. <Link to="/browse">Parcourir les séries</Link></p></div> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
          {items.map((i) => (
            <div key={i.id} className="panel" style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 12 }}>
              <div style={{ width: 84, aspectRatio: '2 / 3', borderRadius: 8, overflow: 'hidden', background: 'rgba(8,10,22,0.7)', display: 'grid', placeItems: 'center' }}>
                {i.cover ? <img src={i.cover} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28 }}>📺</span>}
              </div>
              <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
                <strong style={{ fontSize: 16 }}>{i.title}</strong>
                {i.status && <span className="muted" style={{ fontSize: 12 }}>{STATUS[i.status] ?? i.status}</span>}
                {i.next ? (
                  <div>
                    <div style={{ color: 'var(--gold-bright)', fontWeight: 800, fontSize: 18 }}>{i.next.countdown}</div>
                    <div style={{ fontSize: 13 }}>{i.next.label}{i.next.name ? ' « ' + i.next.name + ' »' : ''}</div>
                    {i.next.airDate && <div className="muted" style={{ fontSize: 12 }}>{dateFr(i.next.airDate)}</div>}
                    {i.nextOnSite && <Link to={'/torrents/' + i.nextOnSite} style={{ fontSize: 13 }}>✅ Déjà sur Seeduction</Link>}
                  </div>
                ) : <span className="muted" style={{ fontSize: 13 }}>{i.status === 'Ended' || i.status === 'Canceled' ? 'Série terminée : plus d\'épisode à venir.' : 'Aucun épisode annoncé pour l\'instant.'}</span>}
                <div className="row" style={{ gap: 10, flexWrap: 'wrap', fontSize: 12.5, marginTop: 4 }}>
                  {i.latestOnSite && <Link to={'/torrents/' + i.latestOnSite.torrentId}>Dernier sur Seeduction : {i.latestOnSite.label}</Link>}
                  <button type="button" className="secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => remove(i)}>Ne plus suivre</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
