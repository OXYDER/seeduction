import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };

/** Bouton « 🔔 Alerte » de Parcourir : enregistre la recherche et les filtres du moment, et prévient quand un nouveau torrent y correspond. */
export default function SaveSearchButton({ query }: { query: Record<string, string> }) {
  const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')) as Record<string, string>;
  const usable = Object.keys(clean).length > 0;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [inApp, setInApp] = useState(true);
  const [telegram, setTelegram] = useState(false);
  const [info, setInfo] = useState<{ total: number; summary: string; sample: { id: string; name: string }[] } | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(clean);

  useEffect(() => { setSaved(false); setError(''); }, [key]);
  useEffect(() => {
    if (!open) return;
    setInfo(null); setError('');
    api.post('/saved-searches/preview', { query: clean }).then((r) => setInfo(r.data)).catch((e) => setError(errorOf(e)));
    api.get('/saved-searches').then((r) => setTelegramLinked(!!r.data.telegramLinked)).catch(() => undefined);
    const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setError('');
    try { await api.post('/saved-searches', { name: name.trim() || undefined, query: clean, inApp, telegram }); setSaved(true); setOpen(false); } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }

  if (!usable) return null;
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button type="button" className={`icon-btn${saved ? ' active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Être prévenu quand un nouveau torrent correspond à cette recherche">
        <span>🔔</span> {saved ? 'Alerte créée' : 'Alerte'}
      </button>
      {open && (
        <div className="panel" role="dialog" aria-label="Créer une alerte" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, width: 320, display: 'grid', gap: 8 }}>
          <strong>🔔 Prévenez-moi des nouveautés</strong>
          {info && <div className="muted" style={{ fontSize: 13 }}>{info.summary} · {info.total} torrent{info.total > 1 ? 's' : ''} actuellement{info.sample[0] ? <> (dernier : <Link to={`/torrents/${info.sample[0].id}`}>{info.sample[0].name.slice(0, 40)}…</Link>)</> : ''}. Tu seras prévenu des <em>prochains</em>.</div>}
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Nom (facultatif)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={String(clean.search ?? 'Mon alerte')} /></label>
          <label className="row" style={{ gap: 8, fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={inApp} onChange={(e) => setInApp(e.target.checked)} /> Dans la cloche du site</label>
          <label className="row" style={{ gap: 8, fontSize: 13, opacity: telegramLinked ? 1 : 0.6 }}><input type="checkbox" style={{ width: 'auto' }} checked={telegram} disabled={!telegramLinked} onChange={(e) => setTelegram(e.target.checked)} /> Par message Telegram {!telegramLinked && <small>(relie d'abord ton compte sur la page Telegram)</small>}</label>
          {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" disabled={busy || (!inApp && !telegram)} onClick={save}>Créer l'alerte</button>
            <Link to="/alerts" className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Mes alertes →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
