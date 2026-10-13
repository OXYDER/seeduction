import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

type AccessType = 'ALL' | 'CLASS' | 'UPLOADERS' | 'DONORS' | 'ADULT' | 'STAFF';
interface Rule { type: AccessType; minClass?: string }
interface TNode {
  id: string; name: string; description: string | null; icon: string | null; rules: string | null; isCategory: boolean; parentId: string | null; position: number;
  staffOnly: boolean; locked: boolean; archived: boolean; qa: boolean; access: { read?: Rule; write?: Rule } | null; readLabel: string | null; writeLabel: string | null;
  topics: number; posts: number; totalTopics: number; totalPosts: number; children: TNode[];
}
interface PlanItem { path: string; depth: number; kind: 'category' | 'forum' | 'subforum'; icon: string; name: string; status: 'create' | 'exists'; notes: string[] }
type Pos = 'before' | 'after' | 'inside';

const errorOf = (e: any) => e?.response?.data?.message ?? 'Action impossible';
const CLASSES = [['NOUVEAU', 'Nouveau'], ['MEMBRE', 'Membre'], ['POWER_USER', 'Power User'], ['ELITE', 'Élite'], ['VETERAN', 'Vétéran']] as const;
const ICONS = ['💬', '🙋', '☕', '🎬', '🎞️', '📺', '🎵', '📚', '🎮', '💻', '🛠️', '🆘', '🔌', '▶️', '⬆️', '🔍', '⭐', '🧭', '❤️', '🏆', '🔞', '🛡️', '⚙️', '📝', '📣', '🎉', '💡', '🌱'];

// ------------------------------------------------------------------ logique de l'arbre (les mêmes règles que le serveur ; lui seul fait foi)

const walk = (nodes: TNode[], fn: (n: TNode, parent: TNode | null) => void, parent: TNode | null = null) => nodes.forEach((n) => { fn(n, parent); walk(n.children, fn, n); });
const find = (nodes: TNode[], id: string): TNode | null => { let out: TNode | null = null; walk(nodes, (n) => { if (n.id === id) out = n; }); return out; };
const descendantIds = (n: TNode): string[] => n.children.flatMap((c) => [c.id, ...descendantIds(c)]);
const siblingsOf = (tree: TNode[], parentId: string | null) => (parentId ? find(tree, parentId)?.children ?? [] : tree);

/** Où tomberait l'élément glissé ? null = interdit. `index` est la position parmi les nouveaux voisins, l'élément glissé n'y étant pas compté. */
export function dropTarget(tree: TNode[], dragId: string, targetId: string, pos: Pos): { parentId: string | null; index: number } | null {
  const drag = find(tree, dragId), target = find(tree, targetId);
  if (!drag || !target || dragId === targetId) return null;
  if (descendantIds(drag).includes(targetId)) return null;
  const parentId = pos === 'inside' ? target.id : target.parentId;
  const parent = parentId ? find(tree, parentId) : null;
  if (drag.isCategory) { if (parentId) return null; }
  else if (parent && !parent.isCategory) {
    // sous-forum : le parent doit être un forum de 2e niveau, et le forum glissé ne doit pas avoir de sous-forums
    const grand = parent.parentId ? find(tree, parent.parentId) : null;
    if (grand && !grand.isCategory) return null;
    if (drag.children.length > 0) return null;
  }
  if (pos === 'inside' && !parent) return null;
  const sibs = siblingsOf(tree, parentId).filter((s) => s.id !== dragId);
  const at = sibs.findIndex((s) => s.id === targetId);
  const index = pos === 'inside' ? sibs.length : pos === 'before' ? Math.max(0, at) : at + 1;
  return { parentId, index };
}

const levelLabel = (n: TNode, parent: TNode | null) => (n.isCategory ? 'Catégorie' : parent && !parent.isCategory ? 'Sous-forum' : 'Forum');

const ruleSelectValue = (r?: Rule): string => (r?.type === 'CLASS' ? 'CLASS' : r?.type ?? 'ALL');

