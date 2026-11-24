import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

/** Connecter une télé ou une box : le QR code affiché à l'écran ouvre cette page avec le code ; il suffit de confirmer. */
export default function TvConnect() {
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<{ eligible: boolean; rule: string } | null>(null);
  useEffect(() => { api.get('/vod/status').then((r) => setSt(r.data)).catch(() => setSt(null)); }, []);
  const clean = code.replace(/[^A-Z0-9]/g, '');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api.post('/vod/device/approve', { code: clean });
      setMsg({ ok: true, text: 'Télé connectée : elle ouvre le catalogue dans quelques secondes.' });
      setCode('');
    } catch (err: any) { setMsg({ ok: false, text: err?.response?.data?.message ?? 'Code refusé.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid page-narrow" style={{ gap: 18 }}>
      <div className="panel ornate" style={{ textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
        <h1 style={{ margin: 0 }}>📺 Connecter ta télé</h1>
        <p className="muted" style={{ margin: 0 }}>Vérifie que le code ci-dessous est bien celui affiché sur ta télé, puis touche « Connecter ».</p>
        {st && !st.eligible ? (
          <p style={{ margin: 0 }}>🔒 {st.rule} <a href="/soutenir">Soutenir le site</a></p>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
            <input id="tv-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9} placeholder="Code de la télé" aria-label="Code affiché sur la télé" autoComplete="off" style={{ width: 220, textAlign: 'center', fontSize: 24, letterSpacing: '0.14em', fontFamily: 'ui-monospace, monospace' }} />
            <button type="submit" className="download-btn" disabled={busy || clean.length < 8}>{busy ? '…' : 'Connecter la télé'}</button>
          </form>
        )}
        {msg && <p style={{ margin: 0, color: msg.ok ? 'var(--ok, #34d399)' : 'var(--danger, #f87171)' }}>{msg.text}</p>}
      </div>
    </div>
  );
}
