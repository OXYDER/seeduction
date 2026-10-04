import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export interface VerifyResult { verified: boolean; purpose: 'SIGNUP' | 'PASSWORD_CHANGE' | 'EMAIL_CHANGE'; username: string }

/**
 * Saisie du code à 6 chiffres reçu par courriel (le même courriel contient aussi un lien). Sert à l'inscription et à toute
 * modification sensible du compte. `onResend` redemande un courriel et renvoie le nouvel identifiant de demande.
 */
export default function CodeConfirm({ challengeId, email, intro, onVerified, onCancel, onResend }: {
  challengeId: string;
  email: string;
  intro?: string;
  onVerified: (r: VerifyResult) => void;
  onCancel?: () => void;
  onResend?: () => Promise<string | void>;
}) {
  const [id, setId] = useState(challengeId);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setId(challengeId); }, [challengeId]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/auth/verify-email', { challengeId: id, code: value });
      onVerified(data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Vérification impossible');
      setCode('');
      input.current?.focus();
    } finally { setBusy(false); }
  }

  async function resend() {
    if (!onResend || cooldown > 0) return;
    setError(''); setInfo('');
    try {
      const next = await onResend();
      if (next) setId(next);
      setCooldown(60);
      setInfo('Nouveau code envoyé.');
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Impossible de renvoyer le code");
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(code); }} className="grid" style={{ gap: 10 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>📧</div>
        <strong>{intro ?? 'Vérifie tes courriels'}</strong>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Un code à 6 chiffres vient d'être envoyé à <strong>{email}</strong>. Entre-le ci-dessous, ou clique sur le lien du courriel.
        </p>
      </div>
      <input
        ref={input}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) submit(v); }}
        style={{ textAlign: 'center', fontSize: 28, letterSpacing: 10, fontFamily: 'monospace' }}
        aria-label="Code de confirmation à 6 chiffres"
      />
      {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
      {info && <div style={{ color: 'var(--success)' }} className="muted">{info}</div>}
      <button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Vérification…' : 'Confirmer'}</button>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
        {onResend ? (
          <button type="button" className="secondary" disabled={cooldown > 0} onClick={resend}>
            {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
          </button>
        ) : <span />}
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Annuler</button>}
      </div>
      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Rien reçu ? Regarde dans tes courriels indésirables.</div>
    </form>
  );
}
