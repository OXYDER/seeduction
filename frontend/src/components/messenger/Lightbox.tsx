import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Image en grand par-dessus la page (Échap ou clic pour fermer). */
export default function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="msgr-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className="msgr-lightbox-close" onClick={onClose} aria-label="Fermer">✕</button>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
      <a href={src} target="_blank" rel="noopener noreferrer" className="msgr-lightbox-open" onClick={(e) => e.stopPropagation()}>Ouvrir l'original ↗</a>
    </div>,
    document.body,
  );
}
