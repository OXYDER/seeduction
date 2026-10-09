import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';
import Avatar from '../components/Avatar';
import { Pagination } from '../components/ForumBits';

interface TeamCard {
  id: string; name: string; tag: string | null; description: string; logoUrl: string | null; recruiting: boolean; memberCount: number; totalUpload: number;
  leader: { id: string; username: string; avatarUrl: string | null } | null; applied: boolean; mine: boolean; auto: boolean; hasOwner: boolean; releaseCount: number;
}
type Filter = 'all' | 'recruiting' | 'unowned' | 'owned' | 'mine';

/** Les teams du site : celles de l'administration et celles détectées automatiquement dans les releases partagées. */
export default function Teams() {
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '');
  const [data, setData] = useState<{ teams: TeamCard[]; myTeamId: string | null; pending: number; maxPending: number; page: number; pageSize: number; total: number; counts: { all: number; unowned: number } } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', leaderUsername: '', description: '', requirements: '' });
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => { setQ(query.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [query]);
  const load = () => api.get('/teams', { params: { q: q || undefined, filter: filter === 'all' ? undefined : filter, page } }).then((r) => setData(r.data)).catch(() => setError('Teams indisponibles'));
  useEffect(() => { void load(); }, [q, filter, page]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const FILTERS: [Filter, string][] = [['all', `Toutes (${data.counts.all})`], ['unowned', `Sans propriétaire (${data.counts.unowned})`], ['owned', 'Avec propriétaire'], ['recruiting', 'Qui recrutent'], ['mine', 'Ma team']];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🏴 Teams</h1>
        {canCreate && <button type="button" onClick={() => setCreating((v) => !v)}>➕ Créer une team</button>}
      </div>

      <div className="panel team-info">
        <strong>🤖 Teams détectées automatiquement</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Quand une release est partagée sur le site, le système reconnaît la team dans son nom (la fin du nom, par exemple « …x264-<strong>TOXIC</strong> ») et l'ajoute ici, <strong>sans propriétaire</strong>.
          Si tu fais vraiment partie de l'une de ces teams, ouvre sa page et envoie une <strong>candidature avec une preuve</strong> (lien vers une annonce, NFO, capture…) :
          l'administration la vérifie, et le premier membre validé devient le propriétaire de la team. Les autres candidats passent ensuite par lui.
        </p>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(([k, label]) => <button key={k} type="button" className={`secondary${filter === k ? ' on' : ''}`} onClick={() => { setFilter(k); setPage(1); }}>{label}</button>)}
        <input type="search" placeholder="Chercher une team…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginLeft: 'auto', minWidth: 200 }} />
      </div>
      <p className="muted" style={{ margin: 0 }}>Tu ne peux faire partie que d'une seule team ; jusqu'à {data.maxPending} candidatures en attente ({data.pending} actuellement).</p>
      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} unit="team" onPage={setPage} />

      {creating && (
        <form className="panel" onSubmit={create} style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Nouvelle team</h3>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Si une team détectée automatiquement porte déjà ce nom et n'a pas de propriétaire, elle est simplement remise à ce chef.</p>
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

      {data.teams.length === 0 && <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucune team ne correspond.</p></div>}
      <div className="team-grid">
        {data.teams.map((t) => (
          <Link key={t.id} to={`/teams/${t.id}`} className={`team-card${t.mine ? ' mine' : ''}${t.hasOwner ? '' : ' unowned'}`}>
            <div className="team-logo">{t.logoUrl ? <img src={t.logoUrl} alt="" /> : <span>{(t.tag || t.name).slice(0, 2).toUpperCase()}</span>}</div>
            <div className="team-body">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <strong className="team-name">{t.name}</strong>
                {t.tag && <span className="team-tag">[{t.tag}]</span>}
                {t.mine && <span className="inv-status active">Ta team</span>}
                {t.applied && <span className="inv-status scheduled">Candidature envoyée</span>}
                {!t.hasOwner && <span className="team-noowner" title="Aucun propriétaire : en attente d'un vrai membre de la team">Sans propriétaire</span>}
              </div>
              <p className="team-desc">{t.description || (t.auto ? 'Team détectée automatiquement dans les releases partagées sur le site.' : 'Aucune description.')}</p>
              <div className="team-meta">
                <span>📦 {t.releaseCount} release{t.releaseCount > 1 ? 's' : ''}</span>
                {t.memberCount > 0 && <span>👥 {t.memberCount}</span>}
                {t.totalUpload > 0 && <span>⬆ {formatBytes(t.totalUpload)}</span>}
                {t.leader && <span className="row" style={{ gap: 4 }}><Avatar user={t.leader} size={18} /> {t.leader.username}</span>}
                {t.auto && <span title="Ajoutée par le système d'après le nom des releases">🤖 auto</span>}
                {t.hasOwner && <span className={t.recruiting ? 'team-rec on' : 'team-rec'}>{t.recruiting ? '🟢 Recrute' : '⚪ Complète'}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} unit="team" onPage={setPage} scrollTop />
    </div>
  );
}
