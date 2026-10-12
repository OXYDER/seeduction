import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Cadre déroulant des icônes du haut (cloche, thèmes, seeds, amis...) : affiché dans <body> en position fixe, à partir de la position réelle du bouton. Il reste donc
 * toujours dans la partie visible de l'écran (sur téléphone, il occupe la largeur de l'écran avec une petite marge, au lieu de déborder à gauche), se ferme au clic
 * à l'extérieur, avec Échap, et suit le défilement et le redimensionnement.
 */
export default function HeaderPopover({ open, anchorRef, onClose, width = 380, label, children }: {
  open: boolean; anchorRef: RefObject<HTMLElement | null>; onClose: () => void; width?: number; label: string; children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = useCallback(() => {
    const b = anchorRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const margin = 8;
    const w = vw <= 640 ? vw - margin * 2 : Math.min(width, vw - margin * 2);
    const left = vw <= 640 ? margin : Math.max(margin, Math.min(b.right - w, vw - w - margin));
    setPos({ top: Math.round(b.bottom + 8), left, width: w });
  }, [anchorRef, width]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={panelRef} className="hp-panel" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100dvh - ${pos.top}px - 12px)` }}>
      {children}
    </div>,
    document.body,
  );
}
