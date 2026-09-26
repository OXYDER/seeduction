import { Link } from 'react-router-dom';
import { api } from '../api/client';
import HoverCard from './HoverCard';
import { formatBytes, formatRuntime } from '../lib/format';
import { timeAgo } from '../lib/time';
import { HealthDot } from './TorrentBits';

/** Contenu de l'infobulle d'un torrent : pochette, note, infos de base, casting et synopsis. */
export function TorrentPreview({ t }: { t: any }) {
  const runtime = formatRuntime(t.runtime);
  return (
    <>
      {t.coverImage && <img src={t.coverImage} alt="" />}
      <div style={{ minWidth: 0 }}>
        <div className="tip-title">{t.name}</div>
        <div className="tip-meta">
          {t.rating != null && <span className="tip-rating">★ {t.rating.toFixed(1)}</span>}
          {[t.category?.name, t.year, runtime, t.resolution, t.language, formatBytes(t.size)].filter(Boolean).join(' · ')}
        </div>
        {(t.director || t.cast?.length > 0) && (
          <div className="tip-meta tip-credits">
            {t.director && <div><span className="muted">Réalisation :</span> {t.director}</div>}
            {t.cast?.length > 0 && <div><span className="muted">Avec :</span> {t.cast.join(', ')}</div>}
          </div>
        )}
        {t.genres?.length > 0 && (
          <div className="tip-genres">{t.genres.slice(0, 4).map((g: string) => <span key={g} className="tip-genre-chip">{g}</span>)}</div>
        )}
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
