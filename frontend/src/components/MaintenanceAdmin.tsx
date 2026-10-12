import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '../api/client';

const DEFAULT = 'Une petite mise à jour est en cours : le site peut être instable ou brièvement indisponible durant les 5 à 10 prochaines minutes. Merci de ta patience !';

/** Administration : annoncer une maintenance à tous les visiteurs (les mises à jour par deploy.sh l'annoncent toutes seules). */
export default function MaintenanceAdmin() {
  const [active, setActive] = useState<{ message: string; endsAt: string } | null>(null);
  const [message, setMessage] = useState(DEFAULT);
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => axios.get('/api/system/status').then((r) => setActive(r.data.maintenance)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function send(action: 'start' | 'end') {
    setBusy(true); setError('');
    try { await api.post('/system/maintenance/admin', { action, minutes, message }); await load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>🔧 Message de maintenance</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Affiche un bandeau à tous les visiteurs. Les mises à jour lancées par <code>./deploy.sh</code> l'affichent et le retirent automatiquement ; ce formulaire sert pour une maintenance manuelle.
        Il disparaît tout seul à la fin de la durée choisie.
      </p>
      {active && (
        <div className="panel" style={{ borderColor: '#fbbf24', marginBottom: 10 }}>
          <strong>Message actif</strong> jusqu'au {new Date(active.endsAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })} : {active.message}
          <div style={{ marginTop: 8 }}><button type="button" className="secondary" disabled={busy} onClick={() => send('end')}>Retirer le message maintenant</button></div>
        </div>
      )}
      <div className="grid" style={{ gap: 8 }}>
        <textarea rows={3} maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6, alignItems: 'center' }}>Durée
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[10, 15, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy || !message.trim()} onClick={() => send('start')}>Afficher le message</button>
        </div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>
    </div>
  );
}
