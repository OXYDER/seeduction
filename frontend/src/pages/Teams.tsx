import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';
import Avatar from '../components/Avatar';

interface TeamCard {
  id: string; name: string; tag: string | null; description: string; logoUrl: string | null; recruiting: boolean; memberCount: number; totalUpload: number;
  leader: { id: string; username: string; avatarUrl: string | null } | null; applied: boolean; mine: boolean;
}

/** Les teams du site : voir celles qui existent, leur chef, leurs membres, et postuler quand elles recrutent. */
export default function Teams() {
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const [data, setData] = useState<{ teams: TeamCard[]; myTeamId: string | null; pending: number; maxPending: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', leaderUsername: '', description: '', requirements: '' });
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'recruiting'>('all');

  const load = () => api.get('/teams').then((r) => setData(r.data)).catch(() => setError('Teams indisponibles'));
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/teams', form);
      setForm({ name: '', tag: '', leaderUsername: '', description: '', requirements: '' });
      setCreating(false);
      void load();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Création impossible'); }
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const shown = data.teams.filter((t) => filter === 'all' || t.recruiting);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🏴 Teams</h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`secondary${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>Toutes ({data.teams.length})</button>
          <button type="button" className={`secondary${filter === 'recruiting' ? ' on' : ''}`} onClick={() => setFilter('recruiting')}>Qui recrutent</button>
          {canCreate && <button type="button" onClick={() => setCreating((v) => !v)}>➕ Créer une team</button>}
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>Une team réunit des membres autour d'un même rôle (uploaders, releasers, traducteurs…). Tu ne peux faire partie que d'une seule team ; tu peux avoir jusqu'à {data.maxPending} candidatures en attente ({data.pending} actuellement).</p>
      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}

      {creating && (
        <form className="panel" onSubmit={create} style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Nouvelle team</h3>
          <div className="inv-grid">
            <label><span className="muted">Nom</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} required /></label>
            <label><span className="muted">Tag (8 caractères max)</span><input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} maxLength={8} /></label>
            <label><span className="muted">Chef (pseudo exact du compte)</span><input value={form.leaderUsername} onChange={(e) => setForm({ ...form, leaderUsername: e.target.value })} required /></label>
          </div>
          <textarea rows={3} placeholder="Description de la team" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={3000} />
          <textarea rows={2} placeholder="Ce que la team attend des candidats (facultatif)" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} maxLength={2000} />
          <div className="row" style={{ gap: 8 }}><button type="submit">Créer</button><button type="button" className="secondary" onClick={() => setCreating(false)}>Annuler</button></div>
        </form>
      )}

      {shown.length === 0 && <div className="panel"><p className="muted" style={{ margin: 0 }}>{data.teams.length === 0 ? "Aucune team n'existe encore." : 'Aucune team ne recrute pour le moment.'}</p></div>}
      <div className="team-grid">
        {shown.map((t) => (
          <Link key={t.id} to={`/teams/${t.id}`} className={`team-card${t.mine ? ' mine' : ''}`}>
            <div className="team-logo">{t.logoUrl ? <img src={t.logoUrl} alt="" /> : <span>{(t.tag || t.name).slice(0, 2).toUpperCase()}</span>}</div>
            <div className="team-body">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <strong className="team-name">{t.name}</strong>
                {t.tag && <span className="team-tag">[{t.tag}]</span>}
                {t.mine && <span className="inv-status active">Ta team</span>}
                {t.applied && <span className="inv-status scheduled">Candidature envoyée</span>}
              </div>
              <p className="team-desc">{t.description || 'Aucune description.'}</p>
              <div className="team-meta">
                <span>👥 {t.memberCount} membre{t.memberCount > 1 ? 's' : ''}</span>
                <span>⬆ {formatBytes(t.totalUpload)}</span>
                {t.leader && <span className="row" style={{ gap: 4 }}><Avatar user={t.leader} size={18} /> {t.leader.username}</span>}
                <span className={t.recruiting ? 'team-rec on' : 'team-rec'}>{t.recruiting ? '🟢 Recrute' : '⚪ Complète'}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
