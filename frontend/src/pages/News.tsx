import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { bbcodeToHtml } from '../lib/bbcode';
import { timeAgo } from '../lib/time';
import { kindOf, NEWS_KINDS, useNewsUnseen } from '../lib/news';
import { readingMinutes } from '../lib/wikiSections';
import { Pagination } from '../components/ForumBits';
import UserLink from '../components/UserLink';
import Avatar from '../components/Avatar';
import NewsEditor from '../components/NewsEditor';
import { useCrumbTitle } from '../store/crumbs';

const ambient = (url?: string | null) => (url ? ({ '--ambient': `url("${url.replace(/"/g, '%22')}")` } as React.CSSProperties) : undefined);
const plain = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

function KindBadge({ kind }: { kind?: string }) {
  const k = kindOf(kind);
  return <span className={`news-kind k-${(kind ?? 'NEWS').toLowerCase()}`}>{k.icon} {k.label}</span>;
}

function Card({ n, big, canEdit, onEdit }: { n: any; big?: boolean; canEdit: boolean; onEdit: () => void }) {
  const text = n.summary || plain(n.content).slice(0, big ? 280 : 160);
  return (
    <article className={`news-card${big ? ' big' : ''}`} id={`news-${n.id}`}>
      <Link to={`/news/${n.id}`} className={`news-card-img${n.imageUrl ? ' ambient' : ' none'}`} style={ambient(n.imageUrl)} aria-label={n.title}>
        {n.imageUrl ? <img src={n.imageUrl} alt="" loading="lazy" /> : <span>{kindOf(n.kind).icon}</span>}
        {n.pinned && <span className="news-pin">📌 Épinglée</span>}
      </Link>
      <div className="news-card-body">
        <div><KindBadge kind={n.kind} /></div>
        <h2><Link to={`/news/${n.id}`}>{n.title}</Link></h2>
        <p>{text}{text.length >= (big ? 280 : 160) && '…'}</p>
        <div className="news-card-meta">
          {n.author && <Avatar user={n.author} size={22} />}
          <span>{n.author?.username} · {timeAgo(n.createdAt)}</span>
          <span className="news-counts" title="Réactions · commentaires · lecteurs">
            {n._count?.reactions > 0 && <span>❤️ {n._count.reactions}</span>}
            <span>💬 {n._count?.comments ?? 0}</span>
            <span>👁 {n._count?.views ?? 0}</span>
          </span>
          {canEdit && <button type="button" className="secondary news-edit-btn" onClick={onEdit} title="Modifier cette nouvelle">✏️ Modifier</button>}
        </div>
      </div>
    </article>
  );
}

