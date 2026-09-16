import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div style={{ maxWidth: 380, margin: '60px auto' }} className="panel ornate">
      <div style={{ textAlign: 'center' }}>
        <img src="/logo-full.png" alt="Seeduction" width={120} height={120} />
      </div>
      <h2 style={{ textAlign: 'center' }}>Inscription</h2>
      <p className="muted">Un code d'invitation valide est requis — le tracker est fermé.</p>
      {done ? (
        <p style={{ color: 'var(--success)' }}>Compte créé ! Redirection...</p>
      ) : (
        <form onSubmit={submit} className="grid">
          <input placeholder="Code d'invitation" value={form.inviteCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} required />
          <input placeholder="Nom d'utilisateur" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
          <button type="submit">Créer le compte</button>
        </form>
      )}
    </div>
  );
}
