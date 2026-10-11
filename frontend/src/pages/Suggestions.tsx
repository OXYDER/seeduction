import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { timeAgo } from '../lib/time';

export interface SuggestionMeta {
  categories: { id: string; icon: string; label: string }[];
  statuses: { id: string; icon: string; label: string }[];
  threshold: number;
  limits: { titleMin: number; titleMax: number; bodyMin: number; bodyMax: number; perDay: number; commentMax: number; noteMax: number };
}
export interface SuggestionItem {
  id: string; title: string; category: string; status: string; voteCount: number; commentCount: number; excerpt: string; statusNote: string | null;
  createdAt: string; author: { id: string; username: string; avatarUrl: string | null; role: string }; voted: boolean; threshold: number;
}

export const errorOf = (e: any) => e?.response?.data?.message ?? 'Une erreur est survenue';

export function useSuggestionMeta() {
  const [meta, setMeta] = useState<SuggestionMeta | null>(null);
  useEffect(() => { api.get('/suggestions/meta').then((r) => setMeta(r.data)).catch(() => undefined); }, []);
  return [meta, setMeta] as const;
}

export function StatusChip({ meta, id }: { meta: SuggestionMeta | null; id: string }) {
  const s = meta?.statuses.find((x) => x.id === id);
  return <span className={`sg-status st-${id.toLowerCase()}`}>{s?.icon} {s?.label ?? id}</span>;
}
export function CategoryChip({ meta, id }: { meta: SuggestionMeta | null; id: string }) {
  const c = meta?.categories.find((x) => x.id === id);
  return <span className="sg-cat">{c?.icon} {c?.label ?? id}</span>;
}

/** Barre de progression vers le seuil qui fait passer une suggestion « à l'étude ». */
export function Progress({ votes, threshold, status }: { votes: number; threshold: number; status: string }) {
  if (status !== 'OPEN') return null;
  const pct = Math.min(100, Math.round((votes / Math.max(1, threshold)) * 100));
  return (
    <div className="sg-progress" title={`${votes} vote${votes > 1 ? 's' : ''} sur ${threshold} pour passer à l'étude`}>
      <div className="sg-progress-bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="muted">{votes}/{threshold} votes pour passer à l'étude</span>
    </div>
  );
}

