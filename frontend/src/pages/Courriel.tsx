import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { htmlToBbcode } from '../lib/htmlToBbcode';
import { useCrumbTitle } from '../store/crumbs';
import Loading from '../components/Loading';
import MailCompose, { postMail, type MailBoxInfo, type MailDraft, type SendJob } from '../components/MailCompose';
import '../mail.css';

type Mailbox = MailBoxInfo;
interface Folder { path: string; name: string; special: string | null; unread: number }
interface Item { uid: number; subject: string; from: { name: string; address: string }; to: { name: string; address: string }[]; date: string | null; seen: boolean; flagged: boolean; answered: boolean; size: number; attachments: boolean }
interface Msg {
  uid: number; folder: string; subject: string; date: string | null; from: { name: string; address: string } | null; to: { name: string; address: string }[]; cc: { name: string; address: string }[]; via: string | null;
  html: string; remoteImages: number; text: string; attachments: { index: number; filename: string; contentType: string; size: number }[]; flagged: boolean;
}

const UNDO_SECONDS = 10;
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const FOLDER_ICON: Record<string, string> = { '\\Inbox': '📥', '\\Drafts': '📝', '\\Sent': '📤', '\\Archive': '🗄️', '\\Junk': '🚫', '\\Trash': '🗑️' };
const FOLDER_NAME: Record<string, string> = { '\\Inbox': 'Réception', '\\Drafts': 'Brouillons', '\\Sent': 'Envoyés', '\\Archive': 'Archives', '\\Junk': 'Indésirables', '\\Trash': 'Corbeille' };
const who = (a: { name: string; address: string } | null | undefined) => (a?.name || a?.address || '(inconnu)');
const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} ko`);
const shortDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); };
/** Les crochets d'un courriel cité ne doivent pas être pris pour du BBCode par l'éditeur. */
const plain = (s: string) => s.replace(/\[/g, '[​');
const quoteBlock = (head: string, text: string) => `[quote]${plain(head)}\n${plain(text).trim()}[/quote]`;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Cadre isolé pour afficher un courriel : aucun script ne peut s'y exécuter, et les images distantes ne se chargent que si on les a autorisées. */
function MailFrame({ html, images, frameRef }: { html: string; images: boolean; frameRef: React.RefObject<HTMLIFrameElement> }) {
  const doc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:${images ? ' https:' : ''}; style-src 'unsafe-inline'"><base target="_blank"><style>
    body{font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1f24;background:#fff;margin:0;padding:14px 16px;word-wrap:break-word;overflow-wrap:anywhere}
    img{max-width:100%;height:auto} table{max-width:100%} a{color:#2563eb} blockquote{border-left:3px solid #cbd5e1;margin:8px 0 8px 2px;padding-left:12px;color:#475569} pre{white-space:pre-wrap}
    .blocked-image{display:inline-block;padding:2px 8px;border:1px dashed #94a3b8;border-radius:4px;color:#64748b;font-size:12px}.blocked-image::before{content:"🖼 image bloquée"}
  </style></head><body>${html}</body></html>`, [html, images]);
  const fit = () => { const d = frameRef.current?.contentDocument; if (d?.body && frameRef.current) frameRef.current.style.height = `${Math.min(6000, d.documentElement.scrollHeight + 4)}px`; };
  return <iframe ref={frameRef} title="Courriel" className="mail-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals" srcDoc={doc} onLoad={fit} />;
}

const SHORTCUTS: [string, string][] = [
  ['j / k', 'courriel suivant / précédent'], ['Entrée', 'ouvrir'], ['x', 'cocher'], ['c', 'nouveau message'], ['r', 'répondre'], ['a', 'répondre à tous'], ['f', 'transférer'],
  ['e', 'archiver'], ['#', 'supprimer'], ['!', 'indésirable'], ['u', 'marquer non lu'], ['s', 'suivi ⭐'], ['/', 'rechercher'], ['Échap', 'fermer'],
];

