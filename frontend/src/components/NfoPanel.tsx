import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * NFO du torrent, chargé seulement au clic (il peut être volumineux). Avec `alwaysOpen` (onglet « NFO » de la fiche), il
 * s'affiche directement, sans bouton, dès que l'onglet est ouvert.
 */
export default function NfoPanel({ torrentId, alwaysOpen }: { torrentId: string; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(!!alwaysOpen);
  const [content, setContent] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!alwaysOpen) return;
    api.get(`/torrents/${torrentId}/nfo`).then((r) => setContent(r.data.content ?? null)).catch(() => setContent(null));
  }, [alwaysOpen, torrentId]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && content === undefined) {
      try { setContent((await api.get(`/torrents/${torrentId}/nfo`)).data.content ?? null); } catch { setContent(null); }
    }
  }

  return (
    <div className="panel">
      {!alwaysOpen && <button type="button" className="secondary" onClick={toggle}>{open ? 'Masquer le NFO' : '📄 Voir le NFO'}</button>}
      {open && (
        content === undefined ? <p className="muted">Chargement...</p>
        : content === null ? <p className="muted">Aucun NFO joint à ce torrent.</p>
        : <pre style={{ marginTop: alwaysOpen ? 0 : 12, overflowX: 'auto', fontFamily: 'Consolas, "Courier New", monospace', fontSize: 12, lineHeight: 1.25 }}>{content}</pre>
      )}
    </div>
  );
}
