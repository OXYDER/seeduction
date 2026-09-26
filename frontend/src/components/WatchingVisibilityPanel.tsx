import { useState } from 'react';
import { api } from '../api/client';

/** Afficher ou non « 🎬 Regarde X » à ta place (menu, infobulle) quand le lecteur Seeduction joue un fichier. */
export default function WatchingVisibilityPanel({ value }: { value: boolean }) {
  const [enabled, setEnabled] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(next: boolean) {
    if (next === enabled) return;
    setBusy(true);
    setError('');
    try {
      await api.patch('/users/me/watching-visibility', { enabled: next });
      setEnabled(next);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3>🎬 Lecteur Seeduction</h3>
      <p className="muted">
        Afficher « 🎬 Regarde... » à ta place pendant que le lecteur Seeduction joue un fichier (jamais pour du
        contenu adulte, quel que soit ce réglage).
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={enabled ? '' : 'secondary'} disabled={busy} onClick={() => change(true)}>Afficher</button>
        <button type="button" className={!enabled ? '' : 'secondary'} disabled={busy} onClick={() => change(false)}>Ne pas afficher</button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
