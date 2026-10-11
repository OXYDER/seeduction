import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { timeAgo } from '../lib/time';
import { CategoryChip, Progress, StatusChip, VoteButton, errorOf, useSuggestionMeta } from './Suggestions';

interface Detail {
  id: string; title: string; body: string; category: string; status: string; voteCount: number; commentCount: number; statusNote: string | null; statusAt: string | null;
  createdAt: string; voted: boolean; threshold: number; author: { id: string; username: string; role: string };
  duplicateOf: { id: string; title: string } | null; statusBy: { id: string; username: string } | null;
  comments: { id: string; content: string; staff: boolean; createdAt: string; user: { id: string; username: string; role: string } }[];
}

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Une suggestion : le vote, la réponse de l'équipe, les commentaires, et pour le staff de quoi la faire avancer. */
export default function SuggestionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accountId = user?.profile?.account ?? user?.id;
  const isStaff = STAFF.includes(user?.role ?? '');
  const [meta] = useSuggestionMeta();
  const [s, setS] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: '', body: '', category: 'OTHER' });

  const load = useCallback(() => api.get(`/suggestions/${id}`).then((r) => setS(r.data)).catch((e) => setErr(errorOf(e))), [id]);
  useEffect(() => { load(); }, [load]);

  if (err && !s) return <div className="panel"><p style={{ color: 'var(--danger)' }}>{err}</p><Link to="/suggestions">← Toutes les suggestions</Link></div>;
  if (!s) return <p className="muted">Chargement...</p>;

  const mine = s.author.id === accountId;
  const canEdit = isStaff || (mine && s.status === 'OPEN');
  const canDelete = isStaff || (mine && s.status === 'OPEN' && s.voteCount <= 1 && s.commentCount === 0);

  async function sendComment() {
    if (!comment.trim()) return;
    setBusy(true); setErr('');
    try { await api.post(`/suggestions/${s!.id}/comments`, { content: comment }); setComment(''); await load(); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function removeComment(cid: string) {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    await api.delete(`/suggestions/comments/${cid}`).catch((e) => setErr(errorOf(e)));
    load();
  }
  async function saveEdit() {
    setErr('');
    try { await api.patch(`/suggestions/${s!.id}`, edit); setEditing(false); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function remove() {
    if (!window.confirm('Supprimer cette suggestion ?')) return;
    try { await api.delete(`/suggestions/${s!.id}`); navigate('/suggestions'); } catch (e) { setErr(errorOf(e)); }
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 860 }}>
      <Link to="/suggestions" className="muted">← Toutes les suggestions</Link>
      <div className="panel sg-detail">
        <VoteButton item={s} onVoted={(v) => setS((d) => (d ? { ...d, voted: v.voted, voteCount: v.voteCount, status: v.status } : d))} />
        <div className="sg-main">
          {editing ? (
            <div className="grid" style={{ gap: 8 }}>
              <input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
              <textarea rows={8} value={edit.body} maxLength={4000} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
              <div className="row" style={{ gap: 8 }}><button type="button" onClick={saveEdit}>Enregistrer</button><button type="button" className="secondary" onClick={() => setEditing(false)}>Annuler</button></div>
            </div>
          ) : (
            <>
              <h1 style={{ margin: 0, fontSize: 22 }}>{s.title}</h1>
              <div className="sg-chips"><StatusChip meta={meta} id={s.status} /><CategoryChip meta={meta} id={s.category} /></div>
              <p className="sg-body">{s.body}</p>
              <div className="muted sg-meta">Proposée par {s.author.username} · {timeAgo(s.createdAt)}</div>
              <Progress votes={s.voteCount} threshold={s.threshold} status={s.status} />
              {(canEdit || canDelete) && (
                <div className="row" style={{ gap: 8 }}>
                  {canEdit && <button type="button" className="secondary" onClick={() => { setEdit({ title: s.title, body: s.body, category: s.category }); setEditing(true); }}>✏️ Modifier</button>}
                  {canDelete && <button type="button" className="secondary" onClick={remove}>🗑️ Supprimer</button>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {(s.statusNote || s.duplicateOf) && s.status !== 'OPEN' && (
        <div className="panel sg-reply">
          <strong>💬 Réponse de l'équipe{s.statusBy ? ` (${s.statusBy.username})` : ''}{s.statusAt ? ` · ${timeAgo(s.statusAt)}` : ''}</strong>
          {s.statusNote && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{s.statusNote}</p>}
          {s.duplicateOf && <p style={{ margin: '6px 0 0' }}>🔁 Doublon de <Link to={`/suggestions/${s.duplicateOf.id}`}>{s.duplicateOf.title}</Link> : les votes y ont été transférés.</p>}
        </div>
      )}

      {isStaff && meta && <StaffPanel s={s} meta={meta} onChanged={load} />}

      <div className="panel grid" style={{ gap: 10 }}>
        <div className="panel-title"><span className="title-icon">💬</span>Commentaires ({s.commentCount})</div>
        {s.comments.length === 0 && <p className="muted" style={{ margin: 0 }}>Pas encore de commentaire.</p>}
        {s.comments.map((c) => (
          <div key={c.id} className="sg-comment">
            <div className="muted sg-meta"><strong>{c.user.username}</strong>{c.staff && <span className="badge" style={{ marginLeft: 6 }}>Équipe</span>} · {timeAgo(c.createdAt)}
              {(c.user.id === accountId || isStaff) && <button type="button" className="secondary" style={{ marginLeft: 8, padding: '0 8px', fontSize: 11 }} onClick={() => removeComment(c.id)}>Supprimer</button>}
            </div>
            <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{c.content}</p>
          </div>
        ))}
        <textarea rows={5} placeholder="Ajoute ton avis, un détail, un cas d'usage…" value={comment} maxLength={meta?.limits.commentMax ?? 5000} onChange={(e) => setComment(e.target.value)} />
        <span className="muted" style={{ fontSize: 12, marginTop: -6 }}>{comment.length} / {meta?.limits.commentMax ?? 5000} caractères</span>
        {err && <p style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>}
        <div><button type="button" onClick={sendComment} disabled={busy || !comment.trim()}>Commenter</button></div>
      </div>
    </div>
  );
}

/** Équipe : faire avancer la suggestion. Un refus demande une explication ; un doublon transfère ses votes. */
function StaffPanel({ s, meta, onChanged }: { s: Detail; meta: NonNullable<ReturnType<typeof useSuggestionMeta>[0]>; onChanged: () => void }) {
  const [status, setStatus] = useState(s.status);
  const [note, setNote] = useState(s.statusNote ?? '');
  const [dupId, setDupId] = useState('');
  const [dupQ, setDupQ] = useState('');
  const [options, setOptions] = useState<{ id: string; title: string; voteCount: number }[]>([]);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (status !== 'DUPLICATE' || dupQ.trim().length < 3) { setOptions([]); return; }
    const t = setTimeout(() => { api.get('/suggestions', { params: { view: 'all', q: dupQ, sort: 'votes' } }).then((r) => setOptions((r.data.items as any[]).filter((i) => i.id !== s.id && i.status !== 'DUPLICATE'))).catch(() => undefined); }, 300);
    return () => clearTimeout(t);
  }, [dupQ, status, s.id]);

  async function save() {
    setErr(''); setOk('');
    try { await api.post(`/suggestions/${s.id}/status`, { status, note, duplicateOfId: status === 'DUPLICATE' ? dupId : undefined }); setOk('✓ Enregistré : l\'auteur et les votants sont prévenus'); onChanged(); }
    catch (e) { setErr(errorOf(e)); }
  }

  return (
    <div className="panel grid" style={{ gap: 10, borderLeft: '3px solid #f59e0b' }}>
      <div className="panel-title"><span className="title-icon">🛡️</span>Équipe : faire avancer</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {meta.statuses.map((st) => <button key={st.id} type="button" className={status === st.id ? '' : 'secondary'} onClick={() => setStatus(st.id)}>{st.icon} {st.label}</button>)}
      </div>
      <textarea rows={6} maxLength={meta.limits.noteMax} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'DECLINED' ? 'Explique en une phrase pourquoi (obligatoire) : les membres qui ont voté seront prévenus' : 'Message pour les membres (facultatif) : ce qui est prévu, quand, comment…'} />
      <span className="muted" style={{ fontSize: 12, marginTop: -6 }}>{note.length} / {meta.limits.noteMax} caractères</span>
      {status === 'DUPLICATE' && (
        <div className="grid" style={{ gap: 6 }}>
          <input placeholder="Chercher la suggestion qui la remplace (titre)…" value={dupQ} onChange={(e) => setDupQ(e.target.value)} />
          {options.map((o) => <label key={o.id} className="row" style={{ gap: 8 }}><input type="radio" style={{ width: 'auto' }} name="dup" checked={dupId === o.id} onChange={() => setDupId(o.id)} /> ▲ {o.voteCount} · {o.title}</label>)}
          <span className="muted" style={{ fontSize: 12 }}>Les votes de celle-ci sont ajoutés à la suggestion choisie (sans double vote).</span>
        </div>
      )}
      {err && <p style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>}
      {ok && <p style={{ color: 'var(--success)', margin: 0 }}>{ok}</p>}
      <div><button type="button" onClick={save}>Enregistrer</button></div>
    </div>
  );
}
