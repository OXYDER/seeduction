import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useQueue } from '../store/queue';
import { timeAgo } from '../lib/time';
import { LANGUAGE_LABELS } from '../lib/languageTag';
import { RESOLUTIONS, SOURCES, CODECS } from '../lib/searchParser';
import UserLink from './UserLink';

export interface FixRow {
  id: string; status: string; note: string | null; createdAt: string; reviewedByName: string | null; reviewNote: string | null; reviewedAt: string | null;
  author: { id: string; username: string; role: string } | null;
  torrent?: { id: string; name: string; coverImage: string | null; category: string | null } | null;
  changes: { field: string; label: string; from: string | number | null; to: string | number }[];
}

const STATUS: Record<string, { label: string; color: string }> = { PENDING: { label: 'En attente', color: '#fbbf24' }, ACCEPTED: { label: 'Appliquée', color: '#34d399' }, REJECTED: { label: 'Refusée', color: '#f87171' } };

/** Ce qu'une correction change : « Langue : VO → MULTI.VFQ ». */
export function FixDiff({ fix }: { fix: FixRow }) {
  if (fix.changes.length === 0) return <span className="muted" style={{ fontSize: 13 }}>Remarque sans correction précise (quelque chose de pas clair ou louche).</span>;
  return (
    <div style={{ display: 'grid', gap: 2, fontSize: 13 }}>
      {fix.changes.map((c) => <div key={c.field}><strong>{c.label}</strong> : <span className="muted">{c.from ?? '(vide)'}</span> → <strong style={{ color: 'var(--gold-bright)' }}>{String(c.to)}</strong></div>)}
    </div>
  );
}

