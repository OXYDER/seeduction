import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import ReportButton from './ReportButton';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const VISIBILITY: Record<string, { icon: string; label: string }> = {
  ME: { icon: '🔒', label: 'Moi seul' }, FRIENDS: { icon: '👫', label: 'Mes amis' }, MEMBERS: { icon: '👥', label: 'Tous les membres du site' }, TEAM: { icon: '🏴', label: 'Ma team seulement' },
};

type Source = { kind: 'user'; id: string } | { kind: 'team'; id: string } | { kind: 'feed' };
const urlOf = (s: Source, before?: string) => `/wall/${s.kind === 'feed' ? 'feed' : `${s.kind}/${s.id}`}${before ? `?before=${encodeURIComponent(before)}` : ''}`;

/** Le nom d'un auteur, cliquable sauf s'il est anonyme. */
function AuthorName({ author }: { author: { id: string | null; username: string; avatarUrl?: string | null } }) {
  return author.id ? <Link to={`/users/${author.id}`} className="user-link" style={{ fontWeight: 700 }}>{author.username}</Link> : <span style={{ fontWeight: 700 }}>{author.username}</span>;
}

/** Zone pour écrire : texte, image envoyée sur le site, lien, et qui peut lire. */
function Composer({ teamId, onPosted, torrentId, compact }: { teamId?: string; onPosted: (post: any) => void; torrentId?: string; compact?: boolean }) {
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [visibility, setVisibility] = useState(teamId ? 'TEAM' : 'MEMBERS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const options = teamId ? ['TEAM', 'MEMBERS'] : ['MEMBERS', 'FRIENDS', 'ME'];

  async function upload(f: File) {
    setBusy(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', f);
      const { data } = await api.post('/chat/images/upload', fd);
      setImageUrl(data.url);
    } catch (e: any) { setError(e.response?.data?.message ?? "Image refusée (JPG, PNG ou WebP, 10 Mo max)"); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  async function publish() {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/wall/posts', { content, imageUrl: imageUrl || undefined, linkUrl: linkUrl.trim() || undefined, teamId, torrentId, visibility });
      setContent(''); setImageUrl(''); setLinkUrl(''); setShowLink(false);
      onPosted(data);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Publication impossible'); } finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 8 }}>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={compact ? 2 : 3} placeholder={teamId ? 'Écris quelque chose à ta team…' : torrentId ? 'Ajoute un mot sur ce torrent (facultatif)…' : "Quoi de neuf ? Un statut, une trouvaille, un lien…"} style={{ resize: 'vertical' }} />
      {imageUrl && (
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <img src={imageUrl} alt="" style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8 }} />
          <button type="button" className="secondary" onClick={() => setImageUrl('')}>✕ Retirer</button>
        </div>
      )}
      {showLink && <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… (lien à partager)" maxLength={500} />}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <button type="button" className="icon-btn" disabled={busy} onClick={() => file.current?.click()}>🖼️ Image</button>
        <button type="button" className="icon-btn" onClick={() => setShowLink((v) => !v)}>🔗 Lien</button>
        <label className="row muted" style={{ gap: 6, marginLeft: 'auto' }}>
          Visible par
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={{ width: 'auto' }}>
            {options.map((o) => <option key={o} value={o}>{VISIBILITY[o].icon} {VISIBILITY[o].label}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || (!content.trim() && !imageUrl && !linkUrl.trim() && !torrentId)} onClick={() => void publish()}>Publier</button>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}

function Comments({ postId, onCount }: { postId: string; onCount: (n: number) => void }) {
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/wall/posts/${postId}/comments`).then((r) => { setItems(r.data); onCount(r.data.length); }).catch(() => setItems([])); }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      const { data } = await api.post(`/wall/posts/${postId}/comments`, { content: text });
      const next = [...(items ?? []), data]; setItems(next); onCount(next.length); setText('');
    } catch (err: any) { setError(err.response?.data?.message ?? 'Envoi impossible'); }
  }
  async function remove(id: string) {
    await api.delete(`/wall/comments/${id}`).catch(() => undefined);
    const next = (items ?? []).filter((c) => c.id !== id); setItems(next); onCount(next.length);
  }
  return (
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {items === null && <span className="muted">Chargement…</span>}
      {items?.map((c) => (
        <div key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Avatar user={c.author} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div><AuthorName author={c.author} /> <span className="muted" style={{ fontSize: 12 }}>{timeAgo(c.createdAt)}</span></div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.content}</div>
          </div>
          {c.author.id !== me?.id && <ReportButton targetType="wallComment" targetId={c.id} label="🚩" compact />}
          {c.canDelete && <button type="button" className="secondary" title="Supprimer" onClick={() => void remove(c.id)}>🗑️</button>}
        </div>
      ))}
      <form onSubmit={send} className="row" style={{ gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Écrire un commentaire…" style={{ flex: 1 }} />
        <button type="submit" disabled={!text.trim()}>Envoyer</button>
      </form>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}

function PostCard({ post, onDelete }: { post: any; onDelete: (id: string) => void }) {
  const me = useAuthStore((s) => s.user);
  const [reactions, setReactions] = useState<{ counts: Record<string, number>; mine: string | null }>(post.reactions);
  const [commentCount, setCommentCount] = useState<number>(post.commentCount);
  const [showComments, setShowComments] = useState(false);
  const [picker, setPicker] = useState(false);
  const vis = VISIBILITY[post.visibility];
  const total = Object.values(reactions.counts).reduce((a, b) => a + b, 0);

  async function react(type: string) {
    setPicker(false);
    try {
      const r = reactions.mine === type ? await api.delete(`/wall/posts/${post.id}/react`) : await api.put(`/wall/posts/${post.id}/react`, { type });
      setReactions(r.data);
    } catch { /* inchangé */ }
  }
  async function remove() {
    if (!window.confirm('Supprimer cette publication ?')) return;
    await api.delete(`/wall/posts/${post.id}`).catch(() => undefined);
    onDelete(post.id);
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <Avatar user={post.author} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <AuthorName author={post.author} />
          <div className="muted" style={{ fontSize: 12 }}>{timeAgo(post.createdAt)}{vis && <span title={vis.label}> · {vis.icon} {vis.label}</span>}</div>
        </div>
        {post.author.id !== me?.id && <ReportButton targetType="wallPost" targetId={post.id} label="🚩" compact />}
        {post.canDelete && <button type="button" className="secondary" title="Supprimer la publication" onClick={() => void remove()}>🗑️</button>}
      </div>
      {post.content && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.content}</div>}
      {post.imageUrl && <a href={post.imageUrl} target="_blank" rel="noopener noreferrer"><img src={post.imageUrl} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8 }} /></a>}
      {post.linkUrl && (
        <a href={post.linkUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="panel" style={{ display: 'block', wordBreak: 'break-all' }}>
          🔗 {new URL(post.linkUrl).hostname.replace(/^www\./, '')}<span className="muted" style={{ fontSize: 12 }}> — {post.linkUrl.length > 90 ? post.linkUrl.slice(0, 90) + '…' : post.linkUrl}</span>
        </a>
      )}
      {post.torrent && (post.torrent.unavailable
        ? <div className="panel muted">Ce torrent n'est plus disponible.</div>
        : (
          <Link to={`/torrents/${post.torrent.id}`} className="panel row" style={{ gap: 10, alignItems: 'center' }}>
            {post.torrent.coverImage && <img src={post.torrent.coverImage} alt="" loading="lazy" style={{ height: 72, borderRadius: 6 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{post.torrent.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{formatBytes(post.torrent.size)} · 🌱 {post.torrent.seeders} seeders</div>
            </div>
          </Link>
        ))}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
        <button type="button" className="icon-btn" onClick={() => (reactions.mine ? void react(reactions.mine) : setPicker((v) => !v))}>{reactions.mine ?? '👍'} {reactions.mine ? 'Retirer' : "J'aime"}</button>
        {reactions.mine === null && picker && (
          <span className="panel row" style={{ gap: 4, padding: 4 }}>{REACTIONS.map((r) => <button key={r} type="button" className="icon-btn" onClick={() => void react(r)}>{r}</button>)}</span>
        )}
        {total > 0 && <span className="muted">{REACTIONS.filter((r) => reactions.counts[r]).map((r) => `${r} ${reactions.counts[r]}`).join('  ')}</span>}
        <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowComments((v) => !v)}>💬 {commentCount > 0 ? `${commentCount} commentaire${commentCount > 1 ? 's' : ''}` : 'Commenter'}</button>
      </div>
      {showComments && <Comments postId={post.id} onCount={setCommentCount} />}
    </div>
  );
}

function EventCard({ ev }: { ev: any }) {
  return (
    <div className="panel muted row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
      {ev.event === 'UPLOAD' && <><span>📤</span><span>A partagé <Link to={`/torrents/${ev.torrent.id}`}>{ev.torrent.name}</Link></span></>}
      {ev.event === 'BADGE' && <><span>{ev.badge.icon}</span><span>A obtenu le badge <b>{ev.badge.name}</b></span></>}
      {ev.event === 'TEAM_JOIN' && <><span>🏴</span><span>A rejoint la team <Link to={`/teams/${ev.team.id}`}>{ev.team.name}</Link></span></>}
      {ev.event === 'TEAM_LEADER' && <><span>👑</span><span>Est devenu chef de la team <Link to={`/teams/${ev.team.id}`}>{ev.team.name}</Link></span></>}
      <span style={{ marginLeft: 'auto', fontSize: 12 }}>{timeAgo(ev.createdAt)}</span>
    </div>
  );
}

/** Le Mur : sur un profil (`user`), la page d'une team (`team`) ou le fil des proches (`feed`). Réservé aux membres du site. */
export default function Wall({ source, title, empty }: { source: Source; title?: string; empty?: string }) {
  const key = `${source.kind}:${'id' in source ? source.id : ''}`;
  const [items, setItems] = useState<any[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoaded(false); setItems([]); setError('');
    api.get(urlOf(source)).then((r) => { setItems(r.data.items); setCanPost(!!r.data.canPost); setNext(r.data.next); }).catch((e) => setError(e.response?.data?.message ?? 'Mur indisponible')).finally(() => setLoaded(true));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function more() {
    if (!next) return;
    const r = await api.get(urlOf(source, next)).catch(() => null);
    if (r) { setItems((prev) => [...prev, ...r.data.items]); setNext(r.data.next); }
  }

  const composerTeam = source.kind === 'team' ? source.id : undefined;
  const showComposer = source.kind === 'feed' || canPost;

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {title && <h2 style={{ margin: 0 }}>{title}</h2>}
      {showComposer && <Composer teamId={composerTeam} onPosted={(p) => setItems((prev) => [p, ...prev])} />}
      {!loaded && <span className="muted">Chargement…</span>}
      {error && <div className="panel muted">{error}</div>}
      {loaded && !error && items.length === 0 && <div className="panel muted">{empty ?? "Rien à afficher pour l'instant."}</div>}
      {items.map((it) => (it.kind === 'EVENT' ? <EventCard key={it.id} ev={it} /> : <PostCard key={it.id} post={it} onDelete={(id) => setItems((prev) => prev.filter((p) => p.id !== id))} />))}
      {next && <button type="button" className="secondary" onClick={() => void more()}>Voir plus</button>}
    </section>
  );
}

/** Bouton « Partager sur mon mur » d'une fiche torrent : petit formulaire avec mot facultatif et visibilité. */
export function ShareToWall({ torrentId }: { torrentId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className="muted">✓ Partagé sur ton mur</span>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)}>📣 Partager sur mon mur</button>
      {open && <Composer torrentId={torrentId} compact onPosted={() => { setDone(true); setOpen(false); }} />}
    </div>
  );
}
