import { Link } from 'react-router-dom';
import { api } from '../api/client';
import HoverCard from './HoverCard';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { HealthDot } from './TorrentBits';

/** Contenu de l'infobulle d'un torrent : pochette, infos de base et synopsis. */
export function TorrentPreview({ t }: { t: any }) {
  return (
    <>
      {t.coverImage && <img src={t.coverImage} alt="" />}
      <div style={{ minWidth: 0 }}>
        <div className="tip-title">{t.name}</div>
        <div className="tip-meta">{[t.category?.name, t.year, t.resolution, t.language, formatBytes(t.size)].filter(Boolean).join(' · ')}</div>
        <div className="tip-meta">
          <HealthDot seeders={t.seeders} />
          <span style={{ color: 'var(--success)' }}>▲ {t.seeders}</span> · <span style={{ color: 'var(--danger)' }}>▼ {t.leechers}</span> · {timeAgo(t.createdAt)}
        </div>
        <div className="tip-synopsis">{t.synopsis ?? <span className="muted">Pas de synopsis pour ce torrent.</span>}</div>
      </div>
    </>
  );
}

/**
 * Nom de torrent cliquable, partout sur le site : petite pochette à côté du titre (quand on la connaît)
 * et infobulle complète au survol (chargée à la demande).
 */
export default function TorrentLink({ torrent, thumb = true, children }: {
  torrent: { id: string; name: string; coverImage?: string | null };
  thumb?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <HoverCard cacheKey={`torrent:${torrent.id}`} load={() => api.get(`/torrents/${torrent.id}/preview`).then((r) => r.data)} render={(t: any) => <TorrentPreview t={t} />}>
      <Link to={`/torrents/${torrent.id}`} className="torrent-link">
        {thumb && torrent.coverImage && <img src={torrent.coverImage} alt="" className="torrent-link-thumb" />}
        <span>{children ?? torrent.name}</span>
      </Link>
    </HoverCard>
  );
}
