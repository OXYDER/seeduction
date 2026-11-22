import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Avatar from '../components/Avatar';
import UserLink from '../components/UserLink';

interface Wall {
  founders: { id: string; username: string; avatarUrl?: string | null; founderAt: string }[];
  me: { founder: boolean; since: string | null; renameAvailable: boolean };
  perks: { bonusPercent: number; extraInvites: number; yearlyTokens: number };
}

/** Le mur des fondateurs : les membres de la bêta qui ont aidé à bâtir Seeduction, leurs avantages, le salon réservé et le changement de pseudo gratuit. */
export default function Founders() {
  const [wall, setWall] = useState<Wall | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  useEffect(() => { api.get('/founders').then((r) => setWall(r.data)).catch(() => setError('Chargement impossible')); }, []);

  async function openSalon() {
    setError('');
    try {
      const { data } = await api.get('/founders/chat');
      navigate(`/chat?c=${data.conversationId}`);
    } catch (e: any) { setError(e.response?.data?.message ?? "Le salon n'est pas disponible"); }
  }

  async function rename() {
    if (!window.confirm(`Changer ton pseudo pour « ${name.trim()} » ? C'est ton changement gratuit unique : tu devras te reconnecter ensuite.`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const { data } = await api.post('/founders/rename', { username: name.trim() });
      setMsg(`Ton pseudo est maintenant « ${data.username} ». Reconnexion…`);
      window.setTimeout(() => { logout(); window.location.assign('/login'); }, 1800);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Changement impossible'); }
    finally { setBusy(false); }
  }

  if (!wall) return <p className="muted">{error || 'Chargement…'}</p>;
  const p = wall.perks;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>🏅 Les membres fondateurs</h1>
      <p className="muted" style={{ margin: 0 }}>
        Ils étaient là pendant la bêta et ils ont aidé à bâtir Seeduction : merci à eux. Leur pseudo brille en or partout sur le site.
      </p>

      {wall.me.founder && (
        <div className="panel founder-me" style={{ display: 'grid', gap: 10 }}>
          <strong>Tu es membre fondateur{wall.me.since ? ` depuis le ${new Date(wall.me.since).toLocaleDateString('fr-CA', { dateStyle: 'long' })}` : ''} 🎉</strong>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={openSalon}>💬 Ouvrir le salon des fondateurs</button>
          </div>
          {wall.me.renameAvailable ? (
            <div style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
              <label style={{ fontSize: 13 }}>Ton changement de pseudo gratuit (une seule fois)
                <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Nouveau pseudo (3 à 24 caractères)" />
              </label>
              <button type="button" className="secondary" disabled={busy || name.trim().length < 3} onClick={rename}>Changer mon pseudo</button>
            </div>
          ) : <span className="muted" style={{ fontSize: 13 }}>Ton changement de pseudo gratuit a déjà été utilisé.</span>}
          {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        </div>
      )}

      <div className="panel" style={{ display: 'grid', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Les avantages du statut</h3>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 3 }}>
          <li><strong>Pseudo en or brillant</strong> partout, et le badge 🏅 Fondateur.</li>
          <li>Un <strong>salon de chat privé</strong> réservé aux fondateurs.</li>
          <li><strong>{p.extraInvites} invitations</strong> de plus que ton rang.</li>
          <li><strong>Ton rang est protégé</strong> : il ne baisse jamais à cause d'une inactivité.</li>
          <li><strong>{p.yearlyTokens} jetons freeleech</strong> offerts chaque année.</li>
          <li><strong>+{p.bonusPercent} % de points</strong> gagnés en seedant, en permanence.</li>
          <li><strong>Un changement de pseudo gratuit</strong>, et les nouveautés annoncées en premier dans le salon.</li>
        </ul>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Le mur ({wall.founders.length})</h3>
        {wall.founders.length === 0 ? <p className="muted">Aucun fondateur pour l'instant.</p> : (
          <div className="founder-grid">
            {wall.founders.map((f) => (
              <div key={f.id} className="founder-card" title={`Fondateur depuis le ${new Date(f.founderAt).toLocaleDateString('fr-CA', { dateStyle: 'long' })}`}>
                <Avatar user={f} size={44} />
                <span className="founder-name"><UserLink user={f} /></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
