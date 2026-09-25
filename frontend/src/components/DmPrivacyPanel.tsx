import { useState } from 'react';
import { api } from '../api/client';

/** Qui peut t'écrire en chat privé sans être ton ami — tout le monde par défaut, comme une demande de message Messenger. */
export default function DmPrivacyPanel({ value }: { value: 'EVERYONE' | 'FRIENDS_ONLY' }) {
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(next: 'EVERYONE' | 'FRIENDS_ONLY') {
    if (next === current) return;
    setBusy(true);
    setError('');
    try {
      await api.patch('/users/me/dm-privacy', { value: next });
      setCurrent(next);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3>💬 Chat privé</h3>
      <p className="muted">Qui peut t'envoyer un message privé sans être ton ami.</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={current === 'EVERYONE' ? '' : 'secondary'} disabled={busy} onClick={() => change('EVERYONE')}>
          Tout le monde
        </button>
        <button type="button" className={current === 'FRIENDS_ONLY' ? '' : 'secondary'} disabled={busy} onClick={() => change('FRIENDS_ONLY')}>
          Mes amis seulement
        </button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
