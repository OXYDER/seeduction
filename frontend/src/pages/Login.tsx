import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [need2FA, setNeed2FA] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { usernameOrEmail, password, totpToken: totpToken || undefined });
      login(data.accessToken, data.user);
      navigate('/');
    } catch (err: any) {
      if (err.response?.data?.message === 'Code 2FA requis') setNeed2FA(true);
      else setError(err.response?.data?.message ?? 'Erreur de connexion');
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-art">
        <img src="/logo-full.png" alt="Seeduction" className="auth-art-logo" />
        <div className="auth-art-caption">
          <strong>Bienvenue sur Seeduction</strong>
          <p>Le tracker BitTorrent privé d'exception.</p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="panel ornate" style={{ maxWidth: 380, width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/logo-icon.png" alt="" width={56} height={56} />
            <h2 style={{ marginTop: 10 }}>Se connecter</h2>
          </div>
          <form onSubmit={submit} className="grid">
            <input placeholder="Nom d'utilisateur ou email" value={usernameOrEmail} onChange={(e) => setUsernameOrEmail(e.target.value)} required />
            <input placeholder="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {need2FA && (
              <input placeholder="Code 2FA" value={totpToken} onChange={(e) => setTotpToken(e.target.value)} required />
            )}
            {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
            <button type="submit">Connexion</button>
            <Link to="/register"><button type="button" className="secondary" style={{ width: '100%' }}>Créer un compte</button></Link>
          </form>

          <div className="ornate-divider" />
          <div className="muted" style={{ fontSize: 12 }}>
            <strong style={{ color: 'var(--gold-bright)', display: 'block', marginBottom: 4 }}>CONSEIL</strong>
            Maintiens un bon ratio pour aider la communauté à seed.
          </div>
        </div>
      </div>
    </div>
  );
}