/** Toutes les nouvelles (filtres, recherche, grande carte + grille), ou une seule (réactions, commentaires) quand un identifiant est dans l'adresse. */
export default function News() {
  const { id } = useParams();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = STAFF.includes(role ?? '');
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') ?? '1', 10);
  const kind = params.get('kind') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [feed, setFeed] = useState<any>(null);
  const [single, setSingle] = useState<any>(null);
  useCrumbTitle(single?.title);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [rev, setRev] = useState(0);
  const markSeen = useNewsUnseen((s) => s.markSeen);

  useEffect(() => { markSeen(); }, [markSeen, id]);

  // La recherche attend la fin de la frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = params.get('q') ?? '';
      if (q.trim() !== cur) { const p = new URLSearchParams(params); if (q.trim()) p.set('q', q.trim()); else p.delete('q'); p.delete('page'); setParams(p, { replace: true }); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setError('');
    if (id) {
      setSingle(null);
      api.get(`/announcements/${id}`).then((r) => setSingle(r.data)).catch(() => setError('Nouvelle introuvable'));
    } else {
      api.get('/announcements/feed', { params: { page, pageSize: 10, kind: kind || undefined, q: params.get('q') || undefined } }).then((r) => setFeed(r.data)).catch(() => setError('Nouvelles indisponibles'));
    }
  }, [id, page, kind, params.get('q'), rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = () => { setEditing(null); setRev((r) => r + 1); };

  if (error) return <div className="panel"><p className="muted">{error}</p><Link to="/news">← Toutes les nouvelles</Link></div>;

  if (id) {
    if (!single) return <p className="muted">Chargement...</p>;
    if (editing === single.id) return <NewsEditor item={single} onSaved={saved} onCancel={() => setEditing(null)} />;
    return <NewsArticle n={single} canEdit={canEdit} onEdit={() => setEditing(single.id)} onChanged={() => setRev((r) => r + 1)} />;
  }

  if (!feed) return <p className="muted">Chargement...</p>;
  const items: any[] = feed.items;
  const setKind = (k: string) => { const p = new URLSearchParams(params); if (k) p.set('kind', k); else p.delete('kind'); p.delete('page'); setParams(p); };
  const filtered = !!(kind || params.get('q'));
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>📰 Nouvelles</h1>
        {canEdit && <button type="button" onClick={() => setEditing('new')}>➕ Nouvelle nouvelle</button>}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={`secondary${!kind ? ' on' : ''}`} onClick={() => setKind('')}>Toutes</button>
        {Object.entries(NEWS_KINDS).map(([k, v]) => <button key={k} type="button" className={`secondary${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{v.icon} {v.label}</button>)}
        <input type="search" placeholder="Chercher dans les nouvelles…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', minWidth: 200 }} />
      </div>
      {editing === 'new' && <NewsEditor onSaved={saved} onCancel={() => setEditing(null)} />}
      {items.length === 0 && <p className="muted">{filtered ? 'Aucune nouvelle ne correspond.' : "Aucune nouvelle pour l'instant."}</p>}
      <div className="news-grid">
        {items.map((n, i) => editing === n.id
          ? <div key={n.id} style={{ gridColumn: '1 / -1' }}><NewsEditor item={n} onSaved={saved} onCancel={() => setEditing(null)} /></div>
          : <Card key={n.id} n={n} big={i === 0 && page === 1 && !filtered} canEdit={canEdit} onEdit={() => setEditing(n.id)} />)}
      </div>
      <Pagination page={feed.page} total={feed.total} pageSize={feed.pageSize} onPage={(p) => { const np = new URLSearchParams(params); np.set('page', String(p)); setParams(np); }} />
    </div>
  );
}

/** Une nouvelle : contenu, réactions, commentaires, précédente / suivante et autres à lire. */
function NewsArticle({ n, canEdit, onEdit, onChanged }: { n: any; canEdit: boolean; onEdit: () => void; onChanged: () => void }) {
  const me = useAuthStore((s) => s.user);
  const { hash } = useLocation();
  const [mine, setMine] = useState<string | null>(n.myReaction);
  const [counts, setCounts] = useState<Record<string, number>>(n.reactionCounts);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setMine(n.myReaction); setCounts(n.reactionCounts); }, [n.id, n.myReaction, n.reactionCounts]);
  useEffect(() => { if (hash === '#commentaires') setTimeout(() => document.getElementById('commentaires')?.scrollIntoView({ behavior: 'smooth' }), 300); }, [hash, n.id]);

  async function react(emoji: string) {
    const before = { mine, counts };
    const same = mine === emoji;
    const next = { ...counts };
    if (mine) next[mine] = Math.max(0, (next[mine] ?? 0) - 1);
    if (!same) next[emoji] = (next[emoji] ?? 0) + 1;
    setCounts(next); setMine(same ? null : emoji);
    try { if (same) await api.delete(`/announcements/${n.id}/reaction`); else await api.put(`/announcements/${n.id}/reaction`, { emoji }); }
    catch { setCounts(before.counts); setMine(before.mine); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/news/${n.id}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* presse-papiers refusé */ }
  }

  async function toggleLock() {
    await api.patch(`/announcements/${n.id}`, { commentsLocked: !n.commentsLocked });
    onChanged();
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const minutes = readingMinutes(n.content);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <article className="panel ornate news-full">
        {n.imageUrl && <div className="news-banner ambient" style={ambient(n.imageUrl)}><img src={n.imageUrl} alt="" /></div>}
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><KindBadge kind={n.kind} />{n.pinned && <span className="news-kind">📌 Épinglée</span>}</div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="secondary" onClick={copyLink} title="Copier le lien de cette nouvelle">{copied ? '✓ Lien copié' : '🔗 Partager'}</button>
            {canEdit && <button type="button" className="secondary" onClick={onEdit}>✏️ Modifier</button>}
          </div>
        </div>
        <h1 style={{ margin: '10px 0 0' }}>{n.title}</h1>
        <div className="row muted" style={{ gap: 10, margin: '8px 0', flexWrap: 'wrap' }}>
          {n.author && <Avatar user={n.author} size={26} />}
          <span>{n.author && <UserLink user={n.author} />} · {new Date(n.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</span>
          <span>⏱️ {minutes} min</span>
          <span title="Membres qui l'ont lue">👁 {n._count?.views ?? 0}</span>
          <a href="#commentaires" className="muted">💬 {n._count?.comments ?? 0}</a>
        </div>
        {n.summary && <p className="news-lead">{n.summary}</p>}
        <div className="ornate-divider" />
        <div className="bbcode-content" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(n.content) }} />

        <div className="news-reactions" aria-label="Réactions">
          {n.reactionChoices.map((e: string) => (
            <button key={e} type="button" className={`news-react${mine === e ? ' on' : ''}`} onClick={() => react(e)} title={mine === e ? 'Retirer ma réaction' : 'Réagir'} disabled={!me}>
              <span>{e}</span>{(counts[e] ?? 0) > 0 && <b>{counts[e]}</b>}
            </button>
          ))}
          <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{total > 0 ? `${total} réaction${total > 1 ? 's' : ''}` : 'Sois le premier à réagir'}</span>
        </div>
      </article>

      <Comments n={n} canStaff={canEdit} onToggleLock={toggleLock} onCount={onChanged} />

      {(n.older || n.newer) && (
        <div className="wiki-prevnext">
          {n.older ? <Link to={`/news/${n.older.id}`} className="panel"><span className="muted">← Plus ancienne</span><strong>{n.older.title}</strong></Link> : <span />}
          {n.newer ? <Link to={`/news/${n.newer.id}`} className="panel" style={{ textAlign: 'right' }}><span className="muted">Plus récente →</span><strong>{n.newer.title}</strong></Link> : <span />}
        </div>
      )}

      {n.more?.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>À lire aussi</h3>
          <div className="news-more">
            {n.more.map((m: any) => (
              <Link key={m.id} to={`/news/${m.id}`} className="news-more-item">
                {m.imageUrl ? <img src={m.imageUrl} alt="" loading="lazy" /> : <span className="news-more-ph">{kindOf(m.kind).icon}</span>}
                <span><strong>{m.title}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{timeAgo(m.createdAt)}</span></span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <Link to="/news">← Toutes les nouvelles</Link>
    </div>
  );
}

function Comments({ n, canStaff, onToggleLock, onCount }: { n: any; canStaff: boolean; onToggleLock: () => void; onCount: () => void }) {
  const me = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = (p = page) => api.get(`/announcements/${n.id}/comments`, { params: { page: p } }).then((r) => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 }));
  useEffect(() => { void load(page); }, [n.id, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      await api.post(`/announcements/${n.id}/comments`, { content: text });
      setText('');
      const r = await api.get(`/announcements/${n.id}/comments`, { params: { page: 1 } });
      const last = Math.max(1, Math.ceil(r.data.total / r.data.pageSize));
      setPage(last);
      await load(last);
      onCount();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Envoi impossible'); } finally { setBusy(false); }
  }

  async function saveEdit(id: string) {
    try { await api.patch(`/announcements/comments/${id}`, { content: editText }); setEditId(null); await load(); } catch (err: any) { setError(err.response?.data?.message ?? 'Modification impossible'); }
  }
  async function remove(id: string) {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    try { await api.delete(`/announcements/comments/${id}`); await load(); onCount(); } catch (err: any) { setError(err.response?.data?.message ?? 'Suppression impossible'); }
  }

  return (
    <div className="panel" id="commentaires">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>💬 Commentaires {data && <span className="muted" style={{ fontWeight: 400 }}>({data.total})</span>}</h3>
        {canStaff && <button type="button" className="secondary" onClick={onToggleLock}>{n.commentsLocked ? '🔓 Rouvrir les commentaires' : '🔒 Fermer les commentaires'}</button>}
      </div>

      {n.commentsLocked
        ? <p className="muted">🔒 Les commentaires sont fermés pour cette nouvelle.</p>
        : me && (
          <form onSubmit={send} style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
            <textarea rows={3} placeholder="Écris un commentaire…" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
            <div className="row" style={{ gap: 8 }}><button type="submit" disabled={busy || !text.trim()}>Commenter</button>{text.length > 2500 && <span className="muted">{text.length} / 3000</span>}</div>
          </form>
        )}
      {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}

      {!data ? <p className="muted">Chargement…</p> : data.items.length === 0 ? <p className="muted">Aucun commentaire pour l'instant.</p> : (
        <div className="news-comments">
          {data.items.map((c: any) => (
            <div key={c.id} className="news-comment">
              {c.author ? <Avatar user={c.author} size={34} /> : <span style={{ width: 34 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <strong>{c.author ? <UserLink user={c.author} /> : '(membre supprimé)'}</strong>
                  <span className="muted" style={{ fontSize: 12 }} title={new Date(c.createdAt).toLocaleString('fr-FR')}>{timeAgo(c.createdAt)}{c.editedAt && ' · modifié'}</span>
                  {me && (c.authorId === me.id || STAFF.includes(me.role)) && editId !== c.id && (
                    <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                      {c.authorId === me.id && <button type="button" className="secondary news-mini" onClick={() => { setEditId(c.id); setEditText(c.content); }}>✏️</button>}
                      <button type="button" className="secondary news-mini" onClick={() => remove(c.id)} title="Supprimer">🗑️</button>
                    </span>
                  )}
                </div>
                {editId === c.id ? (
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={3000} />
                    <div className="row" style={{ gap: 6 }}><button type="button" onClick={() => saveEdit(c.id)}>Enregistrer</button><button type="button" className="secondary" onClick={() => setEditId(null)}>Annuler</button></div>
                  </div>
                ) : <p className="news-comment-text">{c.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </div>
  );
}
