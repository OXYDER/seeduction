import { useState } from 'react';
import { api } from '../api/client';
import { VIEW_MODES, applyDefaultView, type ViewMode } from '../lib/viewMode';

/** Affichage par défaut des listes de torrents (Parcourir, favoris, collections...). Chaque page peut ensuite être changée ponctuellement. */
export default function DefaultViewPanel({ value }: { value?: string }) {
  const [current, setCurrent] = useState<string>(value ?? 'grid');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function choose(view: ViewMode) {
    if (view === current) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.patch('/users/me/default-view', { view });
      setCurrent(view);
      // Un choix ponctuel fait ailleurs sur le site ne doit pas masquer ce nouveau réglage par défaut.
      applyDefaultView(view, { clearOverrides: true });
      setMessage('✓ Enregistré — appliqué à toutes tes listes');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3>🗂️ Affichage des listes de torrents</h3>
      <p className="muted">
        Comment les torrents s'affichent par défaut partout sur le site. Tu peux toujours changer l'affichage d'une page
        précise avec les boutons en haut de la liste.
      </p>
      <div className="view-choices">
        {VIEW_MODES.map((m) => (
          <button key={m.id} type="button" disabled={busy} className={`view-choice${current === m.id ? ' on' : ''}`} onClick={() => choose(m.id)} aria-pressed={current === m.id}>
            <span className="view-choice-icon" aria-hidden="true">{m.icon}</span>
            <strong>{m.label}</strong>
            <span className="muted">{m.hint}</span>
          </button>
        ))}
      </div>
      {message && <div className="muted" style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
