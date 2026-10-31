import { useEffect, useRef, useState, type ReactNode } from 'react';
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
const MENTION_CHARS = '\\p{L}\\p{N}_.·-';

/** Le nom d'un auteur, cliquable sauf s'il est anonyme. */
function AuthorName({ author }: { author: { id: string | null; username: string; avatarUrl?: string | null } }) {
  return author.id ? <Link to={`/users/${author.id}`} className="user-link" style={{ fontWeight: 700 }}>{author.username}</Link> : <span style={{ fontWeight: 700 }}>{author.username}</span>;
}

/** Texte d'une publication ou d'un commentaire : les @pseudo ouvrent le profil, les adresses http(s) deviennent des liens (jamais suivis par les moteurs de recherche). */
function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = new RegExp(`(https?:\\/\\/[^\\s<]+)|(?<![\\p{L}\\p{N}_.@/])@([${MENTION_CHARS}]{2,50})`, 'gu');
  let last = 0; let key = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const url = m[1].replace(/[.,;:!?)\]]+$/, '');
      out.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer nofollow ugc">{url.length > 60 ? url.slice(0, 60) + '…' : url}</a>);
      out.push(m[1].slice(url.length));
    } else {
      const name = m[2].replace(/[.\-·]+$/, '');
      out.push(<Link key={key++} to={`/u/${encodeURIComponent(name)}`} className="user-link" style={{ fontWeight: 600 }}>@{name}</Link>);
      out.push(m[2].slice(name.length));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{out}</div>;
}

