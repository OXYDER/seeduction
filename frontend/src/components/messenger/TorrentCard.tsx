import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { formatBytes } from '../../lib/format';
import { HealthDot } from '../TorrentBits';
import type { TorrentCardData } from '../../store/messenger';

/** Fiche de torrent affichée dans une bulle (torrent partagé, ou lien collé vers une fiche du site). */
export default function TorrentCard({ t }: { t: TorrentCardData }) {
  // Un torrent adulte n'est jamais détaillé dans le message : on demande sa fiche, refusée si le membre a masqué le contenu adulte.
  const [adult, setAdult] = useState<any | 'blocked' | null>(null);
  useEffect(() => {
    if (!t.adult) return;
    let cancelled = false;
    api.get(`/torrents/${t.id}/preview`).then((r) => { if (!cancelled) setAdult(r.data); }).catch(() => { if (!cancelled) setAdult('blocked'); });
    return () => { cancelled = true; };
  }, [t.id, t.adult]);

  if (t.adult && adult === 'blocked') return <div className="msgr-torrent muted">🔞 Contenu masqué</div>;
  const d: any = t.adult ? adult : t;
  if (!d) return <div className="msgr-torrent muted">Chargement du torrent…</div>;
  const category = d.category?.name ?? d.category;
  return (
    <Link to={`/torrents/${t.id}`} className="msgr-torrent">
      {d.coverImage ? <img src={d.coverImage} alt="" loading="lazy" /> : <span className="msgr-torrent-fallback">🎬</span>}
      <span className="msgr-torrent-body">
        <strong>{d.name}</strong>
        <span className="muted">{[category, d.year, d.resolution, d.size ? formatBytes(d.size) : null].filter(Boolean).join(' · ')}</span>
        <span className="msgr-torrent-stats"><HealthDot seeders={d.seeders ?? 0} /><span style={{ color: 'var(--success)' }}>{d.seeders ?? 0}</span> / <span style={{ color: 'var(--danger)' }}>{d.leechers ?? 0}</span></span>
      </span>
    </Link>
  );
}
