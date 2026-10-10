import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { formatBytes, formatNumber } from '../lib/format';

interface Props {
  userId?: string;
  profile: any;
  open: boolean;
  onClose: () => void;
  onStatus: () => void;
  /** Le sélecteur de profil est affiché ailleurs ; ici seulement les liens du compte. */
  canUpload?: boolean;
}

/** Menu du compte : ouvert en cliquant sur son nom en haut du menu. Chiffres du compte et liens vers tout ce qui est à soi. */
export default function AccountMenu({ userId, profile, open, onClose, onStatus, canUpload = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Le menu du côté s'ouvre en dehors de la colonne (qui peut défiler) : on le place sous le nom, en position fixe.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = document.querySelector('.side-user-card')?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 308)), top: r.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.side-user-card')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [open, onClose]);

  if (!open) return null;
  const links: [string, string, string][] = [
    ['/profile', '👤', 'Mon profil'],
    ...(canUpload && userId ? [[`/browse?uploaderId=${userId}`, '⬆️', 'Mes uploads'] as [string, string, string]] : []),
    ['/activity', '📈', 'Mon activité'],
    ['/seeds', '🌱', 'Mes seeds'],
    ['/hit-and-run', '⚠️', 'Hit & run'],
    ['/favorites', '⭐', 'Favoris'],
    ['/collections', '📚', 'Collections'],
    ['/messages', '✉️', 'Messages'],
    ['/requests', '💬', 'Mes demandes'],
    ['/bonus', '🎁', 'Boutique bonus'],
    ['/friends', '👫', 'Amis'],
    ['/integrations', '🔌', 'API & flux RSS'],
    ['/telegram', '✈️', 'Telegram'],
    ['/wiki', '📖', 'Wiki'],
  ];

  // Dans <body> : la colonne du menu coupe tout ce qui dépasse (et un parent transformé casse la position fixe).
  return createPortal(
    <div className="account-menu" ref={ref} role="menu" aria-label="Menu du compte" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      {profile && (
        <div className="account-stats">
          <Link to="/profile" onClick={onClose}><span className="muted">Ratio</span><strong>{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</strong></Link>
          <Link to="/profile" onClick={onClose}><span className="muted">Upload</span><strong style={{ color: 'var(--success)' }}>{formatBytes(profile.uploaded)}</strong></Link>
          <Link to="/profile" onClick={onClose}><span className="muted">Téléchargé</span><strong style={{ color: 'var(--danger)' }}>{formatBytes(profile.downloaded)}</strong></Link>
          <Link to="/bonus" onClick={onClose}><span className="muted">Points bonus</span><strong style={{ color: '#fbbf24' }}>{formatNumber(Math.round(profile.bonusPoints))}</strong></Link>
        </div>
      )}
      <div className="account-links">
        {links.map(([to, icon, label]) => (
          <Link key={to} to={to} role="menuitem" onClick={onClose}><span aria-hidden>{icon}</span>{label}</Link>
        ))}
        <button type="button" role="menuitem" onClick={onStatus}><span aria-hidden>🟢</span>Changer mon statut</button>
      </div>
    </div>,
    document.body,
  );
}