/** Administration du forum : arbre (glisser-déposer), réglages de chaque élément, accès par rang, déplacer / fusionner / supprimer, structure recommandée. */
export default function AdminForum() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN' || role === 'OWNER';
  const [tree, setTree] = useState<TNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ id: string } | null>(null);
  const [over, setOver] = useState<{ id: string; pos: Pos; ok: boolean } | null>(null);
  const [draft, setDraft] = useState<any>(null); // formulaire d'édition ou de création
  const [creating, setCreating] = useState<{ kind: 'category' | 'forum' | 'subforum'; parentId: string | null } | null>(null);
  const [wizard, setWizard] = useState<{ kind: 'merge' | 'move' | 'delete'; target: string } | null>(null);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);

  const load = useCallback(async () => {
    try { setTree((await api.get('/forum/admin/tree')).data); } catch (e) { setErr(errorOf(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sel = selected ? find(tree, selected) : null;
  const flat = useMemo(() => { const out: { n: TNode; parent: TNode | null; depth: number }[] = []; const rec = (nodes: TNode[], parent: TNode | null, d: number) => nodes.forEach((n) => { out.push({ n, parent, depth: d }); rec(n.children, n, d + 1); }); rec(tree, null, 0); return out; }, [tree]);
  const parentOf = (n: TNode) => (n.parentId ? find(tree, n.parentId) : null);

  // Ouvrir l'édition d'un élément : le formulaire reprend ses réglages.
  useEffect(() => {
    if (!sel || creating) return;
    const r = sel.access?.read, w = sel.access?.write;
    setDraft({
      name: sel.name, icon: sel.icon ?? '', description: sel.description ?? '', rules: sel.rules ?? '', locked: sel.locked, archived: sel.archived, qa: sel.qa,
      read: sel.staffOnly ? 'STAFF' : ruleSelectValue(r), readClass: r?.minClass ?? 'MEMBRE', write: ruleSelectValue(w), writeClass: w?.minClass ?? 'MEMBRE',
    });
  }, [sel?.id, sel?.name, sel?.staffOnly, sel?.locked, sel?.archived, sel?.qa, JSON.stringify(sel?.access), creating]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (m: string) => { setMsg(m); setErr(''); window.setTimeout(() => setMsg(''), 6000); };
  async function act(fn: () => Promise<any>, ok?: string) {
    setBusy(true); setErr('');
    try { const r = await fn(); await load(); if (ok) flash(ok); return r; } catch (e) { setErr(errorOf(e)); return null; } finally { setBusy(false); }
  }

  const ruleOf = (type: string, cls: string): Rule | null => (type === 'ALL' || type === 'STAFF' ? null : type === 'CLASS' ? { type: 'CLASS', minClass: cls } : { type: type as AccessType });
  const bodyOf = (d: any, isCategory: boolean) => {
    const read = ruleOf(d.read, d.readClass), write = isCategory ? null : ruleOf(d.write, d.writeClass);
    return {
      name: d.name, icon: d.icon || null, description: d.description || null, rules: isCategory ? null : d.rules || null,
      staffOnly: d.read === 'STAFF', locked: !isCategory && !!d.locked, qa: !isCategory && !!d.qa,
      access: read || write ? { ...(read ? { read } : {}), ...(write ? { write } : {}) } : null,
    };
  };

  async function save() {
    if (!sel || !draft) return;
    await act(() => api.patch(`/forum/categories/${sel.id}`, { ...bodyOf(draft, sel.isCategory), ...(draft.archived !== sel.archived ? { archived: draft.archived } : {}) }), '✓ Enregistré.');
  }
  async function create() {
    if (!creating || !draft?.name?.trim()) return;
    const isCategory = creating.kind === 'category';
    const r = await act(() => api.post('/forum/categories', { ...bodyOf(draft, isCategory), isCategory, parentId: creating.parentId || undefined }), `✓ ${isCategory ? 'Catégorie' : 'Forum'} créé.`);
    if (r) { setCreating(null); setSelected(r.data.id); }
  }
  function startCreate(kind: 'category' | 'forum' | 'subforum', parentId: string | null) {
    setCreating({ kind, parentId });
    setDraft({ name: '', icon: '', description: '', rules: '', locked: false, archived: false, qa: false, read: 'ALL', readClass: 'MEMBRE', write: 'ALL', writeClass: 'MEMBRE' });
    if (parentId) setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
  }

  async function dropOn(targetId: string, pos: Pos) {
    if (!drag) return;
    const plan1 = dropTarget(tree, drag.id, targetId, pos);
    setDrag(null); setOver(null);
    if (!plan1) return;
    await act(() => api.post(`/forum/categories/${drag.id}/place`, plan1), '✓ Déplacé.');
  }
  /** Boutons ▲▼ (alternative au glisser-déposer) : monte ou descend parmi les voisins. */
  async function nudge(n: TNode, dir: -1 | 1) {
    const sibs = siblingsOf(tree, n.parentId);
    const i = sibs.findIndex((s) => s.id === n.id);
    const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    await act(() => api.post(`/forum/categories/${n.id}/place`, { parentId: n.parentId, index: j }));
  }

  async function runWizard() {
    if (!sel || !wizard) return;
    const { kind, target } = wizard;
    if (kind === 'merge') { const r = await act(() => api.post(`/forum/categories/${sel.id}/merge`, { targetId: target }), undefined); if (r) { flash(`✓ « ${r.data.merged} » fusionné dans « ${r.data.into} » : ${r.data.topics} sujet(s) déplacé(s).`); setSelected(null); setWizard(null); } }
    if (kind === 'move') { const r = await act(() => api.post(`/forum/categories/${sel.id}/move-topics`, { targetId: target }), undefined); if (r) { flash(`✓ ${r.data.moved} sujet(s) déplacé(s).`); setWizard(null); } }
    if (kind === 'delete') { const r = await act(() => api.delete(`/forum/categories/${sel.id}`, { params: target ? { moveTo: target } : {} }), undefined); if (r) { flash(`✓ « ${r.data.name} » supprimé${r.data.movedTopics ? ` (${r.data.movedTopics} sujet(s) conservé(s))` : ''}${r.data.movedForums ? ` (${r.data.movedForums} forum(s) conservé(s))` : ''}.`); setSelected(null); setWizard(null); } }
  }

  async function openPlan() { setErr(''); try { setPlan((await api.get('/forum/admin/preview-suggested')).data); } catch (e) { setErr(errorOf(e)); } }
  async function applyPlan() {
    const r = await act(() => api.post('/forum/suggested'), undefined);
    if (r) { flash(`✓ ${r.data.created.length} élément(s) créé(s), ${r.data.skipped} déjà présent(s).`); setPlan(null); }
  }

  const matches = (n: TNode): boolean => !filter.trim() || n.name.toLowerCase().includes(filter.trim().toLowerCase()) || n.children.some(matches);

  function chips(n: TNode) {
    const out: [string, string, string][] = [];
    if (n.staffOnly) out.push(['🛡️ Équipe', '#fbbf24', "Visible seulement par l'équipe"]);
    else if (n.readLabel) out.push([`👁️ ${n.readLabel}`, '#7dd3fc', `Lecture réservée à ${n.readLabel}`]);
    if (n.writeLabel) out.push([`✍️ ${n.writeLabel}`, '#a78bfa', `Écriture réservée à ${n.writeLabel}`]);
    if (n.locked) out.push(['🔒 Lecture seule', '#fb923c', 'Seule l\'équipe peut y publier']);
    if (n.archived) out.push(['📦 Archive', '#94a3b8', 'Archivé : lisible, plus de publication']);
    if (n.qa) out.push(['✅ Entraide', '#34d399', 'Les sujets peuvent être marqués « Résolu »']);
    return out;
  }

  // Fonction de rendu (et non composant) : un composant défini ici serait recréé à chaque rendu et remplacerait les lignes en plein glissement.
  const renderRow = (n: TNode, parent: TNode | null, depth: number): JSX.Element => {
    const isSel = selected === n.id && !creating;
    const kids = n.children.filter(matches);
    const open = !collapsed.has(n.id);
    const o = over?.id === n.id ? over : null;
    return (
      <div key={n.id}>
        <div
          className={`fa-row${isSel ? ' sel' : ''}${o ? ` drop-${o.pos}${o.ok ? '' : ' bad'}` : ''}${drag?.id === n.id ? ' dragging' : ''}`}
          style={{ paddingLeft: 8 + depth * 22 }}
          draggable
          onDragStart={(e) => { setDrag({ id: n.id }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            const pos: Pos = y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
            const ok = !!dropTarget(tree, drag.id, n.id, pos);
            if (!over || over.id !== n.id || over.pos !== pos || over.ok !== ok) setOver({ id: n.id, pos, ok });
            e.dataTransfer.dropEffect = ok ? 'move' : 'none';
          }}
          onDrop={(e) => { e.preventDefault(); if (over && over.id === n.id) void dropOn(n.id, over.pos); }}
          onClick={() => { setSelected(n.id); setCreating(null); setWizard(null); }}
        >
          <span className="fa-handle" title="Glisse pour déplacer">⠿</span>
          <button type="button" className="fa-chev" onClick={(e) => { e.stopPropagation(); setCollapsed((c) => { const x = new Set(c); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; }); }} style={{ visibility: n.children.length ? 'visible' : 'hidden' }} aria-label={open ? 'Replier' : 'Déplier'}>{open ? '▾' : '▸'}</button>
          <span style={{ fontSize: 17 }}>{n.isCategory ? n.icon || '🗂️' : n.icon || '💬'}</span>
          <strong className={n.archived ? 'muted' : undefined} style={{ fontSize: n.isCategory ? 15 : 14 }}>{n.name}</strong>
          <span className="muted" style={{ fontSize: 11.5 }}>{levelLabel(n, parent)}{n.isCategory ? ` · ${n.children.length} forum(s)` : ` · ${n.totalTopics} sujet(s)`}{!n.isCategory && n.totalPosts ? ` · ${n.totalPosts} msg` : ''}</span>
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{chips(n).map(([t, c, title]) => <span key={t} title={title} style={{ fontSize: 11, padding: '0 6px', borderRadius: 999, color: c, border: `1px solid ${c}55`, background: `${c}18` }}>{t}</span>)}</span>
          <span className="fa-actions">
            <button type="button" className="secondary" title="Monter" onClick={(e) => { e.stopPropagation(); void nudge(n, -1); }}>▲</button>
            <button type="button" className="secondary" title="Descendre" onClick={(e) => { e.stopPropagation(); void nudge(n, 1); }}>▼</button>
            {(n.isCategory || !parent || parent.isCategory) && <button type="button" className="secondary" title={n.isCategory ? 'Ajouter un forum ici' : 'Ajouter un sous-forum'} onClick={(e) => { e.stopPropagation(); startCreate(n.isCategory ? 'forum' : 'subforum', n.id); }}>＋</button>}
          </span>
        </div>
        {open && kids.map((k) => renderRow(k, n, depth + 1))}
      </div>
    );
  };

  const destinations = useMemo(() => {
    if (!sel) return [] as { id: string; label: string }[];
    const banned = new Set([sel.id, ...descendantIds(sel)]);
    const out: { id: string; label: string }[] = [];
    const rec = (nodes: TNode[], path: string) => nodes.forEach((n) => { const p = path ? `${path} › ${n.name}` : n.name; if (!banned.has(n.id) && (sel.isCategory ? n.isCategory : !n.isCategory)) out.push({ id: n.id, label: p }); rec(n.children, p); });
    rec(tree, '');
    return out;
  }, [tree, sel]);

  const accessSelect = (value: string, cls: string, onType: (v: string) => void, onCls: (v: string) => void, allowStaff: boolean) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => onType(e.target.value)}>
        <option value="ALL">Tout le monde</option>
        <option value="CLASS">Rang minimum…</option>
        <option value="UPLOADERS">Uploaders et équipe</option>
        <option value="DONORS">Donateurs ❤️</option>
        <option value="ADULT">Membres 18+ (contenu adulte activé)</option>
        {allowStaff && <option value="STAFF">Équipe seulement</option>}
      </select>
      {value === 'CLASS' && <select value={cls} onChange={(e) => onCls(e.target.value)}>{CLASSES.map(([k, l]) => <option key={k} value={k}>{l} et plus</option>)}</select>}
    </div>
  );

  const editing = creating ? { isCategory: creating.kind === 'category', title: creating.kind === 'category' ? 'Nouvelle catégorie' : creating.kind === 'subforum' ? 'Nouveau sous-forum' : 'Nouveau forum' } : sel ? { isCategory: sel.isCategory, title: sel.name } : null;
  const parentForCreate = creating?.parentId ? find(tree, creating.parentId) : null;

  return (
    <div className="grid" style={{ gap: 12 }}>
      {msg && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{msg}</div>}
      {err && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{err}</div>}

      <div className="panel" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => startCreate('category', null)}>＋ Catégorie</button>
        <button type="button" className="secondary" onClick={() => startCreate('forum', sel?.isCategory ? sel.id : sel?.parentId && !parentOf(sel)?.parentId ? sel.parentId : null)}>＋ Forum</button>
        {isAdmin && <button type="button" className="secondary" onClick={openPlan} title="Voir ce qui serait créé avant de confirmer">✨ Structure recommandée…</button>}
        <input placeholder="Filtrer l'arbre…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 200, marginLeft: 'auto' }} />
        <span className="muted" style={{ fontSize: 12 }}>{flat.filter((x) => x.n.isCategory).length} catégorie(s) · {flat.filter((x) => !x.n.isCategory).length} forum(s) · {flat.reduce((n, x) => n + x.n.topics, 0)} sujet(s)</span>
      </div>

      <div className="fa-layout">
        <div className="panel" style={{ padding: 8 }}>
          <div className="muted" style={{ fontSize: 12, padding: '2px 8px 8px' }}>Glisse un élément : <strong>au-dessus ou en dessous</strong> d'un autre pour le placer à côté, <strong>au milieu</strong> pour le ranger dedans. Une catégorie contient des forums ; un forum peut avoir des sous-forums (3 niveaux au maximum).</div>
          {tree.filter(matches).map((n) => renderRow(n, null, 0))}
          {tree.length === 0 && <p className="muted" style={{ padding: 16 }}>Aucun forum pour l'instant. {isAdmin ? 'Essaie « ✨ Structure recommandée… » pour partir d\'une base soignée.' : ''}</p>}
        </div>

        <div className="panel" style={{ display: 'grid', gap: 10, position: 'sticky', top: 10 }}>
          {!editing && <p className="muted" style={{ margin: 0 }}>Choisis un élément dans l'arbre pour modifier ses réglages, ou crée-en un nouveau.</p>}
          {editing && draft && (
            <>
              <strong style={{ fontSize: 16 }}>{creating ? '＋ ' : ''}{editing.title}</strong>
              {creating && <div className="muted" style={{ fontSize: 12.5 }}>{creating.parentId ? `Dans : ${parentForCreate?.name ?? ''}` : creating.kind === 'category' ? 'Au premier niveau.' : 'Au premier niveau (sans catégorie). Choisis ensuite sa catégorie en le glissant dans l\'arbre.'}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="🙂" maxLength={4} style={{ width: 64, textAlign: 'center', fontSize: 18 }} aria-label="Icône" />
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nom" style={{ flex: 1 }} autoFocus={!!creating} />
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{ICONS.map((i) => <button key={i} type="button" className="secondary" onClick={() => setDraft({ ...draft, icon: i })} style={{ padding: '1px 5px', fontSize: 15 }}>{i}</button>)}</div>
              <textarea rows={2} placeholder="Description (affichée sous le nom)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              {!editing.isCategory && <textarea rows={3} placeholder="Règles du forum (affichées en haut de sa page) — facultatif" value={draft.rules} onChange={(e) => setDraft({ ...draft, rules: e.target.value })} />}

              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>👁️ Qui peut lire{accessSelect(draft.read, draft.readClass, (v) => setDraft({ ...draft, read: v }), (v) => setDraft({ ...draft, readClass: v }), true)}</label>
                {!editing.isCategory && <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>✍️ Qui peut écrire{accessSelect(draft.write, draft.writeClass, (v) => setDraft({ ...draft, write: v }), (v) => setDraft({ ...draft, writeClass: v }), false)}</label>}
                <div className="muted" style={{ fontSize: 11.5 }}>L'équipe passe toujours. Ce qui est dans un élément réservé l'est aussi (un forum dans une catégorie « 18+ » n'est vu que par ceux qui ont le 18+).</div>
              </div>
              {!editing.isCategory && (
                <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={draft.locked} onChange={(e) => setDraft({ ...draft, locked: e.target.checked })} /> 🔒 Lecture seule (seule l'équipe publie : annonces, règles…)</label>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={draft.qa} onChange={(e) => setDraft({ ...draft, qa: e.target.checked })} /> ✅ Forum d'entraide (on peut marquer la réponse « Résolu »)</label>
                </div>
              )}
              {!creating && sel && (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={draft.archived} onChange={(e) => setDraft({ ...draft, archived: e.target.checked })} /> 📦 Archivé (lisible, plus rien n'y est publié{sel.children.length ? ' — sous-éléments compris' : ''})</label>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {creating ? <><button type="button" onClick={create} disabled={busy || !draft.name.trim()}>Créer</button><button type="button" className="secondary" onClick={() => setCreating(null)}>Annuler</button></>
                  : <button type="button" onClick={save} disabled={busy || !draft.name.trim()}>Enregistrer</button>}
              </div>

              {!creating && sel && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, display: 'grid', gap: 8 }}>
                  <div className="muted" style={{ fontSize: 12.5 }}>{sel.isCategory ? `${sel.children.length} forum(s) · ${sel.totalTopics} sujet(s) · ${sel.totalPosts} message(s)` : `${sel.topics} sujet(s) · ${sel.posts} message(s)${sel.children.length ? ` · ${sel.children.length} sous-forum(s)` : ''}`}</div>
                  {isAdmin ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!sel.isCategory && <button type="button" className="secondary" onClick={() => setWizard({ kind: 'move', target: '' })} disabled={sel.topics === 0}>📤 Déplacer les sujets…</button>}
                      {!sel.isCategory && <button type="button" className="secondary" onClick={() => setWizard({ kind: 'merge', target: '' })}>🧬 Fusionner dans…</button>}
                      <button type="button" className="danger" onClick={() => setWizard({ kind: 'delete', target: '' })}>🗑️ Supprimer…</button>
                    </div>
                  ) : <div className="muted" style={{ fontSize: 12 }}>Déplacer, fusionner et supprimer sont réservés aux administrateurs.</div>}
                  {wizard && (
                    <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
                      <strong style={{ fontSize: 13.5 }}>
                        {wizard.kind === 'merge' ? `Fusionner « ${sel.name} » dans…` : wizard.kind === 'move' ? `Déplacer les ${sel.topics} sujet(s) de « ${sel.name} » vers…` : sel.isCategory ? `Supprimer « ${sel.name} » : où envoyer ses forums ?` : `Supprimer « ${sel.name} »${sel.topics ? ' : où envoyer ses sujets ?' : ''}`}
                      </strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {wizard.kind === 'merge' ? 'Tous ses sujets (et ses sous-forums) passent dans la destination, puis ce forum disparaît. Rien n\'est perdu.' : wizard.kind === 'move' ? 'Le forum reste en place, vide.' : 'Rien n\'est perdu en silence : tout ce qu\'il contient est envoyé à l\'endroit choisi.'}
                      </div>
                      {(wizard.kind !== 'delete' || (sel.isCategory ? sel.children.length > 0 : sel.topics > 0)) && (
                        <select value={wizard.target} onChange={(e) => setWizard({ ...wizard, target: e.target.value })}>
                          <option value="">— Choisir la destination —</option>
                          {wizard.kind === 'delete' && sel.isCategory && <option value="root">Premier niveau (sans catégorie)</option>}
                          {destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                        </select>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className={wizard.kind === 'delete' ? 'danger' : undefined} onClick={runWizard} disabled={busy || ((wizard.kind !== 'delete' || (sel.isCategory ? sel.children.length > 0 : sel.topics > 0)) && !wizard.target)}>
                          {wizard.kind === 'merge' ? 'Fusionner' : wizard.kind === 'move' ? 'Déplacer' : 'Supprimer'}
                        </button>
                        <button type="button" className="secondary" onClick={() => setWizard(null)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {plan && (
        <div role="dialog" aria-label="Structure recommandée" onClick={() => setPlan(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '4vh 12px' }}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)', display: 'grid', gap: 12, background: '#0d1224' }}>
            <h3 style={{ margin: 0 }}>✨ Structure recommandée</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Elle ne double pas ce que le site fait déjà : les annonces vivent dans <strong>Nouvelles</strong>, les idées dans <strong>Suggestions</strong>, les bugs et problèmes de compte dans <strong>Support</strong>, les demandes de torrents dans <strong>Demandes</strong>, la discussion instantanée dans <strong>Chat</strong>, les guides dans le <strong>Wiki</strong>. Le forum sert à discuter, s'entraider et partager.
              Rien de ce qui existe n'est modifié ni supprimé ; ce qui porte déjà le même nom au même endroit est laissé tel quel.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              <span>＋ <strong>{plan.filter((p) => p.status === 'create').length}</strong> à créer</span>
              <span className="muted">✓ {plan.filter((p) => p.status === 'exists').length} déjà présents</span>
            </div>
            <div style={{ maxHeight: '46vh', overflowY: 'auto', display: 'grid', gap: 2, fontSize: 13.5 }}>
              {plan.map((p) => (
                <div key={p.path} style={{ paddingLeft: p.depth * 20, opacity: p.status === 'exists' ? 0.5 : 1, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: p.status === 'create' ? 'var(--success)' : undefined }}>{p.status === 'create' ? '＋' : '✓'}</span>
                  <span>{p.icon}</span><strong style={{ fontWeight: p.kind === 'category' ? 800 : 500 }}>{p.name}</strong>
                  <span className="muted" style={{ fontSize: 11.5 }}>{p.kind === 'category' ? 'catégorie' : p.kind === 'subforum' ? 'sous-forum' : 'forum'}{p.notes.length ? ` · ${p.notes.join(' · ')}` : ''}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={applyPlan} disabled={busy || plan.every((p) => p.status === 'exists')}>Créer les {plan.filter((p) => p.status === 'create').length} éléments</button>
              <button type="button" className="secondary" onClick={() => setPlan(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
