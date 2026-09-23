import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import UserLink from '../components/UserLink';
import { LastPostCell } from '../components/ForumBits';

function ForumRow({ f }: { f: any }) {
  return (
    <tr className={f.unread ? 'forum-unread' : undefined}>
      <td className="forum-icon" title={f.unread ? 'Nouveaux messages' : 'Aucun nouveau message'}>{f.icon || (f.unread ? '🟡' : '💬')}</td>
      <td>
        <Link to={`/forum/f/${f.id}`} className="forum-name">{f.name}</Link>
        {f.staffOnly && <span className="badge double" style={{ marginLeft: 6 }}>Staff</span>}
        {f.locked && <span title="Verrouillé" style={{ marginLeft: 6 }}>🔒</span>}
        {f.description && <div className="muted forum-desc">{f.description}</div>}
        {f.subforums.length > 0 && (
          <div className="forum-subs">
            <span className="muted">Sous-forums : </span>
            {f.subforums.map((s: any, i: number) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <Link to={`/forum/f/${s.id}`} className={s.unread ? 'forum-sub-unread' : undefined}>{s.name}</Link>
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="forum-num">{f.topics}</td>
      <td className="forum-num">{f.posts}</td>
      <td className="forum-last"><LastPostCell lastPost={f.lastPost} /></td>
    </tr>
  );
}

function ForumTable({ title, forums, isSection }: { title: string; forums: any[]; isSection?: boolean }) {
  return (
    <div className="forum-table panel ornate">
      <div className="forum-table-head">
        <span>{isSection ? '🗂️ ' : ''}{title}</span>
        <span className="forum-col">Sujets</span>
        <span className="forum-col">Messages</span>
        <span className="forum-col-last">Dernier message</span>
      </div>
      <table>
        <tbody>
          {forums.map((f) => <ForumRow key={f.id} f={f} />)}
          {forums.length === 0 && <tr><td className="muted" style={{ padding: 14 }}>Aucun forum dans cette catégorie pour l'instant.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Forum() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');

  function load() {
    api.get('/forum/index').then((r) => setData(r.data)).catch(() => setData({ roots: [], stats: null }));
  }
  useEffect(load, []);

  async function markRead() {
    await api.post('/forum/mark-read').catch(() => {});
    load();
  }

  if (!data) return <p className="muted">Chargement...</p>;

  // Forums de premier niveau (sans catégorie) regroupés dans un seul tableau ; chaque catégorie a le sien.
  const loose = data.roots.filter((r: any) => !r.isCategory);

  return (
    <div className="grid" style={{ width: '100%', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1>Forum</h1>
        <form
          className="row"
          onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) navigate(`/forum/search?q=${encodeURIComponent(q.trim())}`); }}
        >
          <input placeholder="Rechercher dans le forum..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          <button type="submit" className="secondary">🔍</button>
          <Link to="/forum/latest" className="icon-btn">🕒 Derniers messages</Link>
          {user && <button type="button" className="secondary" onClick={markRead}>✓ Tout marquer comme lu</button>}
        </form>
      </div>

      {data.roots.filter((r: any) => r.isCategory).map((c: any) => (
        <ForumTable key={c.id} title={c.name} forums={c.subforums} isSection />
      ))}
      {loose.length > 0 && <ForumTable title="Forums" forums={loose} />}
      {data.roots.length === 0 && <p className="muted">Aucun forum pour l'instant.</p>}

      {data.stats && (
        <div className="panel muted" style={{ fontSize: 13 }}>
          <strong style={{ color: 'var(--gold-bright)' }}>Statistiques</strong> — {data.stats.posts} message(s) · {data.stats.topics} sujet(s) · {data.stats.members} membre(s)
          {data.stats.newestMember && <> · Dernier inscrit : <UserLink user={data.stats.newestMember} /></>}
          <div style={{ marginTop: 6 }}>🟡 nouveaux messages · 💬 aucun nouveau message · 🔒 verrouillé</div>
        </div>
      )}
    </div>
  );
}
