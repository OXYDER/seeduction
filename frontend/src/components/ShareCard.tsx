import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';

export type BarKind = 'seeding' | 'done' | 'idle' | 'hnr' | 'dl';

/**
 * Une carte « partage » : pochette, nom, barre de progression, détails et pastilles d'état. C'est le style de référence de « Mes seeds », repris partout où
 * le membre voit ses seeds, ses téléchargements en cours ou terminés et ses envois (Mes seeds, Mon activité).
 */
export default function ShareCard({ id, name, cover, bar, sub, chips }: { id: string; name: string; cover: string | null; bar?: { pct: number; kind: BarKind }; sub: ReactNode; chips?: ReactNode }) {
  return (
    <Link to={`/torrents/${id}`} className="seedpage-item">
      {cover ? <img src={cover} alt="" className="seedob-cover" loading="lazy" /> : <span className="seedob-cover plain">🎬</span>}
      <span className="seedob-text">
        <span className="seedob-name" style={{ fontSize: 14 }}>{name}</span>
        {bar ? <span className="seedob-bar"><span className={bar.kind} style={{ width: `${Math.max(0, Math.min(100, Math.round(bar.pct)))}%` }} /></span> : <span className="seedob-bar ghost" aria-hidden="true" />}
        <span className="seedob-sub">{sub}</span>
        {chips && <span className="seedpage-chips">{chips}</span>}
      </span>
    </Link>
  );
}

export interface Leech { torrentId: string; name: string; coverImage: string | null; size: number; uploaded: number; downloaded: number; progress: number; lastAnnounceAt: string }

/** Un téléchargement en cours : barre de progression, volumes reçus et envoyés. */
export function LeechCard({ r }: { r: Leech }) {
  const pct = Math.round(r.progress * 100);
  return (
    <ShareCard id={r.torrentId} name={r.name} cover={r.coverImage} bar={{ pct, kind: 'dl' }}
      sub={<>{pct} % · {formatBytes(r.size)} · reçu {formatBytes(r.downloaded)} · envoyé {formatBytes(r.uploaded)} · dernière annonce {timeAgo(r.lastAnnounceAt)}</>}
      chips={<span className="seedpage-chip dl">⬇️ En téléchargement</span>} />
  );
}
