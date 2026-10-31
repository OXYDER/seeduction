import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';

const KINDS: Record<string, { label: string; icon: string }> = { ANNOUNCEMENT: { label: 'Annonce', icon: '📣' }, NEWS: { label: 'Nouvelle', icon: '📰' }, RECRUITING: { label: 'Recrutement', icon: '🤝' }, EVENT: { label: 'Événement', icon: '🎉' } };

/** Annonces et nouvelles de la team : les membres voient tout, les autres seulement ce qui est publié « pour tout le site ». Le chef et les officiers publient. */
export function TeamPosts({ teamId, isMember }: { teamId: string; isMember: boolean }) {
  const [data, setData] = useState<{ canPost: boolean; items: any[] } | null>(null);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', content: '', kind: 'ANNOUNCEMENT', pinned: false, publicPost: false });
  const [error, setError] = useState('');
  const load = () => api.get(`/teams/${teamId}/posts`).then((r) => setData(r.data)).catch(() => setData({ canPost: false, items: [] }));
  useEffect(() => { void load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || (data.items.length === 0 && !data.canPost)) return null;

  function open(p: any | 'new') {
    setError('');
    setEditing(p);
    setForm(p === 'new' ? { title: '', content: '', kind: 'ANNOUNCEMENT', pinned: false, publicPost: false } : { title: p.title, content: p.content, kind: p.kind, pinned: p.pinned, publicPost: p.publicPost });
  }
  async function save() {
    setError('');
    try {
      if (editing === 'new') await api.post(`/teams/${teamId}/posts`, form); else await api.patch(`/teams/${teamId}/posts/${editing.id}`, form);
      setEditing(null); await load();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Enregistrement impossible'); }
  }
  async function remove(id: string) { if (window.confirm('Supprimer cette annonce ?')) { await api.delete(`/teams/${teamId}/posts/${id}`).catch(() => undefined); await load(); } }

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>📣 Annonces et nouvelles</h3>
        {data.canPost && !editing && <button type="button" onClick={() => open('new')}>＋ Publier</button>}
      </div>
      {editing && (
        <div className="grid" style={{ gap: 8 }}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titre" maxLength={160} />
          <textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Contenu" maxLength={8000} />
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={{ width: 'auto' }}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 📌 Épingler</label>
            <label className="row" style={{ gap: 6 }}>Visible par
              <select value={form.publicPost ? 'public' : 'team'} onChange={(e) => setForm({ ...form, publicPost: e.target.value === 'public' })} style={{ width: 'auto' }}>
                <option value="team">🔒 Ma team seulement</option>
                <option value="public">🌐 Tous les membres du site</option>
              </select>
            </label>
          </div>
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
          <div className="row" style={{ gap: 8 }}><button type="button" onClick={save}>{editing === 'new' ? 'Publier (la team est prévenue)' : 'Enregistrer'}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Annuler</button></div>
        </div>
      )}
      {data.items.map((p) => (
        <article key={p.id} className="panel" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge">{KINDS[p.kind]?.icon} {KINDS[p.kind]?.label}</span>
            {p.pinned && <span title="Épinglée">📌</span>}
            {p.publicPost ? <span className="badge" title="Visible par tous les membres du site">🌐 Publique</span> : isMember && <span className="badge" title="Réservée aux membres de la team">🔒 Team</span>}
            <strong>{p.title}</strong>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{p.author.username} · {timeAgo(p.createdAt)}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{p.content}</p>
          {data.canPost && <div className="row" style={{ gap: 6, marginTop: 6 }}><button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => open(p)}>Modifier</button><button type="button" className="danger" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => remove(p.id)}>Supprimer</button></div>}
        </article>
      ))}
    </div>
  );
}

