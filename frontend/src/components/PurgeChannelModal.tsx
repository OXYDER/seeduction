import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** Valeur d'un champ datetime-local (heure locale). */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const dt = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Vider un canal : tous les messages ou ceux envoyés depuis une date. L'action est définitive : la fenêtre montre combien de
 * messages seront supprimés et ne s'active qu'une fois le nom du canal écrit en toutes lettres.
 */
export default function PurgeChannelModal({ channel, onClose, onDone }: { channel: { id: string; name: string }; onClose: () => void; onDone?: (deleted: number) => void }) {
  const [mode, setMode] = useState<'all' | 'since'>('all');
  const [since, setSince] = useState(() => localInput(new Date(Date.now() - 24 * 3600_000)));
  const [preview, setPreview] = useState<{ count: number; total: number; oldest: string | null } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  const sinceIso = mode === 'since' && since ? new Date(since).toISOString() : '';

  useEffect(() => {
    setPreview(null); setError('');
    if (mode === 'since' && !since) return;
    let alive = true;
    const h = setTimeout(() => {
      api.get(`/messenger/admin/channels/${channel.id}/purge-preview`, { params: sinceIso ? { since: sinceIso } : {} })
        .then((r) => { if (alive) setPreview(r.data); })
        .catch((e) => { if (alive) setError(e.response?.data?.message ?? 'Aperçu impossible'); });
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [channel.id, mode, since, sinceIso]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const matches = typed.trim().toLowerCase() === channel.name.trim().toLowerCase();
  const nothing = preview !== null && preview.count === 0;

  async function purge() {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/messenger/admin/channels/${channel.id}/purge`, { since: sinceIso || null, confirm: typed });
      setDone(data.deleted);
      onDone?.(data.deleted);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible de vider le canal'); }
    finally { setBusy(false); }
  }

  return (
    <div className="purge-backdrop" role="dialog" aria-modal="true" aria-label={`Vider le canal ${channel.name}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="purge-box">
        {done !== null ? (
          <>
            <h3 style={{ marginTop: 0 }}>✅ Canal vidé</h3>
            <p>{done} message{done > 1 ? 's' : ''} supprimé{done > 1 ? 's' : ''} de <strong># {channel.name}</strong>.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" onClick={onClose}>Fermer</button></div>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>🧹 Vider le canal # {channel.name}</h3>
            <div className="purge-warning">⚠️ Action <strong>définitive</strong> : les messages supprimés disparaissent pour tout le monde (avec leurs réactions et leurs messages épinglés) et ne peuvent pas être récupérés.</div>

            <div className="purge-options">
              <label className={`purge-option${mode === 'all' ? ' on' : ''}`}>
                <input type="radio" name="purge-mode" checked={mode === 'all'} onChange={() => setMode('all')} />
                <span><strong>Tous les messages</strong><br /><span className="muted">Le canal repart de zéro.</span></span>
              </label>
              <label className={`purge-option${mode === 'since' ? ' on' : ''}`}>
                <input type="radio" name="purge-mode" checked={mode === 'since'} onChange={() => setMode('since')} />
                <span><strong>Seulement depuis une date</strong><br /><span className="muted">Les messages plus anciens sont conservés.</span></span>
              </label>
            </div>
            {mode === 'since' && (
              <label className="purge-field">
                <span className="muted">Supprimer les messages envoyés depuis le</span>
                <input type="datetime-local" value={since} max={localInput(new Date())} onChange={(e) => setSince(e.target.value)} />
              </label>
            )}

            <div className={`purge-count${nothing ? ' none' : ''}`}>
              {preview === null ? (error ? '' : 'Calcul…') : nothing
                ? 'Aucun message à supprimer pour ce choix.'
                : <><strong>{preview.count}</strong> message{preview.count > 1 ? 's' : ''} sur {preview.total} {preview.count > 1 ? 'seront supprimés' : 'sera supprimé'}{preview.oldest ? <> (le plus ancien : {dt(preview.oldest)})</> : null}.</>}
            </div>

            <label className="purge-field">
              <span>Pour confirmer, écris le nom du canal : <code>{channel.name}</code></span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={channel.name} autoComplete="off" spellCheck={false} />
            </label>

            {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" className="secondary" disabled={busy} onClick={onClose}>Annuler</button>
              <button type="button" className="danger" disabled={busy || !matches || nothing || preview === null} onClick={purge}>
                {busy ? 'Suppression…' : preview && preview.count > 0 ? `🗑️ Supprimer ${preview.count} message${preview.count > 1 ? 's' : ''}` : '🗑️ Supprimer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
