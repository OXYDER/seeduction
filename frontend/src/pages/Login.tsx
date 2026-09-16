import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div style={{ maxWidth: 380, margin: '60px auto' }} className="panel">
      <h2>Connexion</h2>
      <form onSubmit={submit} className="grid">
        <input placeholder="Nom d'utilisateur ou email" value={usernameOrEmail} onChange={(e) => setUsernameOrEmail(e.target.value)} required />
        <input placeholder="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {need2FA && (
          <input placeholder="Code 2FA" value={totpToken} onChange={(e) => setTotpToken(e.target.value)} required />
        )}
        {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
        <button type="submit">Se connecter</button>
      </form>
    </div>
  );
}
