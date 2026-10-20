import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

export interface TipRow { label: string; value: ReactNode; sub?: string; tone?: 'up' | 'down' | 'gold' }

/** Contenu d'une infobulle de statistique : titre, phrase d'explication, lignes de chiffres, note et lien. */
export function TipCard({ icon, title, intro, rows, note, link }: { icon: string; title: string; intro?: string; rows?: TipRow[]; note?: ReactNode; link?: { to: string; label: string } }) {
  return (
    <div className="stat-tip-card">
      <div className="stat-tip-title"><span aria-hidden>{icon}</span> {title}</div>
      {intro && <div className="stat-tip-intro">{intro}</div>}
      {rows && rows.length > 0 && (
        <div className="stat-tip-rows">
          {rows.map((r) => (
            <div key={r.label} className="stat-tip-row">
              <span className="stat-tip-label">{r.label}</span>
              <span className={`stat-tip-value${r.tone ? ' ' + r.tone : ''}`}>{r.value}{r.sub && <small>{r.sub}</small>}</span>
            </div>
          ))}
        </div>
      )}
      {note && <div className="stat-tip-note">{note}</div>}
      {link && <Link to={link.to} className="stat-tip-link">{link.label}</Link>}
    </div>
  );
}

/**
 * Infobulle riche des statistiques du haut du site (ratio, upload, marge de téléchargement, points...) : au survol (ou au clavier), une carte explique le chiffre.
 * Affichée dans <body> en position fixe, toujours dans l'écran ; elle reste ouverte quand on passe la souris dessus (pour cliquer son lien).
 */
export default function StatTip({ children, card, width = 320 }: { children: ReactElement; card: ReactNode; width?: number }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const timer = useRef(0);

  const show = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 120); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 160); };

  const place = useCallback(() => {
    const b = anchor.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth, margin = 8;
    const w = Math.min(width, vw - margin * 2);
    setPos({ top: Math.round(b.bottom + 8), left: Math.max(margin, Math.min(b.left + b.width / 2 - w / 2, vw - w - margin)), width: w });
  }, [width]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', () => setOpen(false), true);
    document.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('keydown', onKey); };
  }, [open, place]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <span ref={anchor} className="stat-tip-anchor" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>{children}</span>
      {open && pos && createPortal(
        <div className="stat-tip" role="tooltip" style={{ top: pos.top, left: pos.left, width: pos.width }} onMouseEnter={show} onMouseLeave={hide}>{card}</div>,
        document.body,
      )}
    </>
  );
}
