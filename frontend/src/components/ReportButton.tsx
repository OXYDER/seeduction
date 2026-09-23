import { useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

/** Bouton « Signaler » : ouvre un petit formulaire de motif et l'envoie au staff. */
export default function ReportButton({ targetType, targetId, label = '🚩 Signaler', compact }: {
  targetType: 'torrent' | 'user' | 'forumPost' | 'comment';
  targetId: string;
  label?: string;
  compact?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');

  if (!user) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      await api.post('/reports', { targetType, targetId, reason });
      setState('done');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi impossible');
      setState('idle');
    }
  }

  if (state === 'done') return <span className="muted" style={{ fontSize: 12 }}>✓ Signalé au staff, merci</span>;

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="secondary"
        style={compact ? { padding: '3px 10px', fontSize: 12 } : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <form onSubmit={send} className="panel ornate grid" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 40, width: 300, padding: 12, gap: 8 }}>
          <div className="muted">Pourquoi signales-tu cet élément ?</div>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Explique brièvement le problème..." autoFocus />
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          <div className="row">
            <button type="submit" disabled={state === 'sending' || reason.trim().length < 5}>Envoyer</button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </form>
      )}
    </span>
  );
}
