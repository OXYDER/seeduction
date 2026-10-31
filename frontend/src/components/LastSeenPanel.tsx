import { useState } from 'react';
import { api } from '../api/client';

/** Montrer ou cacher « Vu la dernière fois il y a… » (profil, chat privé, amis). Caché aussi quand tu apparais hors ligne ou anonyme ; l'équipe du site le voit toujours. */
export default function LastSeenPanel({ value }: { value: boolean }) {
  const [enabled, setEnabled] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(next: boolean) {
    if (next === enabled) return;
    setBusy(true); setError('');
    try {
      await api.patch('/users/me/last-seen-visibility', { enabled: next });
      setEnabled(next);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3>🕒 Dernière connexion</h3>
      <p className="muted">
        Montrer aux autres membres « Vu la dernière fois il y a… » sur ton profil, dans le chat privé et dans la liste d'amis. Si tu apparais hors ligne ou anonyme, elle reste cachée.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={enabled ? '' : 'secondary'} disabled={busy} onClick={() => change(true)}>Afficher</button>
        <button type="button" className={!enabled ? '' : 'secondary'} disabled={busy} onClick={() => change(false)}>Ne pas afficher</button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
