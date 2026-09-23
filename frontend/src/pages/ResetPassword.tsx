import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

/** Page ouverte via un lien de réinitialisation remis par le staff. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas'); return; }
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Réinitialisation impossible');
    }
  }

  return (
    <div className="auth-form-side" style={{ minHeight: '100vh' }}>
      <div className="panel ornate" style={{ maxWidth: 380, width: '100%' }}>
        <h2>Nouveau mot de passe</h2>
        {done ? (
          <>
            <p style={{ color: 'var(--success)' }}>✓ Mot de passe modifié.</p>
            <Link to="/login"><button type="button">Se connecter</button></Link>
          </>
        ) : !token ? (
          <p className="muted">Lien invalide. Demande un nouveau lien au staff.</p>
        ) : (
          <form onSubmit={submit} className="grid">
            <input type="password" placeholder="Nouveau mot de passe (8 caractères minimum)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <input type="password" placeholder="Confirmer le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
            {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
            <button type="submit">Enregistrer</button>
          </form>
        )}
      </div>
    </div>
  );
}
