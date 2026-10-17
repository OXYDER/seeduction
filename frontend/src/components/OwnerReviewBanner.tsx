import { useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { HOLD_REASONS } from '../lib/holdReasons';

interface Props {
  torrent: { id: string; status: string; holdAt?: string | null; holdReasons?: string[]; holdNote?: string | null; holdByName?: string | null; resubmittedAt?: string | null; resubmitNote?: string | null; rejectReason?: string | null };
  onEdit: () => void;
  onPatch: (patch: Record<string, any>) => void;
}

/**
 * Bandeau du membre sur SON torrent non approuvé : où il en est (en attente, correction demandée, rejeté), ce que l'équipe a demandé, le bouton pour modifier
 * et, si une correction est demandée, le bouton « J'ai corrigé » qui renvoie le torrent en validation.
 */
export default function OwnerReviewBanner({ torrent, onEdit, onPatch }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!['PENDING', 'REJECTED'].includes(torrent.status)) return null;

  async function resubmit() {
    setBusy(true); setError('');
    try {
      await api.post(`/my-torrents/${torrent.id}/resubmit`, { message });
      onPatch({ holdAt: null, resubmittedAt: new Date().toISOString(), resubmitNote: message.trim() || null });
    } catch (e: any) { setError(e.response?.data?.message ?? 'Envoi impossible'); }
    finally { setBusy(false); }
  }

  const hold = torrent.status === 'PENDING' && !!torrent.holdAt;
  return (
    <div className={`panel owner-banner${hold || torrent.status === 'REJECTED' ? ' attention' : ''}`} role="region" aria-label="État de ton torrent">
      {hold ? (
        <>
          <strong>✏️ L'équipe te demande de corriger ce torrent</strong>
          <ul className="owner-banner-list">
            {(torrent.holdReasons ?? []).map((r) => <li key={r}>{HOLD_REASONS[r] ?? r}</li>)}
          </ul>
          {torrent.holdNote && <p className="owner-banner-note">« {torrent.holdNote} » <span className="muted">— {torrent.holdByName ?? 'l\'équipe'}{torrent.holdAt ? `, ${timeAgo(torrent.holdAt)}` : ''}</span></p>}
          <div className="muted" style={{ fontSize: 13 }}>Corrige avec le bouton <strong>✏️ Modifier mon torrent</strong> (nom, catégorie, fiche, description, NFO...). Si le problème est le seed, remets le torrent de Seeduction dans ton client. Puis renvoie-le en validation :</div>
          <textarea value={message} maxLength={400} rows={2} placeholder="Message pour l'équipe (facultatif) : ce que tu as corrigé" onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', marginTop: 6 }} />
          <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={resubmit}>✅ J'ai corrigé : renvoyer en validation</button>
            <button type="button" className="secondary" onClick={onEdit}>✏️ Modifier mon torrent</button>
          </div>
          {error && <div style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
        </>
      ) : torrent.status === 'REJECTED' ? (
        <>
          <strong>✕ Ce torrent a été rejeté</strong>
          {torrent.rejectReason && <p className="owner-banner-note">Motif : « {torrent.rejectReason} »</p>}
          <div className="muted" style={{ fontSize: 13 }}>Tu peux le corriger : une fois modifié, il repart automatiquement en validation.</div>
          <div className="row" style={{ marginTop: 6 }}><button type="button" onClick={onEdit}>✏️ Modifier mon torrent</button></div>
        </>
      ) : (
        <>
          <strong>🕓 En attente de validation</strong>
          {torrent.resubmittedAt && <span className="muted"> · renvoyé après correction {timeAgo(torrent.resubmittedAt)}</span>}
          <div className="muted" style={{ fontSize: 13 }}>Un membre de l'équipe va le vérifier. Tu peux encore le modifier (nom, catégorie, fiche, description, NFO...) avec le bouton ci-dessous. Garde-le en seed dans ton client : sans seeder, il ne peut pas être approuvé.</div>
          <div className="row" style={{ marginTop: 6 }}><button type="button" className="secondary" onClick={onEdit}>✏️ Modifier mon torrent</button></div>
        </>
      )}
    </div>
  );
}
