import { useEffect, useState } from 'react';
import FreeleechCalendar from '../components/FreeleechCalendar';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import TransferPoints from '../components/TransferPoints';
import { timeAgo } from '../lib/time';

/** Points bonus, boutique, jetons freeleech et suivi des « hit & run ». */
export default function Bonus() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [transfers, setTransfers] = useState<any>(null);

  function load() {
    api.get('/bonus/me').then((r) => setData(r.data)).catch(() => setError('Impossible de charger tes points bonus'));
  }
  const loadTransfers = () => api.get('/bonus/transfers').then((r) => setTransfers(r.data)).catch(() => {});
  useEffect(() => { load(); void loadTransfers(); }, []);

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
      <FreeleechCalendar />
      <div className="panel"><Link to="/pot">🍯 <strong>Le pot commun</strong></Link> <span className="muted">— verse des points avec les autres membres : quand le pot est plein, freeleech global pour tout le monde.</span></div>

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
        <h3 style={{ marginTop: 0 }}>🤝 Transférer des points à un membre</h3>
        <p className="muted" style={{ marginTop: 0 }}>Envoie des points bonus à un autre membre (un cadeau, un remerciement…). Tu peux aussi le faire depuis son profil.</p>
        <TransferPoints onDone={() => { load(); void loadTransfers(); }} />
        {transfers && transfers.items.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Quand</th><th>Membre</th><th style={{ textAlign: 'right' }}>Points</th><th>Message</th></tr></thead>
            <tbody>
              {transfers.items.map((t: any) => (
                <tr key={t.id}>
                  <td className="muted">{timeAgo(t.createdAt)}</td>
                  <td>{t.direction === 'out' ? '→ ' : '← '}<Link to={`/users/${t.other.id}`}>{t.other.username}</Link></td>
                  <td style={{ textAlign: 'right', color: t.direction === 'out' ? 'var(--danger)' : 'var(--success)' }}>{t.direction === 'out' ? '−' : '+'}{t.amount}</td>
                  <td className="muted">{t.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Règle du seed</h3>
        <p className="muted" style={{ margin: 0 }}>
          Après avoir complété un téléchargement, seede-le au moins <strong>{rules.hnrSeedHours} h</strong> (ou jusqu'à un ratio de <strong>{rules.hnrRatio}</strong> sur ce torrent).
          Suis ton avancement sur <Link to="/seeds">🌱 Mes seeds</Link> ; les hit & run confirmés ({data.unresolved.length} actuellement) sont sur la page <Link to="/hit-and-run">⚠️ Hit & run</Link>.
          Le ratio minimum ne s'applique qu'après {rules.ratioGraceGb} Go téléchargés.
        </p>
      </div>
    </div>
  );
}
