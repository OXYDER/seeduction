import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Galerie d'images d'une fiche (fonds d'écran d'un film ou d'une série, captures d'un jeu ou d'un logiciel, jaquette arrière d'un album...) :
 * une rangée de vignettes sous l'en-tête, et au clic une visionneuse plein écran (flèches ← →, Échap, glisser du doigt).
 */
export default function TorrentGallery({ images, title = 'Images' }: { images: string[]; title?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const touch = useRef<number | null>(null);
  const n = images.length;
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
  return (
    <section className="panel tg" aria-label={title}>
      <div className="panel-title"><span className="title-icon">🖼️</span>{title}<span className="muted tg-count">{n} images</span></div>
      <div className="tg-strip">
        {images.map((src, i) => (
          <button key={src} type="button" className="tg-thumb" onClick={() => setOpen(i)} aria-label={`Voir l'image ${i + 1} sur ${n}`}>
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && createPortal(
        <div className="tg-lightbox" role="dialog" aria-modal="true" aria-label={`${title} : image ${open + 1} sur ${n}`} onClick={() => setOpen(null)}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const x = touch.current; touch.current = null; if (x !== null) { const dx = e.changedTouches[0].clientX - x; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } }}>
          <button type="button" className="tg-x" aria-label="Fermer" onClick={() => setOpen(null)}>✕</button>
          <button type="button" className="tg-nav prev" aria-label="Image précédente" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
          <img loading="lazy" decoding="async" key={images[open]} src={images[open]} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="tg-nav next" aria-label="Image suivante" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
          <span className="tg-pos">{open + 1} / {n}</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
