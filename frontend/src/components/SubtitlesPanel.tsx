import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';

interface Sub { id: string; fileIndex: number | null; language: string; languageName: string; label: string; cues: number; offsetMs: number; downloads: number; uploader: string | null; createdAt: string; mine: boolean; canEdit: boolean }
interface Data { languages: { code: string; name: string }[]; files: { index: number; path: string }[]; items: Sub[] }
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const base = (p: string) => p.split('/').pop() ?? p;

/** Fiche d'un torrent vidéo : sous-titres partagés par les membres (téléchargeables, et chargés tout seuls par le lecteur Seeduction), avec envoi et réglage de la synchronisation. */
export default function SubtitlesPanel({ torrentId }: { torrentId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('fr');
  const [label, setLabel] = useState('');
  const [fileIndex, setFileIndex] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/subtitles/torrent/${torrentId}`).then((r) => setData(r.data)).catch((e) => setError(errorOf(e)));
  useEffect(() => { void load(); }, [torrentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Choisis un fichier .srt ou .vtt'); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('language', lang); if (label.trim()) fd.append('label', label.trim()); if (fileIndex !== '') fd.append('fileIndex', fileIndex);
      await api.post(`/subtitles/torrent/${torrentId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFile(null); setLabel(''); setOpen(false); setNote('Sous-titres ajoutés. Merci !'); await load();
    } catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  }
  async function download(s: Sub) {
    try {
      const r = await api.get(`/subtitles/${s.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `${s.language}.srt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, downloads: x.downloads + 1 } : x)) });
    } catch (err) { setError(errorOf(err)); }
  }
  async function shift(s: Sub, deltaMs: number) {
    try { const r = await api.put(`/subtitles/${s.id}`, { offsetMs: s.offsetMs + deltaMs }); setData((d) => d && { ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, offsetMs: r.data.offsetMs } : x)) }); } catch (err) { setError(errorOf(err)); }
  }
  async function remove(s: Sub) {
    if (!window.confirm('Supprimer ces sous-titres ?')) return;
    try { await api.delete(`/subtitles/${s.id}`); await load(); } catch (err) { setError(errorOf(err)); }
  }

  if (!data) return error ? <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p> : null;
  const needFile = data.files.length > 1;
  const nameOf = (i: number | null) => (i === null ? 'Tout le torrent' : base(data.files.find((f) => f.index === i)?.path ?? `fichier ${i + 1}`));
  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>💬 Sous-titres <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>({data.items.length})</span></h3>
        <button type="button" className="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>＋ Ajouter des sous-titres</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Le lecteur Seeduction charge ces sous-titres tout seul quand tu regardes ce torrent (la langue est choisie dans le lecteur : touche <kbd>V</kbd> de VLC).</p>
      {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
      {note && <span style={{ color: 'var(--success)', fontSize: 13 }}>{note}</span>}
      {open && (
        <form onSubmit={send} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Fichier (.srt / .vtt)<input type="file" accept=".srt,.vtt,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Langue<select value={lang} onChange={(e) => setLang(e.target.value)}>{data.languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
          {data.files.length > 0 && (
            <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Pour quel fichier ?
              <select value={fileIndex} onChange={(e) => setFileIndex(e.target.value)} required={needFile}>
                {!needFile && <option value="">Tout le torrent</option>}
                {needFile && <option value="">Choisis…</option>}
                {data.files.map((f) => <option key={f.index} value={f.index}>{base(f.path)}</option>)}
              </select>
            </label>
          )}
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Précision (facultatif)<input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="ex : forcés, SDH, calés sur la WEB-DL" /></label>
          <button type="submit" disabled={busy || !file}>{busy ? 'Envoi…' : 'Envoyer'}</button>
        </form>
      )}
      {data.items.length === 0 ? <span className="muted">Aucun sous-titre pour l'instant : sois le premier !</span> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {data.items.map((s) => (
            <div key={s.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <strong>{s.languageName}</strong> {s.label && <span className="badge">{s.label}</span>} {data.files.length > 1 && <small className="muted">· {nameOf(s.fileIndex)}</small>}
                <div className="muted" style={{ fontSize: 12 }}>{s.cues} répliques · {s.downloads} téléchargement{s.downloads > 1 ? 's' : ''} · par {s.uploader ?? 'un membre'} {timeAgo(s.createdAt)}{s.offsetMs ? ` · décalage ${s.offsetMs > 0 ? '+' : ''}${(s.offsetMs / 1000).toFixed(1)} s` : ''}</div>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {s.canEdit && (
                  <span className="row" style={{ gap: 4, alignItems: 'center' }} title="Si les sous-titres arrivent trop tôt ou trop tard, décale-les : tout le monde en profite (lecteur et téléchargement)">
                    <button type="button" className="secondary" onClick={() => shift(s, -500)} aria-label="Plus tôt de 0,5 seconde">−0,5 s</button>
                    <button type="button" className="secondary" onClick={() => shift(s, 500)} aria-label="Plus tard de 0,5 seconde">+0,5 s</button>
                  </span>
                )}
                <button type="button" className="secondary" onClick={() => download(s)}>⬇ .srt</button>
                {s.canEdit && <button type="button" className="secondary" onClick={() => remove(s)} aria-label="Supprimer">🗑️</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
