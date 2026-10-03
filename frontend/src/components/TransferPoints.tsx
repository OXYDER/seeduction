import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Props {
  /** Destinataire connu (page de profil) ; sinon on demande son pseudo (boutique). */
  to?: { id: string; username: string };
  onDone?: () => void;
  onCancel?: () => void;
}

/** Envoi de points bonus à un autre membre. */
export default function TransferPoints({ to, onDone, onCancel }: Props) {
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('100');
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState<{ min: number; dailyMax: number; leftToday: number } | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/bonus/transfers').then((r) => setInfo(r.data)).catch(() => {}); }, [ok]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = to?.username ?? username.trim();
    if (!name) return;
    if (!window.confirm(`Envoyer ${Number(amount)} points bonus à ${name} ? Cette action est définitive.`)) return;
    setBusy(true); setError(''); setOk('');
    try {
      const { data } = await api.post('/bonus/transfer', { ...(to ? { userId: to.id } : { username: name }), amount: Number(amount), message: message || undefined });
      setOk(`✓ ${data.amount} points envoyés à ${data.to}`);
      setMessage('');
      onDone?.();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Transfert impossible'); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="transfer-form">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {!to && <input placeholder="Pseudo du membre" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} required style={{ minWidth: 160 }} />}
        <input type="number" min={info?.min ?? 1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required aria-label="Montant en points" style={{ width: 110 }} />
        <span className="muted">points</span>
        <input placeholder="Petit mot (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={140} style={{ flex: 1, minWidth: 160 }} />
        <button type="submit" disabled={busy}>Envoyer</button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Fermer</button>}
      </div>
      {info && <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Minimum {info.min} points · tu peux encore envoyer {info.leftToday} points aujourd'hui (maximum {info.dailyMax} par 24 h).</p>}
      {ok && <div style={{ color: 'var(--success)', marginTop: 6 }}>{ok}</div>}
      {error && <div style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
    </form>
  );
}
