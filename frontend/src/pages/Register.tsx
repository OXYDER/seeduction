import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import CodeConfirm from '../components/CodeConfirm';

export default function Register() {
  const [params] = useSearchParams();
  // Un lien d'inscription (Admin > Invitations) arrive avec le code déjà rempli : /register?code=...
  const [form, setForm] = useState({ inviteCode: params.get('code') ?? '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState<{ challengeId: string; email: string } | null>(null);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/register', form);
      // Courriel à confirmer : un code à 6 chiffres (et un lien) vient d'être envoyé avant que le compte soit actif.
      if (data.pendingVerification) { setPending({ challengeId: data.challengeId, email: data.email }); return; }
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'inscription");
    }
  }

  /** Compte activé : on ouvre la session avec ce qui vient d'être saisi. */
  async function afterVerified() {
    try {
      const { data } = await api.post('/auth/login', { usernameOrEmail: form.username, password: form.password });
      if (data.accessToken) { login(data.accessToken, data.user); navigate('/'); return; }
    } catch { /* retombe sur l'écran de connexion */ }
    navigate('/login');
  }

  return (
    <div className="auth-split">
      <div className="auth-art">
        <img src="/logo-full.png" alt="Seeduction" className="auth-art-logo" />
        <div className="auth-art-caption">
          <strong>Rejoins la légende</strong>
          <p>Un code d'invitation valide est requis — le tracker est fermé.</p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="panel ornate" style={{ maxWidth: 380, width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/logo-icon.png" alt="" width={56} height={56} />
            <h2 style={{ marginTop: 10 }}>Créer un compte</h2>
          </div>
          {pending ? (
            <CodeConfirm
              challengeId={pending.challengeId}
              email={pending.email}
              intro="Dernière étape : confirme ton courriel"
              onVerified={afterVerified}
              onResend={async () => (await api.post('/auth/login', { usernameOrEmail: form.username, password: form.password })).data.challengeId}
            />
          ) : done ? (
            <p style={{ color: 'var(--success)', textAlign: 'center' }}>Compte créé ! Redirection...</p>
          ) : (
            <form onSubmit={submit} className="grid">
              <input placeholder="Code d'invitation" value={form.inviteCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} />
              <input placeholder="Nom d'utilisateur" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input placeholder="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
              <button type="submit">Créer le compte</button>
              <Link to="/login"><button type="button" className="secondary" style={{ width: '100%' }}>J'ai déjà un compte</button></Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
