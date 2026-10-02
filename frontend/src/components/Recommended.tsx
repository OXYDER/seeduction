import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { PosterCard } from './TorrentRail';

/**
 * « Offres » de torrents basées sur l'historique du membre (téléchargé, regardé dans le lecteur, mis de côté, noté...).
 * Chaque affiche dit pourquoi on la propose. Se cache toute seule s'il n'y a rien à proposer. Sur une fiche torrent,
 * `basedOn` oriente les offres vers ce qui ressemble à cette fiche. Voir backend/src/torrents/recommendations.service.ts.
 */
export default function Recommended({ title = '✨ Tu pourrais aimer', subtitle = 'Selon ton historique', basedOn, limit = 16 }: { title?: string; subtitle?: string; basedOn?: string; limit?: number }) {
  const [items, setItems] = useState<any[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api.get('/torrents/mine/recommended', { params: { basedOn: basedOn || undefined, limit } })
      .then((r) => { if (!cancelled) setItems(r.data); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [basedOn, limit]);

  if (items !== null && items.length === 0) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <section className="rail-section rail-plex reco-section">
      <div className="rail-head">
        <h2>{title} <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{subtitle}</span></h2>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="secondary rail-btn" onClick={() => scroll(-1)} aria-label="Précédent">‹</button>
          <button type="button" className="secondary rail-btn" onClick={() => scroll(1)} aria-label="Suivant">›</button>
        </div>
      </div>
      <div className="rail" ref={ref}>
        {items === null && Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton-card"><span className="skeleton-poster" /><span className="skeleton-line" /></span>)}
        {items?.map((t) => <PosterCard key={t.id} t={t} />)}
      </div>
    </section>
  );
}
