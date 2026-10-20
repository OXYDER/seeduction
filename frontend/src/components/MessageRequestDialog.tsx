import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { useMsgRequest } from '../store/msgRequest';

const MAX = 1000;

/** Fenêtre « Envoyer un message » : avant d'écrire à quelqu'un qui n'est pas son ami, on lui envoie une demande (introduction facultative) ; la discussion commence s'il l'accepte. */
export default function MessageRequestDialog() {
  const target = useMsgRequest((s) => s.target);
  const close = useMsgRequest((s) => s.close);
  const markSent = useMsgRequest((s) => s.markSent);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { setIntro(''); setError(''); setDone(false); setBusy(false); }, [target?.id]);
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [target, close]);

  if (!target) return null;

  async function send() {
    if (!target) return;
    setBusy(true); setError('');
    try {
      await api.post('/message-requests', { toId: target.id, intro: intro.trim() || undefined });
      setDone(true); markSent();
      window.setTimeout(close, 1600);
    } catch (e: any) {
      setError(e.response?.data?.message ?? "Envoi impossible");
    } finally { setBusy(false); }
  }

  return createPortal(
    <div className="mr-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="mr-dialog" role="dialog" aria-modal="true" aria-label={'Envoyer un message à ' + target.username}>
        <div className="mr-head">
          <span className="mr-icon" aria-hidden>💬</span>
          <div>
            <div className="mr-title">Envoyer un message</div>
            <div className="mr-sub">à {target.username}</div>
          </div>
        </div>
        <div className="mr-body">
          {done ? (
            <div className="mr-info ok">✅ Demande envoyée à <strong>{target.username}</strong>. Tu seras prévenu dès qu'elle est acceptée.</div>
          ) : (
            <>
              <div className="mr-info">ⓘ Ta demande sera envoyée à <strong>{target.username}</strong>. Il devra l'accepter avant que vous puissiez échanger.</div>
              <label className="mr-label">Message d'introduction <span className="muted">(facultatif)</span>
                <textarea rows={4} maxLength={MAX} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Présente-toi ou explique pourquoi tu souhaites contacter ce membre…" autoFocus />
              </label>
              <div className="mr-count">{intro.length}/{MAX} caractères</div>
              {error && <div className="mr-error">{error}</div>}
            </>
          )}
        </div>
        <div className="mr-foot">
          <button type="button" className="mr-cancel" onClick={close}>{done ? 'Fermer' : 'Annuler'}</button>
          {!done && <button type="button" className="mr-send" disabled={busy} onClick={send}>➤ Envoyer la demande</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