/** Boutons d'une correction en attente, pour l'équipe : l'appliquer d'un clic ou la refuser avec un motif. */
export function FixActions({ fix, onDone }: { fix: FixRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const refreshQueue = useQueue((s) => s.refresh);
  async function run(kind: 'accept' | 'reject') {
    let body: any = {};
    if (kind === 'reject') {
      const reason = window.prompt('Motif du refus (visible par le membre) :', '');
      if (reason === null) return;
      body = { reason };
    }
    setBusy(true); setErr('');
    try { await api.post('/admin/torrent-fixes/' + fix.id + '/' + kind, body); onDone(); void refreshQueue(); } catch (e: any) { setErr(e.response?.data?.message ?? 'Action impossible'); } finally { setBusy(false); }
  }
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" disabled={busy} onClick={() => run('accept')}>{fix.changes.length ? '✓ Appliquer' : '✓ Noter comme traité'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => run('reject')}>✕ Refuser</button>
      {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
    </div>
  );
}

interface TorrentLite { id: string; name: string; uploader?: { id: string } | null; language?: string | null; resolution?: string | null; source?: string | null; codec?: string | null; audio?: string | null; season?: string | null; episode?: string | null; year?: number | null }

const FIELDS: { key: keyof TorrentLite; label: string; options?: string[]; type?: string }[] = [
  { key: 'language', label: 'Langue', options: Object.keys(LANGUAGE_LABELS) },
  { key: 'resolution', label: 'Résolution', options: RESOLUTIONS },
  { key: 'source', label: 'Source', options: SOURCES },
  { key: 'codec', label: 'Codec vidéo', options: CODECS },
  { key: 'audio', label: 'Audio' },
  { key: 'season', label: 'Saison' },
  { key: 'episode', label: 'Épisode' },
  { key: 'year', label: 'Année', type: 'number' },
  { key: 'name', label: 'Nom de la release' },
];

/** Fiche d'un torrent : un membre propose une correction (ou signale quelque chose de pas clair), l'équipe les traite ; chacun voit l'état de ses propositions. */
export default function TorrentFixes({ torrent }: { torrent: TorrentLite }) {
  const user = useAuthStore((s) => s.user);
  const isStaff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(user?.role ?? '');
  const [rows, setRows] = useState<FixRow[]>([]);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const mine = torrent.uploader?.id === user?.id;

  const load = useCallback(() => { api.get('/torrents/' + torrent.id + '/fixes').then((r) => setRows(r.data)).catch(() => setRows([])); }, [torrent.id]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setErr('');
    const changes: Record<string, string> = {};
    for (const f of FIELDS) { const v = (values[f.key] ?? '').trim(); if (v && v !== String(torrent[f.key] ?? '')) changes[f.key] = v; }
    try {
      await api.post('/torrents/' + torrent.id + '/fixes', { changes, note });
      setOpen(false); setValues({}); setNote(''); setSent(true); load();
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Envoi impossible'); } finally { setBusy(false); }
  }
  async function withdraw(id: string) {
    try { await api.delete('/torrent-fixes/' + id); load(); } catch { /* sans effet */ }
  }

  const pending = rows.filter((r) => r.status === 'PENDING');
  const done = rows.filter((r) => r.status !== 'PENDING').slice(0, isStaff ? 5 : 3);
  if (!user || (mine && rows.length === 0)) return null;

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong>✏️ Corrections proposées{pending.length ? ' (' + pending.length + ' en attente)' : ''}</strong>
        {!mine && !open && <button type="button" className="secondary" onClick={() => { setOpen(true); setSent(false); }}>Une erreur ou quelque chose de louche ? Proposer une correction</button>}
      </div>
      {sent && <span style={{ color: 'var(--success)', fontSize: 13 }}>Merci ! Ta proposition est envoyée à l'équipe, qui la vérifie avant de l'appliquer.</span>}

      {open && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>Change seulement ce qui est faux (laisse le reste vide) et explique comment tu le sais. L'équipe vérifie avant d'appliquer : rien ne change tant qu'elle n'a pas accepté. Si tu as seulement un doute, décris-le dans la note.</span>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {FIELDS.map((f) => (
              <label key={f.key} style={{ display: 'grid', gap: 3, fontSize: 13, minWidth: f.key === 'name' ? 320 : 130 }}>{f.label}
                {f.options ? (
                  <select value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                    <option value="">{torrent[f.key] ? 'Actuel : ' + torrent[f.key] : '(à renseigner)'}</option>
                    {f.options.filter((o) => o !== String(torrent[f.key] ?? '')).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type ?? 'text'} placeholder={torrent[f.key] ? 'Actuel : ' + torrent[f.key] : ''} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Pourquoi ? (obligatoire)
            <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : la piste audio est bien en québécois, vérifié avec MediaInfo ; ou : le nom ne correspond pas au contenu du fichier." />
          </label>
          {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" disabled={busy} onClick={submit}>Envoyer à l'équipe</button>
            <button type="button" className="secondary" onClick={() => { setOpen(false); setErr(''); }}>Annuler</button>
          </div>
        </div>
      )}

      {pending.map((f) => (
        <div key={f.id} style={{ display: 'grid', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid ' + STATUS.PENDING.color }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span>{isStaff && f.author ? <UserLink user={f.author} /> : 'Ta proposition'} <span className="muted">· {timeAgo(f.createdAt)}</span></span>
            {!isStaff && <button type="button" className="secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => withdraw(f.id)}>Retirer</button>}
          </div>
          <FixDiff fix={f} />
          {f.note && <div className="muted" style={{ fontSize: 13, fontStyle: 'italic' }}>« {f.note} »</div>}
          {isStaff && <FixActions fix={f} onDone={load} />}
        </div>
      ))}
      {done.length > 0 && (
        <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          {done.map((f) => (
            <div key={f.id} className="muted"><span style={{ color: STATUS[f.status]?.color }}>{STATUS[f.status]?.label ?? f.status}</span>{isStaff && f.author ? <> · <UserLink user={f.author} /></> : null} · {f.changes.map((c) => c.label + ' → ' + String(c.to)).join(', ') || 'remarque'}{f.reviewedByName ? ' · par ' + f.reviewedByName : ''}{f.reviewNote ? ' · ' + f.reviewNote : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}
