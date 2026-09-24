import { useState } from 'react';
import { api } from '../api/client';

/** NFO du torrent, chargé seulement au clic (il peut être volumineux). */
export default function NfoPanel({ torrentId }: { torrentId: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null | undefined>(undefined);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && content === undefined) {
      try { setContent((await api.get(`/torrents/${torrentId}/nfo`)).data.content ?? null); } catch { setContent(null); }
    }
  }

  return (
    <div className="panel">
      <button type="button" className="secondary" onClick={toggle}>{open ? 'Masquer le NFO' : '📄 Voir le NFO'}</button>
      {open && (
        content === undefined ? <p className="muted">Chargement...</p>
        : content === null ? <p className="muted">Aucun NFO joint à ce torrent.</p>
        : <pre style={{ marginTop: 12, overflowX: 'auto', fontFamily: 'Consolas, "Courier New", monospace', fontSize: 12, lineHeight: 1.25 }}>{content}</pre>
      )}
    </div>
  );
}
