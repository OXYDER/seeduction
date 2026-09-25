import { RefObject, useEffect, useState } from 'react';
import CategoryTag from './CategoryTag';
import { FavoriteStar } from './TorrentBits';

/**
 * Barre collée en haut de l'écran (catégorie, titre, favori, télécharger) qui apparaît quand le bouton de
 * téléchargement principal (repéré par `anchorRef`) sort du haut de l'écran en défilant — pratique sur une longue fiche.
 */
export default function StickyDownloadBar({
  torrent, anchorRef, onDownload, favoriteEnabled, favorite, onToggleFavorite,
}: {
  torrent: { id: string; name: string; category?: any };
  anchorRef: RefObject<HTMLElement>;
  onDownload: () => void;
  favoriteEnabled: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchorRef]);

  return (
    <div className={`sticky-dl-bar${visible ? ' show' : ''}`}>
      <div className="sticky-dl-inner">
        <CategoryTag category={torrent.category} />
        <span className="sticky-dl-title">{torrent.name}</span>
        <div className="row" style={{ gap: 8, flexShrink: 0 }}>
          {favoriteEnabled && <FavoriteStar active={favorite} onToggle={onToggleFavorite} size={22} />}
          <button type="button" className="download-btn" onClick={onDownload}>⬇ Télécharger</button>
        </div>
      </div>
    </div>
  );
}
