import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import Loading from '../components/Loading';
import '../mail.css';

interface Alias { address: string; name: string }
interface Mailbox { id: string; label: string; address: string; aliases: Alias[]; signature: string }
interface Folder { path: string; name: string; special: string | null; unread: number }
interface Item { uid: number; subject: string; from: { name: string; address: string }; to: { name: string; address: string }[]; date: string | null; seen: boolean; flagged: boolean; answered: boolean; size: number; attachments: boolean }
interface Msg {
  uid: number; folder: string; subject: string; date: string | null; from: { name: string; address: string } | null; to: { name: string; address: string }[]; cc: { name: string; address: string }[]; via: string | null;
  html: string; remoteImages: number; text: string; attachments: { index: number; filename: string; contentType: string; size: number }[]; flagged: boolean;
}
interface Draft { from: string; to: string; cc: string; bcc: string; subject: string; text: string; inReplyTo?: string; references?: string[]; replyFolder?: string; replyUid?: number }

const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const FOLDER_ICON: Record<string, string> = { '\\Inbox': '📥', '\\Drafts': '📝', '\\Sent': '📤', '\\Archive': '🗄️', '\\Junk': '🚫', '\\Trash': '🗑️' };
const FOLDER_NAME: Record<string, string> = { '\\Inbox': 'Réception', '\\Drafts': 'Brouillons', '\\Sent': 'Envoyés', '\\Archive': 'Archives', '\\Junk': 'Indésirables', '\\Trash': 'Corbeille' };
const who = (a: { name: string; address: string } | null | undefined) => (a?.name || a?.address || '(inconnu)');
const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} ko`);
const shortDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); };

/** Cadre isolé pour afficher un courriel : aucun script ne peut s'y exécuter, et les images distantes ne se chargent que si on les a autorisées. */
function MailFrame({ html, images }: { html: string; images: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:${images ? ' https:' : ''}; style-src 'unsafe-inline'"><base target="_blank"><style>
    body{font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1f24;background:#fff;margin:0;padding:14px 16px;word-wrap:break-word;overflow-wrap:anywhere}
    img{max-width:100%;height:auto} table{max-width:100%} a{color:#2563eb} blockquote{border-left:3px solid #cbd5e1;margin:8px 0 8px 2px;padding-left:12px;color:#475569} pre{white-space:pre-wrap}
    .blocked-image{display:inline-block;padding:2px 8px;border:1px dashed #94a3b8;border-radius:4px;color:#64748b;font-size:12px}.blocked-image::before{content:"🖼 image bloquée"}
  </style></head><body>${html}</body></html>`, [html, images]);
  const fit = () => { const d = ref.current?.contentDocument; if (d?.body && ref.current) ref.current.style.height = `${Math.min(6000, d.documentElement.scrollHeight + 4)}px`; };
  return <iframe ref={ref} title="Courriel" className="mail-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} onLoad={fit} />;
}

