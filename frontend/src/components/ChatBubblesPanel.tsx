import { useState } from 'react';
import { api } from '../api/client';
import { useMessenger } from '../store/messenger';

/** Compte : bulles de discussion (conversations publiques et privées) sur le côté gauche du site. */
export default function ChatBubblesPanel({ value }: { value: boolean }) {
  const [on, setOn] = useState(value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function toggle(next: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      await api.patch('/users/me/chat-bubbles', { enabled: next });
      setOn(next);
      useMessenger.getState().setBubbles(next);
      setMessage(next ? '✓ Bulles activées' : '✓ Bulles désactivées');
    } catch (err: any) { setError(err.response?.data?.message ?? 'Modification impossible'); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3>💬 Bulles de discussion</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Sur ordinateur, les conversations (canaux publics, puis conversations privées et groupes) s'affichent en bulles sur le côté gauche du site, avec leurs messages non lus : un clic ouvre la conversation.
        Désactive-les si tu préfères n'utiliser que la page Chat.
      </p>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} /> Afficher les bulles de discussion
      </label>
      {message && <div style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
      {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
