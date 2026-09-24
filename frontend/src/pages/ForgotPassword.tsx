import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

/** « Mot de passe oublié » : envoie un lien de réinitialisation par e-mail. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form-side" style={{ minHeight: '100vh' }}>
      <div className="panel ornate" style={{ maxWidth: 380, width: '100%' }}>
        <h2>Mot de passe oublié</h2>
        {sent ? (
          <>
            <p style={{ color: 'var(--success)' }}>✓ Si cette adresse correspond à un compte, un e-mail avec un lien de réinitialisation vient d'être envoyé (valable 1 heure).</p>
            <p className="muted">Pense à vérifier tes courriers indésirables.</p>
            <Link to="/login"><button type="button">Retour à la connexion</button></Link>
          </>
        ) : (
          <form onSubmit={submit} className="grid">
            <input type="email" placeholder="Adresse e-mail de ton compte" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? 'Envoi...' : 'Envoyer le lien'}</button>
            <Link to="/login" className="muted">← Retour</Link>
          </form>
        )}
      </div>
    </div>
  );
}
