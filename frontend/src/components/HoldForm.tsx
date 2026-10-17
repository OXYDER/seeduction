import { useState } from 'react';
import { HOLD_REASONS } from '../lib/holdReasons';

/**
 * Staff : demander une modification au membre. Le torrent est mis en suspens (il reste « en attente » mais sort de la file à examiner) et le membre reçoit
 * une notification avec les motifs et ton message ; il corrige puis renvoie le torrent en validation.
 */
export default function HoldForm({ onConfirm, onCancel, busy }: { onConfirm: (hold: { reasons: string[]; note: string }) => void; onCancel: () => void; busy?: boolean }) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const toggle = (k: string) => setReasons((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]));
  const ready = reasons.length > 0 || note.trim().length > 0;
  return (
    <div className="reject-box hold-box">
      <strong>⏸ Demander une modification au membre</strong>
      <div className="hold-reasons">
        {Object.entries(HOLD_REASONS).map(([k, label]) => (
          <label key={k} className="hold-reason"><input type="checkbox" checked={reasons.includes(k)} onChange={() => toggle(k)} /> {label}</label>
        ))}
      </div>
      <textarea value={note} maxLength={600} rows={3} placeholder="Message au membre (facultatif si un motif est coché) : explique quoi corriger" onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" disabled={busy || !ready} onClick={() => onConfirm({ reasons, note })}>⏸ Mettre en suspens et prévenir le membre</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <span className="muted" style={{ fontSize: 12 }}>Le membre est notifié ; le torrent revient dans ta file quand il l'a corrigé.</span>
      </div>
    </div>
  );
}
