import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

/** Points bonus, boutique, jetons freeleech et suivi des « hit & run ». */
export default function Bonus() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  function load() {
    api.get('/bonus/me').then((r) => setData(r.data)).catch(() => setError('Impossible de charger tes points bonus'));
  }
  useEffect(load, []);

  async function buy(id: string) {
    setBusy(id);
    setMessage('');
    setError('');
    try {
      const { data: res } = await api.post('/bonus/redeem', { item: id });
      setMessage(res.inviteCode ? `✓ Achat effectué. Ton code d'invitation : ${res.inviteCode} (valable 7 jours)` : '✓ Achat effectué');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Achat impossible');
    } finally {
      setBusy('');
    }
  }

  if (!data) return <p className="muted">{error || 'Chargement...'}</p>;

  const { rules } = data;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>🎁 Points bonus</h1>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <div className="panel"><div className="muted">Solde</div><div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gold-bright)' }}>{Math.floor(data.points)}</div></div>
        <div className="panel"><div className="muted">Gain actuel</div><div style={{ fontSize: 26, fontWeight: 700 }}>+{data.perHour}<span className="muted"> / heure</span></div><div className="muted">{data.seedingCount} torrent(s) seedé(s)</div></div>
        <div className="panel"><div className="muted">Jetons freeleech</div><div style={{ fontSize: 26, fontWeight: 700 }}>{data.tokens}</div></div>
      </div>

      {data.freeleechUntil && (
        <div className="panel ornate">🎉 <strong>Freeleech global</strong> jusqu'au {new Date(data.freeleechUntil).toLocaleString('fr-FR')} : tes téléchargements ne comptent pas dans ton ratio.</div>
      )}

      <div className="panel">
        <h3>Boutique</h3>
        <p className="muted">Tu gagnes {1} point par heure et par torrent que tu seedes réellement. Seeder longtemps rapporte donc davantage que d'en seeder beaucoup peu de temps.</p>
        {message && <div style={{ color: 'var(--success)', marginBottom: 8 }}>{message}</div>}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          {data.shop.map((item: any) => (
            <div key={item.id} className="panel" style={{ background: 'var(--bg-panel)' }}>
              <strong>{item.label}</strong>
              <div className="muted" style={{ margin: '4px 0 10px' }}>{item.description}</div>
              <button type="button" disabled={busy === item.id || data.points < item.cost} onClick={() => buy(item.id)}>
                Acheter — {item.cost} pts
              </button>
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Un jeton freeleech se dépense sur la page d'un torrent (bouton « Utiliser un jeton »).</p>
      </div>

      <div className="panel">
        <h3>Règle du seed (« hit & run »)</h3>
        <p className="muted">
          Après avoir complété un téléchargement, seede-le au moins <strong>{rules.hnrSeedHours} h</strong> (ou jusqu'à un ratio de <strong>{rules.hnrRatio}</strong> sur ce torrent).
          Si tu l'abandonne avant, {rules.hnrGraceHours} h après la fin du téléchargement, tu reçois un avertissement automatique.
          À {rules.hnrLimit} torrents abandonnés non régularisés, les nouveaux téléchargements sont bloqués jusqu'à ce que tu reprennes leur seed.
          Le ratio minimum ne s'applique qu'après {rules.ratioGraceGb} Go téléchargés.
        </p>
        {data.unresolved.length === 0 ? (
          <p style={{ color: 'var(--success)' }}>✓ Aucun hit & run à régulariser.</p>
        ) : (
          <table>
            <thead><tr><th>Torrent à reseeder</th><th>Seed cumulé</th><th>Complété le</th></tr></thead>
            <tbody>
              {data.unresolved.map((u: any) => (
                <tr key={u.id}>
                  <td><Link to={`/torrents/${u.torrentId}`}>{u.name}</Link></td>
                  <td className="muted">{u.seedHours} h / {rules.hnrSeedHours} h</td>
                  <td className="muted">{new Date(u.completedAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