/** Tableau de bord de la team (membres seulement) : chiffres du mois, objectif, activité, contributions et, pour le chef et les officiers, la santé. */
export function TeamDashboard({ teamId }: { teamId: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get(`/teams/${teamId}/dashboard`).then((r) => setD(r.data)).catch(() => setD(null)); }, [teamId]);
  if (!d) return null;
  const o = d.overview;
  const pct = o.goal.target > 0 ? Math.min(100, Math.round((o.goal.done / o.goal.target) * 100)) : 0;
  const tile = (label: string, value: string) => <div className="panel act-tile"><div className="muted">{label}</div><div className="act-tile-value">{value}</div></div>;
  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0 }}>📊 Tableau de bord de la team</h3>
      <div className="act-tiles">
        {tile('Membres', `${o.members} (${o.online} en ligne)`)}
        {tile('Releases ce mois', String(o.releasesMonth))}
        {tile('Volume ce mois', formatBytes(o.volumeMonth))}
        {tile('Seeders sur ses torrents', String(o.seeders))}
      </div>
      {o.goal.target > 0 && (
        <div className="bc" style={{ cursor: 'default' }}>
          <div className="bt"><span>🎯 Objectif du mois : <b>{o.goal.target}</b> releases</span><span>{o.goal.done} / {o.goal.target} · {pct} %</span></div>
          <div className="pb"><i style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8b5cf6,#c084fc)' }} /></div>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div>
          <strong>🕒 Activité récente</strong>
          {d.activity.length === 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Rien pour l'instant.</p>}
          {d.activity.map((a: any, i: number) => <div key={i} style={{ padding: '3px 0', fontSize: 13 }}>{a.icon} {a.link ? <Link to={a.link}>{a.text}</Link> : a.text}{a.who ? <span className="muted"> · {a.who}</span> : null} <span className="muted" style={{ fontSize: 11 }}>{timeAgo(a.at)}</span></div>)}
        </div>
        <div>
          <strong>🏆 Contributions du mois</strong>
          {d.contributions.length === 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Aucune release ce mois-ci.</p>}
          {d.contributions.map((c: any, i: number) => <div key={i} style={{ padding: '3px 0', fontSize: 13 }}>{i + 1}. {c.name} <span className="muted">· {c.releases} release{c.releases > 1 ? 's' : ''} · {formatBytes(c.volume)}</span></div>)}
        </div>
        {d.health && (
          <div>
            <strong>🩺 Santé de la team</strong>
            {d.health.weakReleases.length === 0 && d.health.hnr.length === 0 && d.health.inactive.length === 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Tout va bien ✓</p>}
            {d.health.weakReleases.map((t: any) => <div key={t.id} style={{ padding: '3px 0', fontSize: 13 }}>🟠 <Link to={`/torrents/${t.id}`}>{t.name.slice(0, 48)}</Link> <span className="muted">· {t.seeders} seeder{t.seeders > 1 ? 's' : ''}</span></div>)}
            {d.health.hnr.map((h: any, i: number) => <div key={i} style={{ padding: '3px 0', fontSize: 13 }}>🔴 {h.name} <span className="muted">· {h.count} hit & run</span></div>)}
            {d.health.inactive.map((m: any, i: number) => <div key={i} style={{ padding: '3px 0', fontSize: 13 }}>💤 {m.name} <span className="muted">· inactif{m.days < 999 ? ` depuis ${m.days} j` : ''}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Les annonces que les chefs de team ont choisi de montrer à tout le site (page Teams). */
export function PublicTeamPosts() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/teams/posts/public').then((r) => setItems(r.data)).catch(() => undefined); }, []);
  if (items.length === 0) return null;
  return (
    <div className="panel" style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0 }}>📣 Annonces des teams</h3>
      {items.map((p) => (
        <Link key={p.id} to={`/teams/${p.team.id}`} className="panel" style={{ background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 2, borderLeft: `3px solid ${p.team.accent || 'var(--border)'}` }}>
          <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className="badge">{KINDS[p.kind]?.icon} {KINDS[p.kind]?.label}</span>{p.pinned && <span>📌</span>}<strong>{p.title}</strong><span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{p.team.name} · {timeAgo(p.createdAt)}</span></span>
          <span className="muted" style={{ fontSize: 13 }}>{p.content}{p.content.length >= 280 ? '…' : ''}</span>
        </Link>
      ))}
    </div>
  );
}

const ACTION_TEXT: Record<string, (a: any) => string> = {
  JOIN: (a) => `${a.target} a rejoint la team`,
  LEADER: (a) => `${a.target} est devenu chef de la team`,
  LEAVE: (a) => `${a.target} a quitté la team`,
  REMOVE: (a) => `${a.target} a été retiré par ${a.actor}`,
  PROMOTE: (a) => `${a.actor} a nommé ${a.target} officier`,
  DEMOTE: (a) => `${a.actor} a remis ${a.target} simple membre`,
};

/** Historique des arrivées, départs et changements de rôle de la team (membres seulement). */
export function TeamHistory({ teamId }: { teamId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get(`/teams/${teamId}/history`).then((r) => setRows(r.data)).catch(() => setRows(null)); }, [teamId]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="panel" style={{ display: 'grid', gap: 6 }}>
      <button type="button" className="secondary" style={{ justifySelf: 'start' }} onClick={() => setOpen((v) => !v)}>{open ? '▾' : '▸'} 🧾 Historique des rôles et des membres ({rows.length})</button>
      {open && rows.map((a) => <div key={a.id} style={{ fontSize: 13 }}>{(ACTION_TEXT[a.action] ?? (() => a.action))(a)} <span className="muted" style={{ fontSize: 11.5 }}>· {timeAgo(a.createdAt)}</span></div>)}
    </div>
  );
}
