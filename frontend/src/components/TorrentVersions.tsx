import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { VersionRow, sortVersions } from './TorrentGroups';

/** Autres versions du même contenu déjà sur le site (qualité, source, codec, taille, uploader...). */
export default function TorrentVersions({ torrentId }: { torrentId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setRows([]);
    api.get(`/torrents/${torrentId}/versions`).then((r) => setRows(r.data)).catch(() => {});
  }, [torrentId]);

  if (rows.length < 2) return null;
  return (
    <div className="panel">
      <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} style={{ marginBottom: open ? 10 : 0 }}>
        {open ? '▾' : '▸'} 📚 Versions <span className="muted">(+{rows.length - 1})</span>
      </button>
      {open && (
        <div className="vg-rows flat vg-list">
          <div className="vg-legend"><span /><span>Version</span><span className="vr-num">Âge</span><span className="vr-num">Taille</span><span className="vr-num">Compl.</span><span className="vr-num">Seed</span><span className="vr-num">Leech</span><span /></div>
          {sortVersions(rows).map((r) => <VersionRow key={r.id} t={r} current={r.current} nameLink />)}
        </div>
      )}
    </div>
  );
}