/** Courriel (administrateurs) : lire, chercher, ranger et écrire depuis les boîtes du propriétaire, en choisissant l'alias qui envoie. */
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
  const [msg, setMsg] = useState<Msg | null>(null);
  const [images, setImages] = useState(false);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const box = boxes?.find((b) => b.id === boxId) ?? null;
  const base = `/webmail/mailboxes/${boxId}`;

  useEffect(() => { api.get('/webmail/mailboxes').then((r) => { setBoxes(r.data); if (r.data[0]) setBoxId(r.data[0].id); }).catch((e) => setError(errorOf(e))); }, []);
  const loadFolders = useCallback(() => { if (boxId) api.get(`${base}/folders`).then((r) => setFolders(r.data)).catch((e) => setError(errorOf(e))); }, [boxId, base]);
  useEffect(() => { setFolders([]); setFolder('INBOX'); setPage(1); setUid(null); setMsg(null); setQuery(''); setTyped(''); setAlias(''); loadFolders(); }, [boxId, loadFolders]);

  const loadList = useCallback(() => {
    if (!boxId) return;
    setError('');
    api.get(`${base}/messages`, { params: { folder, page, q: query || undefined, alias: alias || undefined, unseen: unseen ? '1' : undefined } }).then((r) => setList(r.data)).catch((e) => { setList({ items: [], total: 0, pageSize: 30 }); setError(errorOf(e)); });
  }, [boxId, base, folder, page, query, alias, unseen]);
  useEffect(() => { setList(null); loadList(); }, [loadList]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden && !compose) { loadList(); loadFolders(); } }, 90_000); return () => clearInterval(t); }, [loadList, loadFolders, compose]);

  async function open(item: Item) {
    setUid(item.uid); setMsg(null); setImages(false); setError('');
    try { const r = await api.get(`${base}/message`, { params: { folder, uid: item.uid } }); setMsg(r.data); setList((l) => l && { ...l, items: l.items.map((x) => (x.uid === item.uid ? { ...x, seen: true } : x)) }); if (!item.seen) loadFolders(); } catch (e) { setError(errorOf(e)); }
  }
  async function showImages() {
    if (!msg) return;
    try { const r = await api.get(`${base}/message`, { params: { folder, uid: msg.uid, images: '1' } }); setMsg(r.data); setImages(true); } catch (e) { setError(errorOf(e)); }
  }
  async function act(kind: 'unread' | 'flag' | 'archive' | 'delete' | 'move', target?: string) {
    if (!msg) return;
    setBusy(true); setNote(''); setError('');
    try {
      if (kind === 'unread') await api.post(`${base}/flags`, { folder, uids: [msg.uid], seen: false });
      else if (kind === 'flag') await api.post(`${base}/flags`, { folder, uids: [msg.uid], flagged: !msg.flagged });
      else if (kind === 'delete') await api.post(`${base}/delete`, { folder, uids: [msg.uid] });
      else await api.post(`${base}/move`, { folder, uids: [msg.uid], target: target ?? folders.find((f) => f.special === '\\Archive')?.path ?? 'Archive' });
      if (kind === 'flag') setMsg({ ...msg, flagged: !msg.flagged });
      else { setUid(null); setMsg(null); }
      loadList(); loadFolders();
    } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  async function reply(mode: 'reply' | 'all' | 'forward') {
    if (!msg) return;
    try {
      const { data } = await api.get(`${base}/reply`, { params: { folder, uid: msg.uid, mode } });
      setCompose({ from: data.from || box?.aliases[0]?.address || box?.address || '', to: data.to, cc: data.cc, bcc: '', subject: data.subject, text: data.text + (box?.signature ? `\n\n${box.signature}` : ''), inReplyTo: data.inReplyTo, references: data.references, replyFolder: mode === 'forward' ? undefined : folder, replyUid: mode === 'forward' ? undefined : msg.uid });
    } catch (e) { setError(errorOf(e)); }
  }
  async function download(index: number, filename: string) {
    try {
      const r = await api.get(`${base}/attachment`, { params: { folder, uid: msg!.uid, index }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setError(errorOf(e)); }
  }

  if (!boxes) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;
  if (boxes.length === 0) return (
    <div className="panel"><h1 style={{ marginTop: 0 }}>✉️ Courriel</h1>
      <p className="muted">Aucune boîte courriel ne t'est accessible. Le propriétaire peut en ajouter dans <strong>Admin &gt; Courriel</strong> et te donner l'accès.</p></div>
  );

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  return (
    <div className="mail-wrap"><div className={`mail-app${uid !== null ? ' reading' : ''}`}>
      <aside className="mail-side">
        <button type="button" className="mail-new" onClick={() => setCompose({ from: box?.aliases[0]?.address ?? box?.address ?? '', to: '', cc: '', bcc: '', subject: '', text: box?.signature ? `\n\n${box.signature}` : '' })}>✏️ Nouveau message</button>
        {boxes.length > 1 && <select value={boxId} onChange={(e) => setBoxId(e.target.value)} aria-label="Boîte">{boxes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>}
        <nav className="mail-folders">
          {folders.map((f) => (
            <button key={f.path} type="button" className={folder === f.path ? 'on' : ''} onClick={() => { setFolder(f.path); setPage(1); setUid(null); setMsg(null); }}>
              <span>{FOLDER_ICON[f.special ?? ''] ?? '📁'} {FOLDER_NAME[f.special ?? ''] ?? f.name}</span>{f.unread > 0 && <b className="mail-count">{f.unread}</b>}
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
      </aside>

      <section className="mail-list">
        <form className="mail-search" onSubmit={(e) => { e.preventDefault(); setQuery(typed.trim()); setPage(1); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Rechercher (sujet, expéditeur, texte)…" />
          <button type="submit" className="secondary">🔎</button>
          <label title="Seulement les non lus"><input type="checkbox" checked={unseen} onChange={(e) => { setUnseen(e.target.checked); setPage(1); }} /> non lus</label>
        </form>
        {error && <p style={{ color: 'var(--danger)', margin: '6px 8px' }}>{error}</p>}
        {!list ? <Loading /> : list.items.length === 0 ? <p className="muted" style={{ padding: 12 }}>{query || alias || unseen ? 'Aucun résultat.' : 'Ce dossier est vide.'}</p> : (
          <ul>
            {list.items.map((it) => (
              <li key={it.uid} className={`${it.seen ? '' : 'unread'}${uid === it.uid ? ' sel' : ''}`} onClick={() => open(it)}>
                <div className="mail-row1"><span className="mail-from">{folder.toLowerCase().includes('sent') || folder.toLowerCase().includes('envoy') ? `À ${who(it.to[0])}` : who(it.from)}</span><span className="mail-date">{shortDate(it.date)}</span></div>
                <div className="mail-row2"><span className="mail-subject">{it.flagged ? '⭐ ' : ''}{it.answered ? '↩ ' : ''}{it.subject}</span>{it.attachments && <span title="Pièce jointe">📎</span>}</div>
              </li>
            ))}
          </ul>
        )}
        {list && pages > 1 && (
          <div className="mail-pager"><button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{page} / {pages} · {list.total}</span><button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div>
        )}
      </section>

      <section className="mail-read">
        {uid === null ? <div className="mail-empty muted">Choisis un courriel dans la liste.</div> : !msg ? <Loading /> : (
          <>
            <div className="mail-bar">
              <button type="button" className="mail-back secondary" onClick={() => { setUid(null); setMsg(null); }}>← Liste</button>
              <button type="button" onClick={() => reply('reply')}>↩ Répondre</button>
              <button type="button" className="secondary" onClick={() => reply('all')}>↩↩ À tous</button>
              <button type="button" className="secondary" onClick={() => reply('forward')}>➡ Transférer</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => act('flag')} title="Suivi">{msg.flagged ? '⭐' : '☆'}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => act('unread')}>Non lu</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => act('archive')}>🗄️ Archiver</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => act('delete')}>🗑️ Supprimer</button>
              {folders.length > 1 && <select value="" onChange={(e) => e.target.value && act('move', e.target.value)} aria-label="Déplacer vers"><option value="">Déplacer vers…</option>{folders.filter((f) => f.path !== folder).map((f) => <option key={f.path} value={f.path}>{FOLDER_NAME[f.special ?? ''] ?? f.name}</option>)}</select>}
            </div>
            <header className="mail-head">
              <h2>{msg.subject}</h2>
              <div><strong>{who(msg.from)}</strong> <span className="muted">&lt;{msg.from?.address}&gt;</span> {msg.via && <span className="badge" title="Adresse (alias) qui a reçu ce courriel">via {msg.via}</span>}</div>
              <div className="muted" style={{ fontSize: 13 }}>À : {msg.to.map((t) => t.address).join(', ')}{msg.cc.length > 0 && ` · Cc : ${msg.cc.map((t) => t.address).join(', ')}`} · {msg.date ? `${new Date(msg.date).toLocaleString('fr-CA')} (${timeAgo(msg.date)})` : ''}</div>
            </header>
            {msg.remoteImages > 0 && !images && <div className="mail-warn">🖼️ {msg.remoteImages} image{msg.remoteImages > 1 ? 's' : ''} bloquée{msg.remoteImages > 1 ? 's' : ''} (elles peuvent révéler que tu as ouvert le message). <button type="button" className="secondary" onClick={showImages}>Afficher les images</button></div>}
            <MailFrame html={msg.html} images={images} />
            {msg.attachments.length > 0 && (
              <div className="mail-atts">{msg.attachments.map((a) => <button key={a.index} type="button" className="secondary" onClick={() => download(a.index, a.filename)}>📎 {a.filename} <small>({bytes(a.size)})</small></button>)}</div>
            )}
          </>
        )}
        {note && <p style={{ color: 'var(--success)' }}>{note}</p>}
      </section>

      {compose && box && <Compose box={box} base={base} draft={compose} onClose={() => setCompose(null)} onSent={() => { setCompose(null); setNote('Courriel envoyé.'); loadFolders(); loadList(); }} />}
    </div></div>
  );
}

function Compose({ box, base, draft, onClose, onSent }: { box: Mailbox; base: string; draft: Draft; onClose: () => void; onSent: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [showCc, setShowCc] = useState(!!draft.cc);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const senders = box.aliases.length ? box.aliases : [{ address: box.address, name: '' }];
  const total = files.reduce((s, f) => s + f.size, 0);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (total > 20 * 1024 * 1024) { setError('Pièces jointes trop lourdes (20 Mo au total)'); return; }
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify(d));
      files.forEach((f) => fd.append('files', f));
      await api.post(`${base}/send`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSent();
    } catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  }
  return (
    <div className="mail-modal" role="dialog" aria-modal="true" aria-label="Nouveau message">
      <form className="mail-compose panel" onSubmit={send}>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Nouveau message</h3><button type="button" className="secondary" onClick={onClose}>✕</button></div>
        <label>De<select value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })}>{senders.map((a) => <option key={a.address} value={a.address}>{a.name ? `${a.name} <${a.address}>` : a.address}</option>)}</select></label>
        <label>À<input value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} placeholder="adresse@exemple.com, autre@exemple.com" required /></label>
        {showCc ? <>
          <label>Cc<input value={d.cc} onChange={(e) => setD({ ...d, cc: e.target.value })} /></label>
          <label>Cci<input value={d.bcc} onChange={(e) => setD({ ...d, bcc: e.target.value })} /></label>
        </> : <button type="button" className="secondary" style={{ justifySelf: 'start' }} onClick={() => setShowCc(true)}>+ Cc / Cci</button>}
        <label>Sujet<input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} maxLength={300} /></label>
        <textarea value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} rows={14} placeholder="Écris ton message…" autoFocus />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="secondary mail-attach">📎 Joindre<input type="file" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = ''; }} /></label>
          {files.map((f, i) => <span key={i} className="badge">{f.name} ({bytes(f.size)}) <button type="button" className="mail-x" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Retirer">×</button></span>)}
        </div>
        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        <div className="row" style={{ gap: 8 }}><button type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer'}</button><button type="button" className="secondary" onClick={onClose}>Annuler</button></div>
      </form>
    </div>
  );
}