/** Courriel (équipe) : lire, chercher, ranger et écrire depuis les boîtes configurées, en choisissant l'alias qui envoie. */
export default function Courriel() {
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null);
  const [boxId, setBoxId] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState('INBOX');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [alias, setAlias] = useState('');
  const [unseen, setUnseen] = useState(false);
  const [list, setList] = useState<{ items: Item[]; total: number; pageSize: number } | null>(null);
  const [uid, setUid] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [images, setImages] = useState(false);
  const [compose, setCompose] = useState<{ draft: MailDraft; files?: File[]; key: number } | null>(null);
  const [pending, setPending] = useState<{ job: SendJob; left: number } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const box = boxes?.find((b) => b.id === boxId) ?? null;
  const base = `/webmail/mailboxes/${boxId}`;
  const special = folders.find((f) => f.path === folder)?.special ?? (folder === 'INBOX' ? '\\Inbox' : null);
  // Fil d'Ariane : Accueil › Courriel › [boîte, s'il y en a plusieurs] › dossier (› courriel ouvert)
  const folderLabel = FOLDER_NAME[special ?? ''] ?? folders.find((f) => f.path === folder)?.name ?? 'Réception';
  useCrumbTitle(msg ? (msg.subject || '(sans sujet)') : folderLabel, [
    { label: 'Courriel', to: '/courriel' },
    ...(boxes && boxes.length > 1 && box ? [{ label: box.label }] : []),
    ...(msg ? [{ label: folderLabel }] : []),
  ]);
  const pathOf = (sp: string, fallback: string) => folders.find((f) => f.special === sp)?.path ?? fallback;

  useEffect(() => { api.get('/webmail/mailboxes').then((r) => { setBoxes(r.data); if (r.data[0]) setBoxId(r.data[0].id); }).catch((e) => setError(errorOf(e))); }, []);
  const loadFolders = useCallback(() => { if (boxId) api.get(`${base}/folders`).then((r) => setFolders(r.data)).catch((e) => setError(errorOf(e))); }, [boxId, base]);
  useEffect(() => { setFolders([]); setFolder('INBOX'); setPage(1); setUid(null); setMsg(null); setSel([]); setCursor(null); setQuery(''); setTyped(''); setAlias(''); loadFolders(); }, [boxId, loadFolders]);

  const loadList = useCallback(() => {
    if (!boxId) return;
    setError('');
    api.get(`${base}/messages`, { params: { folder, page, q: query || undefined, alias: alias || undefined, unseen: unseen ? '1' : undefined } }).then((r) => setList(r.data)).catch((e) => { setList({ items: [], total: 0, pageSize: 30 }); setError(errorOf(e)); });
  }, [boxId, base, folder, page, query, alias, unseen]);
  useEffect(() => { setList(null); setSel([]); loadList(); }, [loadList]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden && !compose) { loadList(); loadFolders(); } }, 90_000); return () => clearInterval(t); }, [loadList, loadFolders, compose]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 5000); return () => clearTimeout(t); }, [note]);

  // ---------------------------------------------------------------- envoi avec délai d'annulation
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const transmit = useCallback(async (job: SendJob) => {
    try {
      await postMail(base, 'send', job.draft, job.files);
      setNote('Courriel envoyé.'); loadFolders(); loadList();
    } catch (e) {
      setError(`Envoi impossible : ${errorOf(e)}`);
      setCompose({ draft: job.draft, files: job.files, key: Date.now() }); // on rouvre le message pour ne rien perdre
    }
  }, [base, loadFolders, loadList]);
  const transmitRef = useRef(transmit); transmitRef.current = transmit;
  useEffect(() => {
    if (!pending) return;
    if (pending.left <= 0) { const job = pending.job; setPending(null); void transmit(job); return; }
    const t = setTimeout(() => setPending((p) => p && { ...p, left: p.left - 1 }), 1000);
    return () => clearTimeout(t);
  }, [pending, transmit]);
  // En quittant la page avec un envoi en attente, il part tout de suite (on ne perd jamais un message).
  useEffect(() => () => { if (pendingRef.current) void transmitRef.current(pendingRef.current.job); }, []);
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [!!pending]);

  // ---------------------------------------------------------------- lecture et actions
  async function open(item: Item) {
    setCursor(item.uid);
    if (special === '\\Drafts') { await editDraft(item.uid); return; }
    setUid(item.uid); setMsg(null); setImages(false); setError('');
    try { const r = await api.get(`${base}/message`, { params: { folder, uid: item.uid } }); setMsg(r.data); setList((l) => l && { ...l, items: l.items.map((x) => (x.uid === item.uid ? { ...x, seen: true } : x)) }); if (!item.seen) loadFolders(); } catch (e) { setError(errorOf(e)); }
  }
  async function editDraft(draftUid: number) {
    try {
      const { data } = await api.get(`${base}/draft`, { params: { folder, uid: draftUid } });
      setCompose({ key: Date.now(), draft: { from: data.from || box?.address || '', to: data.to, cc: data.cc, bcc: data.bcc, subject: data.subject, body: data.html ? htmlToBbcode(data.html) : plain(data.text ?? ''), inReplyTo: data.inReplyTo, references: data.references, draftFolder: folder, draftUid, kept: data.attachments } });
    } catch (e) { setError(errorOf(e)); }
  }
  async function showImages() {
    if (!msg) return;
    try { const r = await api.get(`${base}/message`, { params: { folder, uid: msg.uid, images: '1' } }); setMsg(r.data); setImages(true); } catch (e) { setError(errorOf(e)); }
  }
  function closeReader() { setUid(null); setMsg(null); }

  type Kind = 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'spam' | 'delete' | 'move';
  async function actOn(uids: number[], kind: Kind, target?: string) {
    if (uids.length === 0) return;
    if (kind === 'delete' && special === '\\Trash' && !window.confirm(`Supprimer définitivement ${uids.length > 1 ? `ces ${uids.length} courriels` : 'ce courriel'} ?`)) return;
    setBusy(true); setNote(''); setError('');
    try {
      if (kind === 'read' || kind === 'unread') await api.post(`${base}/flags`, { folder, uids, seen: kind === 'read' });
      else if (kind === 'flag' || kind === 'unflag') await api.post(`${base}/flags`, { folder, uids, flagged: kind === 'flag' });
      else if (kind === 'delete') await api.post(`${base}/delete`, { folder, uids });
      else await api.post(`${base}/move`, { folder, uids, target: kind === 'spam' ? pathOf('\\Junk', 'Junk') : kind === 'archive' ? pathOf('\\Archive', 'Archive') : target });
      if (kind === 'flag' || kind === 'unflag') setMsg((m) => (m && uids.includes(m.uid) ? { ...m, flagged: kind === 'flag' } : m));
      else if (msg && uids.includes(msg.uid) && kind !== 'read') closeReader();
      setSel([]);
      if (kind === 'archive' || kind === 'spam' || kind === 'delete' || kind === 'move') setNote(`${uids.length > 1 ? `${uids.length} courriels déplacés` : 'Courriel déplacé'}${kind === 'delete' && special !== '\\Trash' ? ' dans la corbeille' : ''}.`);
      loadList(); loadFolders();
    } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }

  function newMessage(extra: Partial<MailDraft> = {}) {
    if (!box) return;
    setCompose({ key: Date.now(), draft: { from: box.aliases[0]?.address ?? box.address, to: '', cc: '', bcc: '', subject: '', body: box.signature ? `\n\n${plain(box.signature)}` : '', ...extra } });
  }
  async function reply(mode: 'reply' | 'all' | 'forward') {
    if (!msg || !box) return;
    try {
      const { data } = await api.get(`${base}/reply`, { params: { folder, uid: msg.uid, mode } });
      setCompose({ key: Date.now(), draft: {
        from: data.from || box.aliases[0]?.address || box.address || '', to: data.to, cc: data.cc, bcc: '', subject: data.subject,
        body: `\n\n${box.signature ? `${plain(box.signature)}\n\n` : ''}${quoteBlock(data.head, data.quote)}`,
        inReplyTo: data.inReplyTo, references: data.references, replyFolder: mode === 'forward' ? undefined : folder, replyUid: mode === 'forward' ? undefined : msg.uid,
      } });
    } catch (e) { setError(errorOf(e)); }
  }
  async function download(index: number, filename: string) {
    try { saveBlob((await api.get(`${base}/attachment`, { params: { folder, uid: msg!.uid, index }, responseType: 'blob' })).data, filename); } catch (e) { setError(errorOf(e)); }
  }
  async function downloadEml() {
    if (!msg) return;
    try { saveBlob((await api.get(`${base}/eml`, { params: { folder, uid: msg.uid }, responseType: 'blob' })).data, `courriel-${msg.uid}.eml`); } catch (e) { setError(errorOf(e)); }
  }

  // ---------------------------------------------------------------- navigation clavier
  const items = list?.items ?? [];
  function move(delta: number) {
    if (items.length === 0) return;
    const at = items.findIndex((i) => i.uid === (cursor ?? uid));
    const next = items[Math.min(items.length - 1, Math.max(0, at < 0 ? (delta > 0 ? 0 : items.length - 1) : at + delta))];
    setCursor(next.uid);
    listRef.current?.querySelector(`[data-uid="${next.uid}"]`)?.scrollIntoView({ block: 'nearest' });
    if (uid !== null) void open(next); // en lecture, j / k enchaînent les courriels
  }
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (compose || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const target = msg ? [msg.uid] : sel.length ? sel : cursor ? [cursor] : [];
    const k = e.key;
    const go = (fn: () => void) => { e.preventDefault(); fn(); };
    if (k === 'j' || k === 'ArrowDown') go(() => move(1));
    else if (k === 'k' || k === 'ArrowUp') go(() => move(-1));
    else if (k === 'Enter' || k === 'o') { const it = items.find((i) => i.uid === cursor); if (it && uid !== it.uid) go(() => void open(it)); }
    else if (k === 'x' && cursor) go(() => setSel((s) => (s.includes(cursor) ? s.filter((u) => u !== cursor) : [...s, cursor])));
    else if (k === 'c') go(() => newMessage());
    else if (k === 'r' && msg) go(() => void reply('reply'));
    else if (k === 'a' && msg) go(() => void reply('all'));
    else if (k === 'f' && msg) go(() => void reply('forward'));
    else if (k === 'e') go(() => void actOn(target, 'archive'));
    else if (k === '#' || k === 'Delete') go(() => void actOn(target, 'delete'));
    else if (k === '!') go(() => void actOn(target, 'spam'));
    else if (k === 'u') go(() => void actOn(target, 'unread'));
    else if (k === 's') go(() => void actOn(target, msg ? (msg.flagged ? 'unflag' : 'flag') : (items.find((i) => i.uid === target[0])?.flagged ? 'unflag' : 'flag')));
    else if (k === '/') go(() => searchRef.current?.focus());
    else if (k === '?') go(() => setHelp((h) => !h));
    else if (k === 'Escape') { if (help) setHelp(false); else if (sel.length) setSel([]); else if (uid !== null) closeReader(); }
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keyRef.current(e); document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);

  if (!boxes) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  if (boxes.length === 0) return (
    <div className="panel"><h1 style={{ marginTop: 0 }}>✉️ Courriel</h1>
      <p className="muted">Aucune boîte courriel ne t'est accessible. La personne qui a ajouté la boîte dans <strong>Admin &gt; Courriel</strong> peut te donner l'accès.</p></div>
  );

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const allChecked = items.length > 0 && sel.length === items.length;
  const isSent = special === '\\Sent' || special === '\\Drafts';
  const moveTargets = folders.filter((f) => f.path !== folder);
  return (
    <div className="mail-wrap"><div className={`mail-app${uid !== null ? ' reading' : ''}`}>
      <aside className="mail-side">
        <button type="button" className="mail-new" onClick={() => newMessage()}>✏️ Nouveau message</button>
        {boxes.length > 1 && <select value={boxId} onChange={(e) => setBoxId(e.target.value)} aria-label="Boîte">{boxes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>}
        <nav className="mail-folders">
          {folders.map((f) => (
            <button key={f.path} type="button" className={folder === f.path ? 'on' : ''} onClick={() => { if (f.path !== folder) setList(null); setFolder(f.path); setPage(1); closeReader(); setCursor(null); }}>
              <span>{FOLDER_ICON[f.special ?? ''] ?? '📁'} {FOLDER_NAME[f.special ?? ''] ?? f.name}</span>{f.unread > 0 && f.special !== '\\Drafts' && <b className="mail-count">{f.unread}</b>}
            </button>
          ))}
        </nav>
        {box && box.aliases.length > 0 && (
          <div className="mail-aliases">
            <small className="muted">Filtrer par alias</small>
            <button type="button" className={alias === '' ? 'on' : ''} onClick={() => { setAlias(''); setPage(1); }}>Tous</button>
            {box.aliases.map((a) => <button key={a.address} type="button" className={alias === a.address ? 'on' : ''} onClick={() => { setAlias(a.address); setPage(1); }} title={a.address}>{a.address.split('@')[0]}@</button>)}
          </div>
        )}
        <button type="button" className="mail-help-btn secondary" onClick={() => setHelp((h) => !h)} aria-expanded={help}>⌨️ Raccourcis</button>
        {help && <dl className="mail-help">{SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>}
      </aside>

      <section className="mail-list">
        <form className="mail-search" onSubmit={(e) => { e.preventDefault(); setQuery(typed.trim()); setPage(1); }}>
          <input type="checkbox" checked={allChecked} onChange={(e) => setSel(e.target.checked ? items.map((i) => i.uid) : [])} aria-label="Tout sélectionner" title="Tout sélectionner" style={{ flex: 'none' }} />
          <input ref={searchRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Rechercher (sujet, expéditeur, texte)…  /" />
          <button type="submit" className="secondary">🔎</button>
          <label title="Seulement les non lus"><input type="checkbox" checked={unseen} onChange={(e) => { setUnseen(e.target.checked); setPage(1); }} /> non lus</label>
        </form>
        {sel.length > 0 && (
          <div className="mail-bulk" role="toolbar" aria-label="Actions groupées">
            <strong>{sel.length}</strong>
            <button type="button" className="secondary" disabled={busy} onClick={() => actOn(sel, 'read')} title="Marquer comme lu">Lu</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => actOn(sel, 'unread')} title="Marquer comme non lu">Non lu</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => actOn(sel, 'flag')} title="Suivi">⭐</button>
            {special !== '\\Archive' && <button type="button" className="secondary" disabled={busy} onClick={() => actOn(sel, 'archive')}>🗄️</button>}
            {special !== '\\Junk' && <button type="button" className="secondary" disabled={busy} onClick={() => actOn(sel, 'spam')} title="Indésirable">🚫</button>}
            <button type="button" className="secondary" disabled={busy} onClick={() => actOn(sel, 'delete')} title="Supprimer">🗑️</button>
            {moveTargets.length > 0 && <select value="" onChange={(e) => e.target.value && actOn(sel, 'move', e.target.value)} aria-label="Déplacer vers"><option value="">Déplacer…</option>{moveTargets.map((f) => <option key={f.path} value={f.path}>{FOLDER_NAME[f.special ?? ''] ?? f.name}</option>)}</select>}
            <button type="button" className="secondary" onClick={() => setSel([])} aria-label="Désélectionner">✕</button>
          </div>
        )}
        {error && <p style={{ color: 'var(--danger)', margin: '6px 8px' }}>{error}</p>}
        {!list ? <Loading /> : list.items.length === 0 ? <p className="muted" style={{ padding: 12 }}>{query || alias || unseen ? 'Aucun résultat.' : 'Ce dossier est vide.'}</p> : (
          <ul ref={listRef}>
            {list.items.map((it) => (
              <li key={it.uid} data-uid={it.uid} className={`${it.seen ? '' : 'unread'}${uid === it.uid ? ' sel' : ''}${cursor === it.uid ? ' cur' : ''}${sel.includes(it.uid) ? ' chk' : ''}`} onClick={() => open(it)}>
                <input type="checkbox" className="mail-chk" checked={sel.includes(it.uid)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSel(e.target.checked ? [...sel, it.uid] : sel.filter((u) => u !== it.uid))} aria-label="Sélectionner" />
                <div className="mail-main">
                  <div className="mail-row1"><span className="mail-from">{special === '\\Drafts' ? <em>Brouillon</em> : isSent ? `À ${who(it.to[0])}` : who(it.from)}</span><span className="mail-date">{shortDate(it.date)}</span></div>
                  <div className="mail-row2"><span className="mail-subject">{it.flagged ? '⭐ ' : ''}{it.answered ? '↩ ' : ''}{it.subject || '(sans sujet)'}</span>{it.attachments && <span title="Pièce jointe">📎</span>}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list && pages > 1 && (
          <div className="mail-pager"><button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{page} / {pages} · {list.total}</span><button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div>
        )}
      </section>

      <section className="mail-read">
        {uid === null ? <div className="mail-empty muted">Choisis un courriel dans la liste.<br /><small>Astuce : <kbd>j</kbd> / <kbd>k</kbd> pour naviguer, <kbd>?</kbd> pour tous les raccourcis.</small></div> : !msg ? <Loading /> : (
          <>
            <div className="mail-bar">
              <button type="button" className="mail-back secondary" onClick={closeReader}>← Liste</button>
              <button type="button" onClick={() => reply('reply')} title="r">↩ Répondre</button>
              <button type="button" className="secondary" onClick={() => reply('all')} title="a">↩↩ À tous</button>
              <button type="button" className="secondary" onClick={() => reply('forward')} title="f">➡ Transférer</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => actOn([msg.uid], msg.flagged ? 'unflag' : 'flag')} title="Suivi (s)">{msg.flagged ? '⭐' : '☆'}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => actOn([msg.uid], 'unread')} title="u">Non lu</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => actOn([msg.uid], 'archive')} title="e">🗄️ Archiver</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => actOn([msg.uid], 'spam')} title="!">🚫</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => actOn([msg.uid], 'delete')} title="#">🗑️ Supprimer</button>
              {moveTargets.length > 0 && <select value="" onChange={(e) => e.target.value && actOn([msg.uid], 'move', e.target.value)} aria-label="Déplacer vers"><option value="">Déplacer vers…</option>{moveTargets.map((f) => <option key={f.path} value={f.path}>{FOLDER_NAME[f.special ?? ''] ?? f.name}</option>)}</select>}
              <button type="button" className="secondary" onClick={() => frameRef.current?.contentWindow?.print()} title="Imprimer">🖨️</button>
              <button type="button" className="secondary" onClick={downloadEml} title="Télécharger le courriel complet (.eml)">⬇ .eml</button>
            </div>
            <header className="mail-head">
              <h2>{msg.subject}</h2>
              <div><strong>{who(msg.from)}</strong> <span className="muted">&lt;{msg.from?.address}&gt;</span> {msg.via && <span className="badge" title="Adresse (alias) qui a reçu ce courriel">via {msg.via}</span>}</div>
              <div className="muted" style={{ fontSize: 13 }}>À : {msg.to.map((t) => t.address).join(', ')}{msg.cc.length > 0 && ` · Cc : ${msg.cc.map((t) => t.address).join(', ')}`} · {msg.date ? `${new Date(msg.date).toLocaleString('fr-CA')} (${timeAgo(msg.date)})` : ''}</div>
            </header>
            {msg.remoteImages > 0 && !images && <div className="mail-warn">🖼️ {msg.remoteImages} image{msg.remoteImages > 1 ? 's' : ''} bloquée{msg.remoteImages > 1 ? 's' : ''} (elles peuvent révéler que tu as ouvert le message). <button type="button" className="secondary" onClick={showImages}>Afficher les images</button></div>}
            <MailFrame html={msg.html} images={images} frameRef={frameRef} />
            {msg.attachments.length > 0 && (
              <div className="mail-atts">{msg.attachments.map((a) => <button key={a.index} type="button" className="secondary" onClick={() => download(a.index, a.filename)}>📎 {a.filename} <small>({bytes(a.size)})</small></button>)}</div>
            )}
          </>
        )}
      </section>

      {(pending || note) && (
        <div className="mail-toast" role="status">
          {pending ? <>✉️ Envoi dans {pending.left} s… <button type="button" onClick={() => { const job = pending.job; setPending(null); setCompose({ draft: job.draft, files: job.files, key: Date.now() }); }}>Annuler</button> <button type="button" className="secondary" onClick={() => { const job = pending.job; setPending(null); void transmit(job); }}>Envoyer maintenant</button></> : note}
        </div>
      )}

      {compose && box && (
        <MailCompose key={compose.key} box={box} base={base} draft={compose.draft} initialFiles={compose.files}
          onClose={(n) => { setCompose(null); if (n) setNote(n); loadFolders(); if (special === '\\Drafts') loadList(); }}
          onSend={(job) => { setCompose(null); setPending({ job, left: UNDO_SECONDS }); }}
          onDraftsChanged={() => { loadFolders(); if (special === '\\Drafts') loadList(); }} />
      )}
    </div></div>
  );
}
