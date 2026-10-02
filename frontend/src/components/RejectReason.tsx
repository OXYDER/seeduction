import { useState } from 'react';

const PRESETS = ['Doublon', 'Qualité insuffisante', 'Description incomplète', 'Mauvaise catégorie', 'Fichier faux ou corrompu', 'Contenu non autorisé'];

/** Choix rapide d'un motif de rejet (le membre qui a envoyé le torrent le reçoit dans sa notification). */
export default function RejectReason({ onConfirm, onCancel, busy }: { onConfirm: (reason: string) => void; onCancel: () => void; busy?: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div className="reject-box">
      <div className="reject-presets">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`secondary${reason === p ? ' on' : ''}`} onClick={() => setReason(p)}>{p}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input value={reason} maxLength={300} placeholder="Motif (facultatif, envoyé au membre)" onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(reason); if (e.key === 'Escape') onCancel(); }} autoFocus style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="danger" disabled={busy} onClick={() => onConfirm(reason)}>Rejeter</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
