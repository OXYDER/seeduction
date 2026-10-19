import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import WysiwygEditor from './WysiwygEditor';

export interface MailAlias { address: string; name: string }
export interface MailBoxInfo { id: string; label: string; address: string; aliases: MailAlias[]; signature: string }
export interface KeptFile { index: number; filename: string; size: number }
/** Message en cours de rédaction. `body` est écrit en BBCode (le format de l'éditeur du site) ; il part en HTML. */
export interface MailDraft {
  from: string; to: string; cc: string; bcc: string; subject: string; body: string;
  inReplyTo?: string; references?: string[]; replyFolder?: string; replyUid?: number;
  draftFolder?: string; draftUid?: number; kept?: KeptFile[];
}
export interface SendJob { draft: MailDraft; files: File[] }

const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} ko`);
const MAX_TOTAL = 20 * 1024 * 1024;

/** BBCode de l'éditeur → HTML de courriel : les images et liens du site (chemins « /… ») deviennent absolus, sinon le destinataire ne les verrait pas. */
export function bodyToHtml(body: string): string {
  const html = bbcodeToHtml(body, { mentions: false });
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${window.location.origin}/`);
}

/** Corps de la requête d'envoi ou d'enregistrement (les pièces jointes partent à part). */
export function payloadOf(d: MailDraft) {
  return {
    from: d.from, to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, html: bodyToHtml(d.body),
    inReplyTo: d.inReplyTo, references: d.references, replyFolder: d.replyFolder, replyUid: d.replyUid,
    draftFolder: d.draftFolder, draftUid: d.draftUid, keepAttachments: (d.kept ?? []).map((k) => k.index),
  };
}

