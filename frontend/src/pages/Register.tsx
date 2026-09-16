import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Register() {
  const [form, setForm] = useState({ inviteCode: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/register', form);
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'inscription");
    }
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
          <p className="muted" style={{ textAlign: 'center' }}>
            Le tout premier compte créé devient automatiquement administrateur, sans invitation.
          </p>
          {done ? (
            <p style={{ color: 'var(--success)', textAlign: 'center' }}>Compte créé ! Redirection...</p>
          ) : (
            <form onSubmit={submit} className="grid">
              <input placeholder="Code d'invitation (inutile pour le 1er compte)" value={form.inviteCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} />
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
