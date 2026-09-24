import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import UserLink from './UserLink';

/** Autres versions du même contenu déjà sur le site (qualité, source, codec, taille, uploader...). */
export default function TorrentVersions({ torrentId }: { torrentId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setRows([]);
    api.get(`/torrents/${torrentId}/versions`).then((r) => setRows(r.data)).catch(() => {});
  }, [torrentId]);

  if (rows.length < 2) return null;
  const chip = (text: string | null | undefined, color: string) => text
    ? <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600, color, background: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>{text}</span>
    : <span />;

  return (
    <div className="panel">
      <button type="button" className="secondary" onClick={() => setOpen((v) => !v)} style={{ marginBottom: open ? 10 : 0 }}>
        {open ? '▾' : '▸'} 📚 Versions <span className="muted">(+{rows.length - 1})</span>
      </button>
      {open && (
        <div className="grid" style={{ gap: 6 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) navigate(`/torrents/${r.id}`); }}
              style={{ cursor: 'pointer',
                display: 'grid', gridTemplateColumns: 'minmax(90px,auto) 70px 80px 80px 60px minmax(90px,auto) 1fr 70px 60px', gap: 8, alignItems: 'center',
                padding: '8px 12px', borderRadius: 8, 
                background: r.current ? 'rgba(124,92,255,0.18)' : 'rgba(255,255,255,0.04)', border: r.current ? '1px solid var(--acc1, var(--gold))' : '1px solid transparent',
              }}
            >
              {chip(r.language, '#5eead4')}
              {chip(r.resolution, '#38bdf8')}
              {chip([r.source, r.hdr ? 'HDR' : ''].filter(Boolean).join(' '), '#5eead4')}
              {chip(r.audio, '#fbbf24')}
              <span className="muted" style={{ fontSize: 13 }}>{r.codec ?? ''}</span>
              <span style={{ fontSize: 13 }}>{r.uploader ? <UserLink user={r.uploader} /> : <span className="muted">Anonyme</span>}</span>
              <Link to={`/torrents/${r.id}`} className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</Link>
              <span style={{ fontSize: 12 }}><span style={{ color: 'var(--success)' }}>{r.seeders} S</span> <span style={{ color: 'var(--danger)' }}>{r.leechers} L</span></span>
              <span style={{ textAlign: 'right', fontSize: 13 }}>{formatBytes(r.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