export async function postMail(base: string, path: 'send' | 'draft', draft: MailDraft, files: File[]) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payloadOf(draft)));
  files.forEach((f) => fd.append('files', f));
  return api.post(`${base}/${path}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
}

/** Champ d'adresses (séparées par des virgules) avec suggestions des gens déjà croisés dans la boîte. */
function AddrInput({ label, value, onChange, base, required, autoFocus }: { label: string; value: string; onChange: (v: string) => void; base: string; required?: boolean; autoFocus?: boolean }) {
  const [list, setList] = useState<{ name: string; address: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [focus, setFocus] = useState(false);
  const token = value.split(/[,;]/).pop()!.trim();
  useEffect(() => {
    if (!focus || token.length < 2 || token.includes('<')) { setList([]); return; }
    let off = false;
    const t = window.setTimeout(() => { api.get(`${base}/contacts`, { params: { q: token } }).then((r) => { if (!off) { setList(r.data.slice(0, 6)); setIdx(0); } }).catch(() => undefined); }, 160);
    return () => { off = true; window.clearTimeout(t); };
  }, [token, focus, base]);
  function pick(c: { name: string; address: string }) {
    const head = value.replace(/[^,;]*$/, '');
    onChange(`${head}${head && !/\s$/.test(head) ? ' ' : ''}${c.name ? `${c.name.replace(/[<>",;]/g, '')} <${c.address}>` : c.address}, `);
    setList([]);
  }
  return (
    <label className="mail-addr">{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
        onFocus={() => setFocus(true)} onBlur={() => window.setTimeout(() => setFocus(false), 150)} placeholder="adresse@exemple.com, autre@exemple.com"
        onKeyDown={(e) => {
          if (list.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (i + 1) % list.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => (i + list.length - 1) % list.length); }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[idx] ?? list[0]); } else if (e.key === 'Escape') { e.stopPropagation(); setList([]); }
        }} />
      {list.length > 0 && (
        <ul className="mail-suggest" role="listbox">
          {list.map((c, i) => <li key={c.address} role="option" aria-selected={i === idx} className={i === idx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setIdx(i)}><strong>{c.name || c.address}</strong>{c.name && <span className="muted"> {c.address}</span>}</li>)}
        </ul>
      )}
    </label>
  );
}

interface Props {
  box: MailBoxInfo; base: string; draft: MailDraft; initialFiles?: File[];
  onClose: (note?: string) => void;
  /** Lance l'envoi (avec délai d'annulation) ; le composeur se ferme. */
  onSend: (job: SendJob) => void;
  onDraftsChanged: () => void;
}

export default function MailCompose({ box, base, draft, initialFiles, onClose, onSend, onDraftsChanged }: Props) {
  const [d, setD] = useState<MailDraft>(draft);
  const [showCc, setShowCc] = useState(!!draft.cc || !!draft.bcc);
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<'' | 'saving' | 'saved'>('');
  const [over, setOver] = useState(false);
  const dRef = useRef(d); dRef.current = d;
  const filesRef = useRef(files); filesRef.current = files;
  const lastSaved = useRef(JSON.stringify([draft.from, draft.to, draft.cc, draft.bcc, draft.subject, draft.body]));
  const saving = useRef(false);
  const senders = box.aliases.length ? box.aliases : [{ address: box.address, name: '' }];
  const total = files.reduce((s, f) => s + f.size, 0) + (d.kept ?? []).reduce((s, k) => s + k.size, 0);
  const sig = (x: MailDraft) => JSON.stringify([x.from, x.to, x.cc, x.bcc, x.subject, x.body]);
  const hasContent = (x: MailDraft) => !!(x.to.trim() || x.subject.trim() || x.body.replace(/\[\/?\w+[^\]]*\]/g, '').trim());

  /** Enregistre dans Brouillons ; `force` : même sans modification (bouton, fermeture avec pièces jointes neuves). */
  const save = useCallback(async (force = false): Promise<boolean> => {
    const cur = dRef.current, fs = filesRef.current;
    if (saving.current) return false;
    if (!hasContent(cur) && fs.length === 0) return true;
    if (!force && sig(cur) === lastSaved.current && fs.length === 0) return true;
    saving.current = true; setSaved('saving');
    try {
      const { data } = await postMail(base, 'draft', cur, fs);
      let kept = cur.kept;
      if (data.uid && ((cur.kept?.length ?? 0) > 0 || fs.length > 0)) {
        try { kept = (await api.get(`${base}/draft`, { params: { folder: data.folder, uid: data.uid } })).data.attachments; } catch { /* les pièces jointes seront relues à la prochaine ouverture */ }
      }
      setD((x) => ({ ...x, draftFolder: data.folder, draftUid: data.uid ?? undefined, kept }));
      dRef.current = { ...dRef.current, draftFolder: data.folder, draftUid: data.uid ?? undefined, kept };
      if (fs.length > 0) setFiles([]);
      lastSaved.current = sig(cur); setSaved('saved'); onDraftsChanged();
      return true;
    } catch (e) { setSaved(''); setError(errorOf(e)); return false; } finally { saving.current = false; }
  }, [base, onDraftsChanged]);

  // Enregistrement automatique toutes les 25 s quand le message a changé (sans nouvelle pièce jointe : celles-ci partent à l'enregistrement manuel ou à la fermeture).
  useEffect(() => {
    const t = window.setInterval(() => { if (filesRef.current.length === 0) void save(); }, 25_000);
    return () => window.clearInterval(t);
  }, [save]);

  async function close() {
    const cur = dRef.current;
    const dirty = sig(cur) !== lastSaved.current || filesRef.current.length > 0;
    if (dirty && hasContent(cur)) { if (await save(true)) onClose('Brouillon enregistré.'); return; }
    onClose(cur.draftUid ? 'Brouillon enregistré.' : undefined);
  }
  async function discard() {
    if (!window.confirm('Abandonner ce message ? Le brouillon sera supprimé.')) return;
    const cur = dRef.current;
    if (cur.draftUid && cur.draftFolder) { try { await api.post(`${base}/delete`, { folder: cur.draftFolder, uids: [cur.draftUid] }); onDraftsChanged(); } catch (e) { setError(errorOf(e)); return; } }
    onClose();
  }
  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (total > MAX_TOTAL) { setError('Pièces jointes trop lourdes (20 Mo au total)'); return; }
    if (!d.to.trim()) { setError('Indique au moins un destinataire'); return; }
    if (!d.subject.trim() && !window.confirm('Envoyer sans sujet ?')) return;
    setError('');
    onSend({ draft: d, files });
  }
  const addFiles = (list: File[]) => setFiles((cur) => [...cur, ...list].slice(0, 10));
  const submitRef = useRef(submit); submitRef.current = submit;

  return (
    <div className="mail-modal" role="dialog" aria-modal="true" aria-label="Nouveau message"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); void close(); }
        else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitRef.current(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(true); }
      }}>
      <form className={`mail-compose panel${over ? ' drop' : ''}`} onSubmit={submit}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(Array.from(e.dataTransfer.files)); }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>{d.subject.trim() || 'Nouveau message'}</h3>
          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
            <small className="muted">{saved === 'saving' ? 'Enregistrement…' : saved === 'saved' ? 'Brouillon enregistré' : ''}</small>
            <button type="button" className="secondary" onClick={() => void close()} title="Fermer (le brouillon est conservé) — Échap">✕</button>
          </span>
        </div>
        <label>De<select value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })}>{senders.map((a) => <option key={a.address} value={a.address}>{a.name ? `${a.name} <${a.address}>` : a.address}</option>)}</select></label>
        <AddrInput label="À" value={d.to} onChange={(v) => setD({ ...d, to: v })} base={base} autoFocus={!d.to} />
        {showCc ? <>
          <AddrInput label="Cc" value={d.cc} onChange={(v) => setD({ ...d, cc: v })} base={base} />
          <AddrInput label="Cci" value={d.bcc} onChange={(v) => setD({ ...d, bcc: v })} base={base} />
        </> : <button type="button" className="secondary" style={{ justifySelf: 'start' }} onClick={() => setShowCc(true)}>+ Cc / Cci</button>}
        <label>Sujet<input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} maxLength={300} autoFocus={!!d.to && !d.subject} /></label>
        <WysiwygEditor value={d.body} onChange={(body) => setD((x) => ({ ...x, body }))} mentions={false} dropImages autoFocus={!!d.to && !!d.subject} minHeight={240} placeholder="Écris ton message… (tu peux coller une image)" />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="secondary mail-attach">📎 Joindre<input type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label>
          {(d.kept ?? []).map((k) => <span key={`k${k.index}`} className="badge">{k.filename} ({bytes(k.size)}) <button type="button" className="mail-x" onClick={() => setD({ ...d, kept: (d.kept ?? []).filter((x) => x.index !== k.index) })} aria-label="Retirer">×</button></span>)}
          {files.map((f, i) => <span key={i} className="badge">{f.name} ({bytes(f.size)}) <button type="button" className="mail-x" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Retirer">×</button></span>)}
          {over && <span className="muted">Dépose les fichiers ici</span>}
        </div>
        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" title="Ctrl + Entrée">Envoyer</button>
          <button type="button" className="secondary" onClick={() => void save(true)} title="Ctrl + S">💾 Enregistrer</button>
          <button type="button" className="secondary" onClick={discard}>🗑️ Abandonner</button>
        </div>
      </form>
    </div>
  );
}
