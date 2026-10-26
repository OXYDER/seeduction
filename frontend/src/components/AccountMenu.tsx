import TelegramLogo from './TelegramLogo';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Boîte courriel configurée pour ce membre de l'équipe (null : aucune, le lien n'est pas affiché). */
  mail?: { unread: number } | null;
}

/** Menu du compte : ouvert en cliquant sur son nom en haut du menu. Chiffres du compte et liens vers tout ce qui est à soi. */
export default function AccountMenu({ userId, profile, open, onClose, onStatus, canUpload = true, mail = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Le menu du côté s'ouvre en dehors de la colonne (qui peut défiler) : on le place sous le nom, en position fixe.
  // Selon la résolution : la hauteur disponible sous le nom décide si le menu tient sur une colonne ; sinon il passe sur deux colonnes (et défile au besoin), sans jamais sortir de l'écran.
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number; compact: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = document.querySelector('.side-user-card')?.getBoundingClientRect();
      if (!r) return;
      const available = window.innerHeight - (r.bottom + 6) - 10;
      // Une colonne demande ~ 760 px ; en dessous, deux colonnes (si la largeur le permet).
      const compact = available < 760 && window.innerWidth >= 520;
      const width = compact ? 460 : 300;
      let top = r.bottom + 6;
      let maxHeight = available;
      // Écran vraiment court : on remonte le menu pour lui donner plus de place plutôt que de le laisser minuscule.
      if (maxHeight < 320) { top = Math.max(8, window.innerHeight - 330 - 10); maxHeight = window.innerHeight - top - 10; }
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top, maxHeight, compact });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
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
  const links: [string, ReactNode, string][] = [
    ['/profile', '👤', 'Mon profil'],
    ['/referrals', '🎟️', 'Inviter un ami (invitations)'],
    ...(canUpload && userId ? [[`/browse?uploaderId=${userId}`, '⬆️', 'Mes uploads'] as [string, ReactNode, string]] : []),
    ['/activity', '📈', 'Mon activité'],
    ['/recap', '📅', 'Mon récap du mois'],
    ['/series', '🔔', 'Mes séries suivies'],
    ['/seeds', '🌱', 'Mes seeds'],
    ['/hit-and-run', '⚠️', 'Hit & run'],
    ['/favorites', '⭐', 'Favoris'],
    ['/collections', '📚', 'Collections'],
    ['/messages', '✉️', 'Messages'],
    ['/requests', '💬', 'Mes demandes'],
    ['/bonus', '🎁', 'Boutique bonus'],
    ['/friends', '👫', 'Amis'],
    ['/integrations', '🔌', 'API & flux RSS'],
    ['/telegram', <TelegramLogo size={16} />, 'Telegram'],
    ['/achievements', '🏅', 'Mes réalisations'],
    ['/alerts', '🔔', 'Mes alertes'],
    ['/wiki', '📖', 'Wiki'],
  ];
  const mailLink: [string, ReactNode, string] = ['/courriel', '📬', 'Courriel'];

  // Dans <body> : la colonne du menu coupe tout ce qui dépasse (et un parent transformé casse la position fixe).
  return createPortal(
    <div className={`account-menu${pos?.compact ? ' compact' : ''}`} ref={ref} role="menu" aria-label="Menu du compte" style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}>
      {profile && !['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(profile.role) && (
        <div className="account-stats">
          <Link to="/profile" onClick={onClose}><span className="muted">Ratio</span><strong style={{ color: profile.ratio != null && profile.ratio < 1 ? 'var(--danger)' : 'var(--success)' }}>{profile.ratio != null ? profile.ratio.toFixed(2) : '∞'}</strong></Link>
          <Link to="/profile" onClick={onClose}><span className="muted">Upload</span><strong style={{ color: 'var(--success)' }}>{formatBytes(profile.uploaded)}</strong></Link>
          <Link to="/profile" onClick={onClose}><span className="muted">Téléchargé</span><strong style={{ color: 'var(--danger)' }}>{formatBytes(profile.downloaded)}</strong></Link>
          <Link to="/bonus" onClick={onClose}><span className="muted">Points bonus</span><strong style={{ color: '#fbbf24' }}>{formatNumber(Math.round(profile.bonusPoints))}</strong></Link>
        </div>
      )}
      <div className="account-links">
        {mail && (
          <Link to={mailLink[0]} role="menuitem" onClick={onClose}><span aria-hidden>{mailLink[1]}</span>{mailLink[2]}{mail.unread > 0 && <span className="side-badge red" style={{ marginLeft: 'auto' }} title={`${mail.unread} courriel${mail.unread > 1 ? 's' : ''} non lu${mail.unread > 1 ? 's' : ''}`}>{mail.unread > 99 ? '99+' : mail.unread}</span>}</Link>
        )}
        {links.map(([to, icon, label]) => (
          <Link key={to} to={to} role="menuitem" onClick={onClose}><span aria-hidden>{icon}</span>{label}</Link>
        ))}
        <button type="button" role="menuitem" onClick={onStatus}><span aria-hidden>🟢</span>Changer mon statut</button>
      </div>
    </div>,
    document.body,
  );
}