export function VoteButton({ item, onVoted }: { item: { id: string; voted: boolean; voteCount: number; status: string }; onVoted: (v: { voted: boolean; voteCount: number; status: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const closed = !['OPEN', 'REVIEW', 'PLANNED', 'PROGRESS'].includes(item.status);
  async function vote(e: React.MouseEvent) {
    e.preventDefault();
    if (busy || closed) return;
    setBusy(true);
    try { const { data } = await api.post(`/suggestions/${item.id}/vote`); onVoted(data); } catch (err) { window.alert(errorOf(err)); } finally { setBusy(false); }
  }
  return (
    <button type="button" className={`sg-vote${item.voted ? ' on' : ''}`} onClick={vote} disabled={busy || closed} title={closed ? 'Les votes sont clos' : item.voted ? 'Retirer mon vote' : 'Voter pour cette suggestion'} aria-pressed={item.voted}>
      <span className="sg-vote-arrow">▲</span>
      <strong>{item.voteCount}</strong>
    </button>
  );
}

type View = 'active' | 'done' | 'closed';

/** Suggestions des membres : proposer une idée, voter pour celles des autres. Plus il y a de votes, plus la suggestion monte et a de chances d'être réalisée. */
export default function Suggestions() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN' || role === 'OWNER';
  const [meta, setMeta] = useSuggestionMeta();
  const [view, setView] = useState<View>('active');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('votes');
  const [scope, setScope] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: SuggestionItem[]; total: number; pageSize: number; totals: { active: number; done: number; closed: number } } | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get('/suggestions', { params: { view, category: category || undefined, sort, scope: scope || undefined, q: q.trim() || undefined, page } })
      .then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorOf(e)));
  }, [view, category, sort, scope, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { setPage(1); }, [view, category, sort, scope, q]);

  function patchItem(id: string, v: { voted: boolean; voteCount: number; status: string }) {
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, voted: v.voted, voteCount: v.voteCount, status: v.status } : i)) } : d));
  }
  async function saveThreshold() {
    const v = window.prompt('Nombre de votes à atteindre pour qu\'une suggestion passe automatiquement « à l\'étude » (2 à 500) :', String(meta?.threshold ?? 10));
    if (!v) return;
    try { const { data: r } = await api.put('/suggestions/admin/config', { threshold: Number(v) }); setMeta((m) => (m ? { ...m, threshold: r.threshold } : m)); load(); } catch (e) { window.alert(errorOf(e)); }
  }

  const totals = data?.totals;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0 }}>💡 Suggestions</h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 640 }}>
            Une idée pour améliorer Seeduction ? Propose-la, et vote pour celles des autres : plus une suggestion a de votes, plus elle monte dans la liste et plus elle a de chances d'être réalisée.
            À <strong>{meta?.threshold ?? 10} votes</strong>, elle passe automatiquement « à l'étude » et l'équipe est prévenue.
            {isAdmin && <> <button type="button" className="secondary" style={{ padding: '1px 10px', fontSize: 12 }} onClick={saveThreshold}>Changer le seuil</button></>}
          </p>
        </div>
        <button type="button" onClick={() => setCreating((c) => !c)}>{creating ? 'Fermer' : '+ Proposer une suggestion'}</button>
      </div>

      {creating && meta && <NewSuggestion meta={meta} onCreated={(id) => navigate(`/suggestions/${id}`)} onCancel={() => setCreating(false)} />}

      <div className="mod-tabs" role="tablist">
        {([['active', 'Actives', totals?.active], ['done', 'Réalisées', totals?.done], ['closed', 'Refusées et doublons', totals?.closed]] as [View, string, number | undefined][]).map(([v, label, n]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{label} {n !== undefined && <span className="mod-count">{n}</span>}</button>
        ))}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder="Rechercher une suggestion…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Toutes les catégories</option>
          {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
          <option value="votes">Plus votées</option><option value="new">Plus récentes</option><option value="comments">Plus commentées</option>
        </select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Toutes</option><option value="mine">Mes suggestions</option><option value="voted">Celles où j'ai voté</option>
        </select>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!data ? <p className="muted">Chargement...</p> : data.items.length === 0 ? (
        <div className="panel mod-empty"><div style={{ fontSize: 34 }}>💡</div><strong>Aucune suggestion ici</strong><span className="muted">{view === 'active' && !q && !category && !scope ? 'Sois le premier à proposer une idée !' : 'Essaie d\'autres filtres.'}</span></div>
      ) : (
        <div className="sg-list">
          {data.items.map((s) => (
            <article key={s.id} className="sg-item">
              <VoteButton item={s} onVoted={(v) => patchItem(s.id, v)} />
              <div className="sg-main">
                <Link to={`/suggestions/${s.id}`} className="sg-title">{s.title}</Link>
                <div className="sg-chips"><StatusChip meta={meta} id={s.status} /><CategoryChip meta={meta} id={s.category} /></div>
                <p className="sg-excerpt">{s.excerpt}</p>
                {s.statusNote && s.status !== 'OPEN' && <p className="sg-note">💬 Équipe : {s.statusNote}</p>}
                <Progress votes={s.voteCount} threshold={s.threshold} status={s.status} />
                <div className="muted sg-meta">{s.author.username} · {timeAgo(s.createdAt)} · <Link to={`/suggestions/${s.id}`}>💬 {s.commentCount} commentaire{s.commentCount > 1 ? 's' : ''}</Link></div>
              </div>
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
          <span className="muted">Page {page} / {pages}</span>
          <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

function NewSuggestion({ meta, onCreated, onCancel }: { meta: SuggestionMeta; onCreated: (id: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [similar, setSimilar] = useState<{ id: string; title: string; status: string; voteCount: number }[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Avant de poster : les suggestions qui ressemblent, pour voter plutôt que créer un doublon.
  useEffect(() => {
    clearTimeout(timer.current);
    if (title.trim().length < 6) { setSimilar([]); return; }
    timer.current = setTimeout(() => { api.get('/suggestions/similar', { params: { q: `${title} ${body}`.slice(0, 200) } }).then((r) => setSimilar(r.data)).catch(() => undefined); }, 500);
    return () => clearTimeout(timer.current);
  }, [title, body]);

  async function submit() {
    setErr(''); setBusy(true);
    try { const { data } = await api.post('/suggestions', { title, body, category }); onCreated(data.id); }
    catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }

  return (
    <div className="panel grid" style={{ gap: 10 }}>
      <div className="panel-title"><span className="title-icon">💡</span>Proposer une suggestion</div>
      <label style={{ display: 'grid', gap: 4 }}>Titre (court et clair)
        <input value={title} maxLength={meta.limits.titleMax} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : un mode sombre pour le lecteur" />
      </label>
      {similar.length > 0 && (
        <div className="sg-similar">
          <strong>Des suggestions ressemblent à la tienne :</strong> vote pour l'une d'elles plutôt que d'en créer une nouvelle.
          {similar.map((s) => <Link key={s.id} to={`/suggestions/${s.id}`} target="_blank">▲ {s.voteCount} · {s.title}</Link>)}
        </div>
      )}
      <label style={{ display: 'grid', gap: 4 }}>Catégorie
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
      </label>
      <label style={{ display: 'grid', gap: 4 }}>Explique ton idée ({body.length}/{meta.limits.bodyMax})
        <textarea rows={6} value={body} maxLength={meta.limits.bodyMax} onChange={(e) => setBody(e.target.value)} placeholder="Qu'est-ce qui manque ou te gêne aujourd'hui ? Comment l'améliorer ? Pourquoi ce serait utile aux autres membres ?" />
      </label>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Limite : {meta.limits.perDay} suggestions par jour. Un bug ? Utilise plutôt le forum « Bugs et problèmes » ou le Support.</p>
      {err && <p style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" onClick={submit} disabled={busy}>Publier ma suggestion</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
