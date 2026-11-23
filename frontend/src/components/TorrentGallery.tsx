import Emo from './Emo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TrailerPlayer, { hasTrailer, trailerPoster, type Trailer } from './TrailerPlayer';

/**
 * Galerie d'images d'une fiche (fonds d'écran d'un film ou d'une série, captures d'un jeu ou d'un logiciel, jaquette arrière d'un album...) :
 * une rangée de vignettes sous l'en-tête, et au clic une visionneuse plein écran (flèches ← →, Échap, glisser du doigt).
 */
export default function TorrentGallery({ images, title = 'Images', trailer }: { images: string[]; title?: string; /** Bande-annonce de la fiche, quand elle existe : première vignette de la galerie. */ trailer?: Trailer | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const touch = useRef<number | null>(null);
  const video = hasTrailer(trailer) ? trailer : null;
  const items: { src: string | null; video?: Trailer }[] = [...(video ? [{ src: trailerPoster(video), video }] : []), ...images.map((src) => ({ src }))];
  const n = items.length;
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);

  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [open, go]);

  if (n < 2) return null;
  const cur = open === null ? null : items[open];
  return (
    <section className="panel tg" aria-label={title}>
      <div className="panel-title"><span className="title-icon"><Emo e="🖼️" size={16} /></span>{title}<span className="muted tg-count">{video ? `${images.length} image${images.length > 1 ? 's' : ''} et une bande-annonce` : `${n} images`}</span></div>
      <div className="tg-strip">
        {items.map((it, i) => (
          <button key={it.video ? 'trailer' : it.src} type="button" className={`tg-thumb${it.video ? ' tg-video' : ''}`} onClick={() => setOpen(i)} aria-label={it.video ? 'Voir la bande-annonce' : `Voir l'image ${i + 1 - (video ? 1 : 0)} sur ${images.length}`}>
            {it.src ? <img src={it.src} alt="" loading="lazy" /> : <span className="tg-novid" aria-hidden="true" />}
            {it.video && <span className="tg-play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg><em>Bande-annonce</em></span>}
          </button>
        ))}
      </div>
      {open !== null && createPortal(
        <div className="tg-lightbox" role="dialog" aria-modal="true" aria-label={`${title} : ${cur?.video ? 'bande-annonce' : `élément ${open + 1} sur ${n}`}`} onClick={() => setOpen(null)}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const x = touch.current; touch.current = null; if (x !== null) { const dx = e.changedTouches[0].clientX - x; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } }}>
          <button type="button" className="tg-x" aria-label="Fermer" onClick={() => setOpen(null)}>✕</button>
          <button type="button" className="tg-nav prev" aria-label="Image précédente" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
          {cur?.video
            ? <div className="tg-player" onClick={(e) => e.stopPropagation()}><TrailerPlayer trailer={cur.video} /></div>
            : <img loading="lazy" decoding="async" key={cur?.src ?? open} src={cur?.src ?? ''} alt="" onClick={(e) => e.stopPropagation()} />}
          <button type="button" className="tg-nav next" aria-label="Image suivante" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
          <span className="tg-pos">{open + 1} / {n}</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
