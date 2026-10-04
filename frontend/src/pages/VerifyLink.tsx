import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

const DONE: Record<string, string> = {
  SIGNUP: '✓ Courriel confirmé : ton compte est actif.',
  PASSWORD_CHANGE: '✓ Changement de mot de passe confirmé.',
  EMAIL_CHANGE: '✓ Nouvelle adresse courriel confirmée.',
};

/** Page ouverte depuis le lien du courriel de confirmation (inscription, mot de passe, courriel). */
export default function VerifyLink() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // React en mode strict appelle deux fois : le lien ne sert qu'une fois
    ran.current = true;
    if (!token) { setState('error'); setMessage('Lien invalide.'); return; }
    api.post('/auth/verify-email', { token })
      .then((r) => { setState('ok'); setMessage(DONE[r.data.purpose] ?? '✓ Confirmé.'); })
      .catch((err) => { setState('error'); setMessage(err.response?.data?.message ?? 'Lien invalide ou expiré.'); });
  }, [token]);

  return (
    <div className="auth-form-side" style={{ minHeight: '100vh' }}>
      <div className="panel ornate" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <img src="/logo-icon.png" alt="" width={56} height={56} />
        <h2 style={{ marginTop: 10 }}>Confirmation par courriel</h2>
        {state === 'loading' && <p className="muted">Vérification…</p>}
        {state === 'ok' && <p style={{ color: 'var(--success)' }}>{message}</p>}
        {state === 'error' && <p style={{ color: 'var(--danger)' }}>{message}</p>}
        {state !== 'loading' && <Link to="/login"><button type="button">Se connecter</button></Link>}
      </div>
    </div>
  );
}