/** Champ texte qui propose les membres quand on tape « @ » (Tab, Entrée ou un clic pour choisir). */
function MentionField({ value, onChange, multiline, onSubmit, ...rest }: { value: string; onChange: (v: string) => void; multiline?: boolean; onSubmit?: () => void; placeholder?: string; maxLength?: number; rows?: number; autoFocus?: boolean }) {
  const [list, setList] = useState<{ id: string; username: string; avatarUrl?: string | null }[]>([]);
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const query = (text: string, caret: number) => new RegExp(`(?:^|[^\\p{L}\\p{N}_.@/])@([${MENTION_CHARS}]{1,50})$`, 'u').exec(text.slice(0, caret))?.[1] ?? null;

  function change(text: string, caret: number) {
    onChange(text);
    window.clearTimeout(timer.current);
    const q = query(text, caret);
    if (!q) { setList([]); return; }
    timer.current = window.setTimeout(() => {
      api.get('/search/suggest', { params: { q, scopes: 'users' } }).then((r) => { setList((r.data?.users ?? []).slice(0, 6)); setIndex(0); }).catch(() => setList([]));
    }, 180);
  }
  function pick(u: { username: string }) {
    const caret = ref.current?.selectionStart ?? value.length;
    const head = value.slice(0, caret).replace(new RegExp(`@[${MENTION_CHARS}]*$`, 'u'), `@${u.username} `);
    onChange(head + value.slice(caret));
    setList([]);
    window.setTimeout(() => { ref.current?.focus(); ref.current?.setSelectionRange(head.length, head.length); }, 0);
  }
  function key(e: React.KeyboardEvent) {
    if (list.length) {
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); pick(list[index] ?? list[0]); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length); return; }
      if (e.key === 'Escape') { setList([]); return; }
    }
    if (!multiline && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); }
  }
  const common = { ref, value, onKeyDown: key, onBlur: () => window.setTimeout(() => setList([]), 150), ...rest };
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {multiline
        ? <textarea {...common} onChange={(e) => change(e.target.value, e.target.selectionStart ?? e.target.value.length)} style={{ resize: 'vertical', width: '100%' }} />
        : <input {...common} onChange={(e) => change(e.target.value, e.target.selectionStart ?? e.target.value.length)} style={{ width: '100%' }} />}
      {list.length > 0 && (
        <div className="panel" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', padding: 4, display: 'grid', gap: 2 }}>
          {list.map((u, i) => (
            <button key={u.id} type="button" role="option" aria-selected={i === index} className={i === index ? '' : 'secondary'} style={{ justifyContent: 'flex-start', textAlign: 'left' }} onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
              <Avatar user={u} size={20} /> @{u.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Zone pour écrire : texte (avec @pseudo), image envoyée sur le site, lien, et qui peut lire. */
function Composer({ teamId: fixedTeam, teams, onPosted, torrentId, compact, autoFocus }: { teamId?: string; /** Teams parmi lesquelles choisir « Publier comme » (accueil) ; sans elle, la cible est fixe. */ teams?: { id: string; name: string }[]; onPosted: (post: any) => void; torrentId?: string; compact?: boolean; autoFocus?: boolean }) {
  const [target, setTarget] = useState<string>(fixedTeam ?? '');
  const teamId = target || undefined;
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [visibility, setVisibility] = useState(fixedTeam ? 'TEAM' : 'MEMBERS');
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
      <MentionField multiline autoFocus={autoFocus} value={content} onChange={setContent} maxLength={2000} rows={compact ? 2 : 3} placeholder={teamId ? 'Écris quelque chose à ta team… (@ pour mentionner)' : torrentId ? 'Ajoute un mot sur ce torrent (facultatif)…' : 'Quoi de neuf ? Un statut, une trouvaille, un lien… (@ pour mentionner)'} />
      {imageUrl && (
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <img src={imageUrl} alt="" style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8 }} />
          <button type="button" className="secondary" onClick={() => setImageUrl('')}>✕ Retirer</button>
        </div>
      )}
      {showLink && <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… (lien à partager : un aperçu s'affichera)" maxLength={500} />}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <button type="button" className="icon-btn" disabled={busy} onClick={() => file.current?.click()}>🖼️ Image</button>
        <button type="button" className="icon-btn" onClick={() => setShowLink((v) => !v)}>🔗 Lien</button>
        {teams && teams.length > 0 && (
          <label className="row muted" style={{ gap: 6, marginLeft: 'auto' }}>
            Publier comme
            <select value={target} onChange={(e) => { setTarget(e.target.value); setVisibility(e.target.value ? 'TEAM' : 'MEMBERS'); }} style={{ width: 'auto' }}>
              <option value="">👤 Moi (mon mur)</option>
              {teams.map((t) => <option key={t.id} value={t.id}>🏴 {t.name} (mur de la team)</option>)}
            </select>
          </label>
        )}
        <label className="row muted" style={{ gap: 6, marginLeft: teams && teams.length > 0 ? 0 : 'auto' }}>
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

function CommentItem({ c, onChange, onDelete }: { c: any; onChange: (c: any) => void; onDelete: (id: string) => void }) {
  const me = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.content);
  const [error, setError] = useState('');
  async function save() {
    setError('');
    try { const { data } = await api.patch(`/wall/comments/${c.id}`, { content: text }); onChange(data); setEditing(false); } catch (e: any) { setError(e.response?.data?.message ?? 'Modification impossible'); }
  }
  return (
    <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
      <Avatar user={c.author} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div><AuthorName author={c.author} /> <span className="muted" style={{ fontSize: 12 }}>{timeAgo(c.createdAt)}{c.editedAt ? ' · modifié' : ''}</span></div>
        {editing ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              <MentionField value={text} onChange={setText} maxLength={1000} onSubmit={() => void save()} autoFocus />
              <button type="button" disabled={!text.trim()} onClick={() => void save()}>Enregistrer</button>
              <button type="button" className="secondary" onClick={() => { setEditing(false); setText(c.content); }}>Annuler</button>
            </div>
            {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          </div>
        ) : <RichText text={c.content} />}
      </div>
      {!editing && c.canEdit && <button type="button" className="secondary" title="Modifier" onClick={() => setEditing(true)}>✏️</button>}
      {c.author.id !== me?.id && <ReportButton targetType="wallComment" targetId={c.id} label="🚩" compact />}
      {c.canDelete && <button type="button" className="secondary" title="Supprimer" onClick={() => onDelete(c.id)}>🗑️</button>}
    </div>
  );
}

function Comments({ postId, onCount }: { postId: string; onCount: (n: number) => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/wall/posts/${postId}/comments`).then((r) => { setItems(r.data); onCount(r.data.length); }).catch(() => setItems([])); }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send() {
    setError('');
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
      {items?.map((c) => <CommentItem key={c.id} c={c} onChange={(u) => setItems((prev) => (prev ?? []).map((x) => (x.id === u.id ? u : x)))} onDelete={(id) => void remove(id)} />)}
      <div className="row" style={{ gap: 8 }}>
        <MentionField value={text} onChange={setText} maxLength={1000} placeholder="Écrire un commentaire… (@ pour mentionner)" onSubmit={() => text.trim() && void send()} />
        <button type="button" disabled={!text.trim()} onClick={() => void send()}>Envoyer</button>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}

/** Modifier sa publication : texte, lien, image (retirer) et visibilité. Le torrent partagé ne change pas. */
function PostEditor({ post, onSaved, onCancel }: { post: any; onSaved: (p: any) => void; onCancel: () => void }) {
  const [content, setContent] = useState<string>(post.content);
  const [linkUrl, setLinkUrl] = useState<string>(post.linkUrl ?? '');
  const [dropImage, setDropImage] = useState(false);
  const [visibility, setVisibility] = useState<string>(post.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = post.teamId ? ['TEAM', 'MEMBERS'] : ['MEMBERS', 'FRIENDS', 'ME'];
  async function save() {
    setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/wall/posts/${post.id}`, { content, linkUrl: linkUrl.trim() || null, visibility, ...(dropImage ? { imageUrl: null } : {}) });
      onSaved(data);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Modification impossible'); } finally { setBusy(false); }
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <MentionField multiline value={content} onChange={setContent} maxLength={2000} rows={3} autoFocus />
      <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Lien (facultatif)" maxLength={500} />
      {post.imageUrl && !dropImage && <div className="row" style={{ gap: 8 }}><img src={post.imageUrl} alt="" style={{ maxHeight: 80, borderRadius: 6 }} /><button type="button" className="secondary" onClick={() => setDropImage(true)}>✕ Retirer l'image</button></div>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="row muted" style={{ gap: 6 }}>
          Visible par
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={{ width: 'auto' }}>
            {options.map((o) => <option key={o} value={o}>{VISIBILITY[o].icon} {VISIBILITY[o].label}</option>)}
          </select>
        </label>
        <button type="button" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => void save()}>Enregistrer</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}

function PostCard({ post: initial, onDelete }: { post: any; onDelete: (id: string) => void }) {
  const me = useAuthStore((s) => s.user);
  const [post, setPost] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [reactions, setReactions] = useState<{ counts: Record<string, number>; mine: string | null }>(initial.reactions);
  const [commentCount, setCommentCount] = useState<number>(initial.commentCount);
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
          <div className="muted" style={{ fontSize: 12 }}>{timeAgo(post.createdAt)}{post.editedAt ? ' · modifié' : ''}{vis && <span title={vis.label}> · {vis.icon} {vis.label}</span>}</div>
        </div>
        {post.canEdit && !editing && <button type="button" className="secondary" title="Modifier la publication" onClick={() => setEditing(true)}>✏️</button>}
        {post.author.id !== me?.id && <ReportButton targetType="wallPost" targetId={post.id} label="🚩" compact />}
        {post.canDelete && <button type="button" className="secondary" title="Supprimer la publication" onClick={() => void remove()}>🗑️</button>}
      </div>
      {editing ? (
        <PostEditor post={post} onCancel={() => setEditing(false)} onSaved={(p) => { setPost(p); setEditing(false); }} />
      ) : (
        <>
          {post.content && <RichText text={post.content} />}
          {post.imageUrl && <a href={post.imageUrl} target="_blank" rel="noopener noreferrer"><img src={post.imageUrl} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8 }} /></a>}
          {post.linkUrl && (
            <a href={post.linkUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="panel" style={{ display: 'grid', gap: 2, wordBreak: 'break-word' }}>
              <span className="muted" style={{ fontSize: 12 }}>🔗 {post.linkPreview?.site ?? new URL(post.linkUrl).hostname.replace(/^www\./, '')}</span>
              {post.linkPreview?.title && <strong>{post.linkPreview.title}</strong>}
              {post.linkPreview?.description && <span className="muted" style={{ fontSize: 13 }}>{post.linkPreview.description}</span>}
              {!post.linkPreview && <span className="muted" style={{ fontSize: 12 }}>{post.linkUrl.length > 90 ? post.linkUrl.slice(0, 90) + '…' : post.linkUrl}</span>}
            </a>
          )}
        </>
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
    <div style={{ display: 'grid', gap: 8, ...(open ? { flexBasis: '100%' } : {}) }}>
      <button type="button" className="icon-btn" style={{ justifySelf: 'start' }} onClick={() => setOpen((v) => !v)}>📣 Partager sur mon mur</button>
      {open && <Composer torrentId={torrentId} compact onPosted={() => { setDone(true); setOpen(false); }} />}
    </div>
  );
}

/** En haut de l'accueil : « Qu'avez-vous en tête ? ». On publie directement sur son mur, ou sur celui de sa team (« Publier comme »). */
export function HomeComposer() {
  const user = useAuthStore((s) => s.user);
  const [me, setMe] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ teamId: string | null } | null>(null);
  useEffect(() => { api.get('/users/me').then((r) => setMe(r.data)).catch(() => undefined); }, []);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), 12_000);
    return () => window.clearTimeout(t);
  }, [done]);
  const first = me?.profile?.name ?? me?.username ?? user?.username ?? '';
  const teams = me?.team ? [{ id: me.team.id as string, name: me.team.name as string }] : [];

  if (open) {
    return (
      <div className="home-compose open" style={{ display: 'grid', gap: 6 }}>
        <Composer teams={teams} autoFocus onPosted={(p) => { setOpen(false); setDone({ teamId: p.teamId ?? null }); }} />
        <button type="button" className="secondary" style={{ justifySelf: 'end' }} onClick={() => setOpen(false)}>✕ Fermer</button>
      </div>
    );
  }
  return (
    <div className="home-compose" style={{ display: 'grid', gap: 6 }}>
      <div className="home-compose-bar">
        <Avatar user={me ?? user} size={40} />
        <button type="button" className="home-compose-input" onClick={() => setOpen(true)}>Qu'avez-vous en tête, {first} ?</button>
        <button type="button" className="icon-btn" title="Publier une image" aria-label="Publier une image" onClick={() => setOpen(true)}>🖼️</button>
        <button type="button" className="icon-btn" title="Partager un lien" aria-label="Partager un lien" onClick={() => setOpen(true)}>🔗</button>
        <button type="button" className="icon-btn" title="Écrire un statut" aria-label="Écrire un statut" onClick={() => setOpen(true)}>😀</button>
      </div>
      {done && (
        <div className="muted" style={{ fontSize: 13 }}>
          ✓ Publié sur {done.teamId ? 'le mur de ta team' : 'ton mur'} · <Link to={done.teamId ? `/teams/${done.teamId}` : `/users/${me?.id}`}>Voir</Link>
        </div>
      )}
    </div>
  );
}
